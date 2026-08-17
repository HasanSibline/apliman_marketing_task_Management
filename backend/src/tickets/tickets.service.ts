import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TicketStatus } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AiService } from '../ai/ai.service';

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  private readonly aiServiceUrl: string;

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private httpService: HttpService,
    private configService: ConfigService,
    private aiService: AiService,
  ) {
    this.aiServiceUrl = this.configService.get<string>('AI_SERVICE_URL', 'http://localhost:8001');
  }

  /** Authorization headers sent with every AI service request. */
  private get aiServiceHeaders(): Record<string, string> {
    const secret = this.configService.get<string>('AI_SERVICE_SECRET', '');
    return secret ? { Authorization: `Bearer ${secret}` } : {};
  }

  /**
   * Close a ticket, and record how.
   *
   * The note is required. Resolving used to set a status and leave a system comment
   * announcing that the status had been set, so the one thing worth keeping, what
   * actually fixed it, was never written down anywhere. Somebody hitting the same
   * problem next month had no way to find the answer, and the pre-flight check had
   * nothing better to offer them than the last line of a thread.
   *
   * Asking for a sentence at the moment of closing is the only time it is cheap: the
   * person knows the answer right then and will not know it as well later.
   */
  async resolve(id: string, userId: string, companyId: string, resolutionNote?: string) {
    const ticket = await this.findOne(id, companyId);

    // Only assignee or manager can resolve
    const isAdmin = ['COMPANY_ADMIN', 'SUPER_ADMIN'].includes((await this.prisma.user.findUnique({ where: { id: userId } }))?.role || '');
    if (ticket.assigneeId !== userId && !isAdmin) {
      throw new ForbiddenException('Only the assigned resource or an admin can finalize this engagement');
    }

    const note = (resolutionNote ?? '').trim();
    if (note.length < 10) {
      throw new BadRequestException(
        'Say how this was resolved, in a sentence. It is what the next person with this problem will read.',
      );
    }

    const updated = await this.prisma.ticket.update({
      where: { id },
      data: { status: 'RESOLVED', resolutionNote: note },
    });

    // Written to the thread as well as the column. The column is what gets read by
    // machinery; the comment is what a person scrolling the ticket expects to find.
    await this.addComment(id, userId, note, companyId, false);
    await this.addSystemComment(id, userId, 'Resolved', companyId);

    // Notify requester that the goal is finalized
    await this.notifications.createNotification({
      userId: ticket.requesterId,
      ticketId: id,
      type: 'TICKET_RESOLVED',
      title: 'Engagement Finalized',
      message: `The objectives for ticket ${ticket.ticketNumber} have been successfully localized and resolved.`,
      actionUrl: `/tickets/${id}`
    });

    return updated;
  }

  /**
   * @param statusType `HISTORY` for resolved and cancelled, `ALL` for both, and
   *   anything else for the open ones. The default hides finished tickets, which is
   *   right for the tickets page and wrong for anything that needs to name one:
   *   referring to a ticket that was resolved last week is an ordinary thing to do.
   * @param limit overrides the page size, for callers building a picker rather than
   *   a page. Capped, because an uncapped limit is a way to ask for the whole table.
   */
  async findAll(companyId: string, userId: string, role: string, page: number = 1, departmentId?: string, search?: string, statusType?: string, limit?: number) {
    const isAdmin = ['COMPANY_ADMIN', 'SUPER_ADMIN'].includes(role);
    // A page number or limit that does not parse arrives as NaN, and NaN survives
    // both ?? and Math.min/max, so it reached Prisma as take: NaN and threw a 500.
    const safeLimit = Number.isFinite(limit) ? Number(limit) : 10;
    const safePage = Number.isFinite(page) && page > 0 ? Number(page) : 1;
    const take = Math.min(Math.max(safeLimit, 1), 200);
    const skip = (safePage - 1) * take;

    const historyStatuses: TicketStatus[] = [TicketStatus.RESOLVED, TicketStatus.CANCELLED];

    /**
     * Every clause is its own entry in an AND.
     *
     * These were spread as sibling keys on one object, and three of them were called
     * OR, so the last one written silently replaced the ones before it. The
     * permission clause is first, so searching or filtering by department overwrote
     * it: an employee who typed anything into the search box was shown every matching
     * ticket in the company, including ones they have no part in. It read as a filter
     * and behaved as a way around the filter that mattered.
     */
    const clauses: any[] = [{ companyId }];

    if (!isAdmin) {
      clauses.push({
        OR: [
          { requesterId: userId },
          { requesterManagerId: userId },
          { receiverManagerId: userId },
          { assigneeId: userId },
          { assignments: { some: { userId } } },
          { receiverDept: { managerId: userId } },
        ],
      });
    }

    if (statusType === 'HISTORY') {
      clauses.push({ status: { in: historyStatuses } });
    } else if (statusType !== 'ALL') {
      clauses.push({ status: { notIn: historyStatuses } });
    }

    if (departmentId) {
      clauses.push({
        OR: [{ requester: { departmentId } }, { receiverDeptId: departmentId }],
      });
    }

    if (search) {
      clauses.push({
        OR: [
          { title: { contains: search, mode: 'insensitive' as any } },
          { ticketNumber: { contains: search, mode: 'insensitive' as any } },
          { requester: { name: { contains: search, mode: 'insensitive' as any } } },
        ],
      });
    }

    const where: any = { AND: clauses };

    const [tickets, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        include: {
          requester: { select: { id: true, name: true, department: { select: { name: true } } } },
          requesterManager: { select: { id: true, name: true } },
          receiverDept: { include: { manager: { select: { id: true, name: true } } } },
          receiverManager: { select: { id: true, name: true } },
          assignee: { select: { id: true, name: true } },
          assignments: { where: { userId }, select: { id: true, status: true, userId: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.ticket.count({ where })
    ]);

    return { tickets, total };
  }

  async findOne(id: string, companyId: string, requestingUserId?: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: {
        requester: { select: { id: true, name: true, avatar: true } },
        requesterManager: { select: { id: true, name: true } },
        receiverManager: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true, avatar: true } },
        assignments: { include: { user: { select: { id: true, name: true, avatar: true } } } },
        receiverDept: { include: { manager: { select: { id: true, name: true } } } },
        comments: {
          include: { user: { select: { id: true, name: true, avatar: true } } },
          orderBy: { createdAt: 'asc' }
        },
        attachments: {
          orderBy: { uploadedAt: 'desc' },
        },
        task: { select: { id: true, taskNumber: true } }
      }
    });

    if (!ticket || ticket.companyId !== companyId) {
      throw new NotFoundException('Ticket not found');
    }

    // If a userId is provided, verify the user is authorized to view this ticket.
    // Admins see all tickets; regular users must be linked to it.
    if (requestingUserId) {
      const requesterUser = await this.prisma.user.findUnique({
        where: { id: requestingUserId },
        select: { role: true }
      });
      const isAdmin = ['COMPANY_ADMIN', 'SUPER_ADMIN', 'ADMIN'].includes(requesterUser?.role || '');

      if (!isAdmin) {
        const isRelated =
          ticket.requesterId === requestingUserId ||
          ticket.requesterManagerId === requestingUserId ||
          ticket.receiverManagerId === requestingUserId ||
          ticket.assigneeId === requestingUserId ||
          (ticket as any).receiverDept?.managerId === requestingUserId ||
          ticket.assignments?.some((a: any) => a.userId === requestingUserId);

        if (!isRelated) {
          throw new ForbiddenException('You do not have access to this ticket.');
        }
      }
    }

    return ticket;
  }

  /**
   * What a person should know before they raise this ticket.
   *
   * Checked before the ticket exists rather than after, because after is too late to
   * be useful: telling somebody they have just filed a duplicate leaves two tickets,
   * two people working, and one of them wasted. The whole value is in the moment
   * between deciding to ask and having asked.
   *
   * The matching is ordinary word overlap, not a model. Titles here are short and
   * concrete, the same request tends to be worded the same way twice, and a count of
   * shared words is instant, free, explainable and identical on every run. A model
   * would be none of those and would occasionally hallucinate a match.
   */
  async preflight(
    companyId: string,
    userId: string,
    draft: { title: string; description?: string; receiverDeptId?: string; category?: string },
  ) {
    const title = (draft.title ?? '').trim();
    if (!title) return { similar: [], note: '', aiWritten: false };

    // Words worth matching on. Anything two letters or shorter, and the handful of
    // words every request contains, carry no signal and would match everything.
    const NOISE = new Set([
      'the', 'and', 'for', 'with', 'this', 'that', 'from', 'need', 'please', 'can',
      'you', 'our', 'new', 'about', 'have', 'has', 'want', 'would', 'like', 'get',
      'request', 'ticket', 'help', 'issue', 'all', 'any', 'not', 'are', 'was',
    ]);
    const terms = (s: string) =>
      new Set(
        s
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter((w) => w.length > 2 && !NOISE.has(w)),
      );

    const mine = terms(title);
    if (mine.size === 0) return { similar: [], note: '', aiWritten: false };

    // Scoped to the department being asked, and to the last ninety days. The same
    // request to two different departments is two different requests, and a ticket
    // from last year is history rather than a duplicate.
    const since = new Date(Date.now() - 90 * 86_400_000);
    const candidates = await this.prisma.ticket.findMany({
      where: {
        companyId,
        isArchived: false,
        createdAt: { gte: since },
        ...(draft.receiverDeptId ? { receiverDeptId: draft.receiverDeptId } : {}),
      },
      select: {
        id: true,
        ticketNumber: true,
        title: true,
        status: true,
        createdAt: true,
        resolutionNote: true,
        cancellationReason: true,
        requester: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const scored = candidates
      .map((t) => {
        const theirs = terms(t.title ?? '');
        const shared = [...mine].filter((w) => theirs.has(w)).length;
        // Measured against the shorter title, so a short request still matches a long
        // one that contains it. Dividing by the union would bury exactly that case.
        const denominator = Math.min(mine.size, theirs.size) || 1;
        return { ticket: t, score: shared / denominator, shared };
      })
      /**
       * The floor scales with how many words there are to share.
       *
       * A flat "two shared words" made short titles unmatchable: a request called
       * "test" has one meaningful word, so shared could never reach two and the check
       * reported every repeat of it as new. Two remains the floor for a title with
       * enough words to have two, and a one-word title has to match that one word
       * outright, which the score threshold already demands.
       */
      .filter((s) => s.shared >= Math.min(2, mine.size) && s.score >= 0.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    /**
     * How the closed ones ended, in the words of whoever closed them.
     *
     * Read from the ticket's own columns rather than inferred from the tail of its
     * conversation. Both are written at the moment of closing, when the person knows
     * the answer, so this is a record rather than a guess. Older tickets closed before
     * those columns existed simply have nothing, which is the honest outcome: showing
     * an unrelated last comment as "how it was solved" is worse than showing nothing.
     *
     * A cancellation matters as much as a resolution here. Knowing a request was turned
     * down, and why, is exactly what somebody about to make it again needs.
     */
    const similar = scored.map(({ ticket }) => ({
      ticketNumber: ticket.ticketNumber,
      title: ticket.title,
      status: ticket.status,
      createdAt: ticket.createdAt,
      requesterName: ticket.requester?.name ?? 'Someone',
      /** Their own earlier ticket reads differently from a colleague's. */
      mine: ticket.requester?.id === userId,
      open: !['RESOLVED', 'CANCELLED'].includes(ticket.status as string),
      cancelled: ticket.status === 'CANCELLED',
      /** Trimmed: a dialog is not the place for an essay. */
      resolution: ticket.resolutionNote?.slice(0, 400) ?? null,
      cancelReason: ticket.cancellationReason?.slice(0, 400) ?? null,
    }));

    /**
     * The note, composed here so it is always right, and only phrased by the model.
     *
     * Facts about the draft come from the draft; facts about duplicates come from the
     * query. The model is given both as counts and short titles and asked to write two
     * sentences, so it can be warmer than a template without being in a position to
     * invent a ticket number or a status.
     */
    const dept = draft.receiverDeptId
      ? await this.prisma.department.findUnique({
          where: { id: draft.receiverDeptId },
          select: { name: true },
        })
      : null;

    const openMatches = similar.filter((s) => s.open);
    const parts: string[] = [];

    parts.push(
      dept?.name
        ? `This goes to ${dept.name}${draft.category ? ` as a ${draft.category.toLowerCase()} request` : ''}.`
        : 'This goes to the department you picked.',
    );

    if (openMatches.length) {
      const first = openMatches[0];
      parts.push(
        openMatches.length === 1
          ? `${first.ticketNumber} looks like the same thing and is still open${first.mine ? ', and you raised it' : `, raised by ${first.requesterName}`}. Worth adding to that one instead of starting a second.`
          : `${openMatches.length} similar requests are still open, the closest being ${first.ticketNumber}. Worth checking those before adding another.`,
      );
    } else if (similar.length) {
      const closed = similar[0];

      if (closed.cancelled) {
        // A refusal is worth more warning than a fix. Raising a request that was
        // already turned down wastes the asker's time and the decider's twice over.
        parts.push(`${closed.ticketNumber} asked for this before and was cancelled.`);
        parts.push(
          closed.cancelReason
            ? `The reason given was: "${closed.cancelReason}"`
            : 'No reason was recorded.',
        );
        parts.push('Raise it again if something has changed since, and say what.');
      } else if (closed.resolution) {
        // The answer, when there is one, is the most useful sentence in this dialog:
        // it may mean the request does not need raising at all.
        parts.push(`${closed.ticketNumber} asked the same thing and was resolved.`);
        parts.push(`It was solved by: "${closed.resolution}"`);
        parts.push('If that works for you too, you can close this without sending anything.');
      } else {
        parts.push(
          `Something similar was asked before, ${closed.ticketNumber}, and it is already closed. Nobody recorded how it ended.`,
        );
      }
    } else {
      parts.push('Nothing like it has been asked in the last three months, so this looks new.');
    }

    let note = parts.join(' ');
    let aiWritten = false;

    try {
      const credential = await this.aiService.resolveAiCredential(userId);
      if (credential) {
        const facts = [
          `Department receiving it: ${dept?.name ?? 'unknown'}`,
          `Category: ${draft.category || 'none chosen'}`,
          `Similar requests still open: ${openMatches.length}`,
          `Similar requests already closed: ${similar.length - openMatches.length}`,
          ...similar.map(
            (s) =>
              `Match ${s.ticketNumber}: "${s.title}" (${s.open ? 'open' : s.cancelled ? 'cancelled' : 'resolved'}${s.mine ? ', raised by this same person' : ''})` +
              (s.resolution ? `\n  How it was solved: "${s.resolution}"` : '') +
              (s.cancelReason ? `\n  Why it was cancelled: "${s.cancelReason}"` : ''),
          ),
        ].join('\n');

        const response = await this.httpService.axiosRef.post(
          `${this.aiServiceUrl}/ticket-check`,
          {
            draftTitle: title,
            facts,
            api_key: credential.apiKey,
            provider: credential.provider,
            model: credential.model ?? undefined,
          },
          { headers: this.aiServiceHeaders, timeout: 15000 },
        );

        const written: string = response.data?.note?.trim() ?? '';
        // Same two guards as the day brief: a model can restate its instructions, and
        // one writing about the reader rather than to them has missed the point.
        const echoes = /^(write|create|generate|compose|draft|summari[sz]e|produce)\b/i.test(written);
        const notSpokenToThem = written.length > 0 && !/\byou(r|rs)?\b/i.test(written);
        if (written && !echoes && !notSpokenToThem) {
          note = written;
          aiWritten = true;
        }
      }
    } catch (error) {
      this.logger?.warn?.(`Ticket preflight fell back to composed text: ${error.message}`);
    }

    return { similar, note, aiWritten };
  }

  async create(companyId: string, userId: string, data: {
    title: string;
    description: string;
    receiverDeptId: string;
    assigneeId?: string;
    isInternal?: boolean;
    type?: string;
    category?: string;
    priority?: string;
    amount?: number;
    providerName?: string;
    deadline?: string;
    requiresApproval?: boolean;
    approverId?: string;
  }) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { department: true }
    });
    if (!user) throw new NotFoundException('User not found');

    const ticketNumber = await this.generateTicketNumber(companyId);
    const receiverDept = await this.prisma.department.findUnique({ where: { id: data.receiverDeptId } });
    const isSameDept = user.departmentId === data.receiverDeptId;

    // VALIDATION: If no approval is required, a target personnel MUST be assigned
    if (!data.requiresApproval && !data.assigneeId) {
      throw new BadRequestException('Target Personnel is required when manager approval is not requested.');
    }

    // Determine initial status:
    // 1. If requiresApproval is true, wait for Receiver Manager
    // 2. Otherwise, status is OPEN
    let initialStatus: TicketStatus = TicketStatus.OPEN;
    if (data.requiresApproval) {
      initialStatus = TicketStatus.PENDING_REC_MGR;
    }

    const squad: any[] = [{ userId: userId, status: 'ACCEPTED' }];
    
    // Add targeted manager/assignee as PENDING
    if (data.requiresApproval) {
      const targetApprover = data.approverId || receiverDept?.managerId;
      if (targetApprover && targetApprover !== userId) {
        squad.push({ userId: targetApprover, status: 'PENDING' });
      }
    } else if (data.assigneeId) {
      if (data.assigneeId !== userId) {
        squad.push({ userId: data.assigneeId, status: 'PENDING' });
      }
    }

    /**
     * The category has to be one this department actually offers.
     *
     * And the enum has to be one that exists. `type` was cast to any and written
     * straight through, so four of the seven entries the picker offered, HR Request,
     * Sales / Lead, Product / Dev Issue and QA / Bug, were not values of TicketType
     * at all: choosing one failed to create the ticket, and the cast is precisely
     * what stopped the compiler saying so.
     */
    const allowedTypes = [
      'GENERAL', 'PURCHASE_ORDER', 'IT_SUPPORT',
      'DESIGN_REQUEST', 'LEGAL_CONTRACT', 'MARKETING_ASSET',
    ];
    const safeType = allowedTypes.includes(String(data.type)) ? String(data.type) : 'GENERAL';

    const offered = receiverDept?.ticketCategories ?? [];
    if (data.category && offered.length > 0 && !offered.includes(data.category)) {
      throw new BadRequestException(
        `${receiverDept?.name ?? 'That department'} does not take "${data.category}" requests.`,
      );
    }

    const ticket = await this.prisma.ticket.create({
      data: {
        companyId,
        ticketNumber,
        title: data.title,
        description: data.description,
        type: safeType as any,
        category: data.category?.trim() || null,
        priority: data.priority || 'MEDIUM',
        receiverDeptId: data.receiverDeptId,
        assigneeId: data.assigneeId || null,
        requesterId: userId,
        receiverManagerId: data.requiresApproval ? (data.approverId || receiverDept?.managerId || null) : (receiverDept?.managerId || null),
        isInternal: data.isInternal || isSameDept || false,
        amount: data.amount ? parseFloat(data.amount.toString()) : null,
        providerName: data.providerName || null,
        deadline: data.deadline ? new Date(data.deadline) : null,
        status: initialStatus,
        assignments: {
          create: squad
        }
      },
      include: {
        receiverDept: true,
        requester: true
      }
    });

    /**
     * The first line of the thread, in a sentence.
     *
     * This was four lines of shouted labels, "Ticket Initialization: TKT-1003
     * established. PRIORITY: URGENT. LOGISTICAL TARGET: IT. CONTEXT: test", repeating
     * the title and the department that the page already shows twice above it. A
     * system line should say the one thing the page does not: what was asked for and
     * how urgently. The timestamp beside it already says when.
     */
    const priority = (data.priority || 'MEDIUM').toLowerCase();
    // The category is already a noun phrase a department chose, and half of them end
    // in "request", so wrapping it in "a … request" produced "a general request
    // request". Quoted and left as written instead. Trimmed to match what is stored,
    // or a category of spaces persists as null and still reads as though it were set.
    const category = data.category?.trim();
    const summary = category
      ? `Raised for ${receiverDept?.name ?? 'the team'} as "${category}", ${priority} priority.`
      : `Raised for ${receiverDept?.name ?? 'the team'}, ${priority} priority.`;
    await this.addSystemComment(ticket.id, userId, summary, companyId);

    // Notify for tactical authorizations if required
    const targetApproverId = ticket.receiverManagerId;
    if (initialStatus === TicketStatus.PENDING_REC_MGR && targetApproverId) {
      await this.notifications.createNotification({
        userId: targetApproverId,
        ticketId: ticket.id,
        type: 'TICKET_APPROVAL_NEEDED',
        title: 'Authorization Requested',
        message: `${user.name} has initiated an engagement (${ticket.ticketNumber}) that requires your managerial authorization.`,
        actionUrl: `/tickets/${ticket.id}`
      });
    }

    return ticket;
  }

  /**
   * Approve or decline several tickets, one at a time.
   *
   * Deliberately a loop over the single-ticket methods rather than one bulk query.
   * Whether a person may approve a given ticket depends on that ticket, its stage and
   * their relationship to it, and a bulk update written as a single `updateMany`
   * would have to restate all of that in a where clause: a second copy of the rule
   * that would drift from the first and quietly hand people the power to approve
   * things they cannot approve one at a time. Going through the same method means
   * there is only ever one rule.
   *
   * The cost is honesty about partial success. Selecting ten and being allowed six is
   * normal, so each refusal is reported with the reason the single-ticket path gave,
   * rather than the whole batch failing or, worse, appearing to succeed.
   */
  async bulkDecide(
    ids: string[],
    action: 'approve' | 'reject',
    userId: string,
    companyId: string,
    reason?: string,
  ) {
    const done: string[] = [];
    const skipped: { id: string; title: string; reason: string }[] = [];

    // One light read for the labels. findOne pulls the whole comment thread and every
    // attachment, and calling it per ticket alongside the one approve/reject already
    // does was roughly a thousand queries for a hundred ids. It also applies no
    // per-user access check when called without a requesting user, so it would have
    // returned the number of a ticket the caller cannot see, in the reply that says
    // why it was skipped.
    const labels = new Map<string, string>();
    const visible = await this.prisma.ticket.findMany({
      where: { id: { in: ids }, companyId },
      select: { id: true, ticketNumber: true },
    });
    for (const t of visible) labels.set(t.id, t.ticketNumber ?? t.id);

    for (const id of ids.slice(0, 100)) {
      // A ticket from another company is not described, only refused.
      const title = labels.get(id) ?? 'That ticket';

      try {
        if (action === 'approve') {
          await this.approve(id, userId, companyId);
        } else {
          await this.reject(id, userId, companyId, reason);
        }
        done.push(id);
      } catch (error: any) {
        // Only messages written for a reader are shown. A Prisma pool timeout or a
        // constraint name is not an explanation, and putting one in a toast is how
        // the database's own words end up in front of a person.
        const speakable =
          error instanceof BadRequestException ||
          error instanceof ForbiddenException ||
          error instanceof NotFoundException;

        if (!speakable) {
          this.logger.error(`Bulk ${action} failed for ${id}: ${error?.message}`);
        }

        skipped.push({
          id,
          title,
          reason: speakable ? error.message : 'could not be updated',
        });
      }
    }

    return { done: done.length, skipped };
  }

  async approve(id: string, userId: string, companyId: string) {
    const ticket = await this.findOne(id, companyId);

    if (ticket.status === TicketStatus.PENDING_REC_MGR) {
      return this.approveByReceiverManager(id, userId, companyId);
    } else {
      throw new BadRequestException('Ticket is not in an approval stage');
    }
  }

  /**
   * Stop a ticket that is not going to happen, and say why.
   *
   * Distinct from reject, which is a decision on a request awaiting approval. This is
   * abandoning one at any point: the requester changed their mind, it was raised twice,
   * it stopped mattering. The reason is required for the same purpose in both cases —
   * somebody about to raise it again is shown it.
   *
   * The requester may cancel their own, and so may anyone who could act on it. Needing
   * an admin to withdraw your own request is how tickets get left open instead.
   */
  async cancel(id: string, userId: string, companyId: string, reason?: string) {
    const ticket = (await this.findOne(id, companyId)) as any;

    const actor = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    const isAdmin = ['COMPANY_ADMIN', 'SUPER_ADMIN', 'ADMIN'].includes(actor?.role ?? '');
    const isRequester = ticket.requesterId === userId;
    const isAssignee =
      ticket.assigneeId === userId ||
      ticket.assignments?.some((a: any) => a.userId === userId);

    if (!isAdmin && !isRequester && !isAssignee) {
      throw new ForbiddenException('Only the person who raised this, or someone working it, can cancel it.');
    }

    if (['RESOLVED', 'CANCELLED'].includes(ticket.status)) {
      throw new BadRequestException('This ticket is already closed.');
    }

    const why = (reason ?? '').trim();
    if (why.length < 5) {
      throw new BadRequestException('Say why this is being cancelled, briefly.');
    }

    await this.addSystemComment(id, userId, 'Cancelled', companyId);
    await this.addComment(id, userId, why, companyId, false);

    const updated = await this.prisma.ticket.update({
      where: { id },
      data: { status: TicketStatus.CANCELLED, cancellationReason: why },
    });

    // The requester hears about it unless they are the one who did it.
    if (ticket.requesterId !== userId) {
      await this.notifications.createNotification({
        userId: ticket.requesterId,
        ticketId: id,
        type: 'TICKET_REJECTED',
        title: 'Request cancelled',
        message: `${ticket.ticketNumber} was cancelled. Reason: ${why}`,
      });
    }

    return updated;
  }

  async reject(id: string, userId: string, companyId: string, reason?: string) {
    const ticket = await this.findOne(id, companyId) as any;

    /**
     * The same people who may approve may decline.
     *
     * This accepted only the receiver manager, while approving also accepts an admin
     * and anyone marked a ticket approver. Saying yes and saying no to the same
     * request are the same authority, and splitting them left an admin able to
     * approve ten tickets and refused on all ten declines, which is not a stricter
     * rule so much as an accident of two checks written separately.
     */
    const actor = await this.prisma.user.findUnique({ where: { id: userId } });
    const isAdmin = ['COMPANY_ADMIN', 'SUPER_ADMIN'].includes(actor?.role || '');

    const canReject =
      ticket.status === TicketStatus.PENDING_REC_MGR &&
      (isAdmin ||
        actor?.isTicketApprover ||
        ticket.receiverManagerId === userId ||
        ticket.receiverDept?.managerId === userId);

    if (!canReject) {
      throw new ForbiddenException(
        ticket.status === TicketStatus.PENDING_REC_MGR
          ? 'Only the receiving manager or a designated approver can decline this request'
          : 'This request is not waiting for approval',
      );
    }

    // Recorded on the ticket, not only in the thread. Somebody about to raise the same
    // request needs to know it was turned down and why, and reading that off a comment
    // means guessing which comment.
    const why = (reason ?? '').trim();
    await this.addSystemComment(id, userId, 'Cancelled', companyId);
    if (why) await this.addComment(id, userId, why, companyId, false);

    const updated = await this.prisma.ticket.update({
      where: { id },
      data: { status: TicketStatus.CANCELLED, cancellationReason: why || null },
    });

    // Notify the initiator that the ticket was aborted
    await this.notifications.createNotification({
      userId: ticket.requesterId,
      ticketId: id,
      type: 'TICKET_REJECTED',
      title: 'Engagement Aborted',
      message: `Strategic Rejection: Your ticket ${ticket.ticketNumber} was rejected by management. Reason: ${reason || 'Operational Constraints'}`,
      actionUrl: `/tickets/${id}`
    });

    return updated;
  }



  async approveByReceiverManager(id: string, managerId: string, companyId: string) {
    const ticket = await this.findOne(id, companyId);

    // Check if user is the manager of the receiver department or has approval rights
    const manager = await this.prisma.user.findUnique({ where: { id: managerId } });
    const isAdmin = ['COMPANY_ADMIN', 'SUPER_ADMIN'].includes(manager?.role || '');

    if (!manager?.isTicketApprover && ticket.receiverManagerId !== managerId && !isAdmin) {
      throw new ForbiddenException('Only the receiver department manager or designated approver can approve this stage');
    }

    if (ticket.status !== TicketStatus.PENDING_REC_MGR) {
      throw new BadRequestException('Ticket is not in receiver approval stage');
    }

    const updated = await this.prisma.ticket.update({
      where: { id },
      data: { status: TicketStatus.OPEN },
    });

    // Strategy: Also accept the squad invitation for the manager if they are in the squad
    await this.prisma.ticketAssignment.updateMany({
      where: { ticketId: id, userId: managerId, status: 'PENDING' },
      data: { status: 'ACCEPTED' as any }
    });

    await this.addSystemComment(id, managerId, 'Status updated to Open', companyId);

    // Notify the requester that the ticket is now active
    await this.notifications.createNotification({
      userId: ticket.requesterId,
      ticketId: id,
      type: 'TICKET_APPROVED',
      title: 'Strategic Authorization Confirmed',
      message: `All authorizations for ${ticket.ticketNumber} have been localized. The engagement is now ACTIVE.`,
      actionUrl: `/tickets/${id}`
    });

    return updated;
  }

  async assign(id: string, managerId: string, assigneeId: string, companyId: string) {
    const ticket = await this.findOne(id, companyId) as any;

    const exists = ticket.assignments?.some((a: any) => a.userId === assigneeId);
    
    if (!exists) {
      await this.prisma.ticketAssignment.create({
        data: { ticketId: id, userId: assigneeId, status: 'ACCEPTED' as any }
      });
    }

    const updated = await this.prisma.ticket.update({
      where: { id },
      data: {
        assigneeId: ticket.assigneeId || assigneeId,
        status: TicketStatus.ASSIGNED,
      },
    });

    const assignee = await this.prisma.user.findUnique({ where: { id: assigneeId } });
    const manager = await this.prisma.user.findUnique({ where: { id: managerId } });
    await this.addSystemComment(id, managerId, `${assignee?.name} has been added to this ticket by ${manager?.name}`, companyId);

    await this.notifications.createNotification({
      userId: assigneeId,
      ticketId: id,
      type: 'TICKET_ASSIGNED',
      title: 'Squad Deployment',
      message: `You have been deployed to the tactical squad for ticket ${ticket.ticketNumber}.`,
      actionUrl: `/tickets/${id}`
    });

    return updated;
  }

  async invite(id: string, inviterId: string, personId: string, companyId: string) {
    const ticket = await this.findOne(id, companyId) as any;
    const inviter = await this.prisma.user.findUnique({ where: { id: inviterId } });

    const exists = ticket.assignments?.some((a: any) => a.userId === personId);
    if (!exists) {
      await this.prisma.ticketAssignment.create({
        data: { ticketId: id, userId: personId, status: 'PENDING' as any }
      });
    }

    const person = await this.prisma.user.findUnique({ where: { id: personId } });
    await this.addSystemComment(id, inviterId, `${person?.name} has been invited to this ticket by ${inviter?.name}`, companyId);

    await this.notifications.createNotification({
      userId: personId,
      ticketId: id,
      type: 'TICKET_INVITE',
      title: 'Ticket Invitation',
      message: `${inviter?.name} has requested your tactical support on ticket ${ticket.ticketNumber}.`,
      actionUrl: `/tickets/${id}`
    });

    return { success: true };
  }

  async acceptAssignment(ticketId: string, userId: string, companyId: string) {
    const assignment = await this.prisma.ticketAssignment.findUnique({
      where: { ticketId_userId: { ticketId, userId } }
    });

    if (!assignment) throw new NotFoundException('Invitation not found');

    await this.prisma.ticketAssignment.update({
      where: { id: assignment.id },
      data: { status: 'ACCEPTED' as any }
    });

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    await this.addSystemComment(ticketId, userId, `${user?.name} has accepted the invitation and joined the ticket.`, companyId);

    // If status was OPEN, move to ASSIGNED now that we have an active squad member
    const ticket = await this.prisma.ticket.findUnique({ 
        where: { id: ticketId },
        include: { assignments: { where: { status: 'ACCEPTED' } } }
    });
    
    if (ticket && ticket.status === TicketStatus.OPEN && (ticket.assignments?.length || 0) >= 1) {
      await this.prisma.ticket.update({
        where: { id: ticketId },
        data: { status: TicketStatus.ASSIGNED }
      });
      await this.addSystemComment(ticketId, userId, 'Status updated to Assigned', companyId);
    }

    return { success: true };
  }

  async declineAssignment(ticketId: string, userId: string, reason: string, companyId: string) {
    const assignment = await this.prisma.ticketAssignment.findUnique({
      where: { ticketId_userId: { ticketId, userId } }
    });

    if (!assignment) throw new NotFoundException('Invitation not found');

    await this.prisma.ticketAssignment.update({
      where: { id: assignment.id },
      data: { status: 'DECLINED' as any, declineReason: reason }
    });

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    await this.addSystemComment(ticketId, userId, `${user?.name} declined the invitation. Reason: ${reason}`, companyId);

    return { success: true };
  }

  async startProgress(id: string, userId: string, companyId: string) {
    const ticket = await this.findOne(id, companyId);
    
    if (ticket.status !== TicketStatus.ASSIGNED) {
      throw new BadRequestException('Ticket must be ASSIGNED before it can be moved to IN_PROGRESS');
    }

    if (ticket.assigneeId !== userId) {
      throw new ForbiddenException('Only the assigned personnel can start ticket execution');
    }

    const updated = await this.prisma.ticket.update({
      where: { id },
      data: { status: TicketStatus.IN_PROGRESS }
    });

    await this.addSystemComment(id, userId, 'Status updated to In Progress', companyId);
    return updated;
  }

  async addComment(id: string, userId: string, comment: string, companyId: string, isSystem: boolean = false) {
    const ticket = await this.findOne(id, companyId);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    const newComment = await this.prisma.ticketComment.create({
      data: { ticketId: id, userId, comment, isSystem },
    });

    // Strategy: Parse and notify @mentions
    await this.notifyMentions(id, ticket.ticketNumber, comment, user?.name || 'Someone', userId, companyId);

    return newComment;
  }

  async addSystemComment(id: string, userId: string, comment: string, companyId: string) {
    return this.addComment(id, userId, comment, companyId, true);
  }

  private async notifyMentions(ticketId: string, ticketNumber: string, comment: string, senderName: string, senderId: string, companyId: string) {
    const mentionRegex = /@([^ ,.:;!?@#$%/(){}[\]|\\"'<>]+( [^ ,.:;!?@#$%/(){}[\]|\\"'<>]+)*)/g;
    const matches = comment.matchAll(mentionRegex);
    const mentionedNames = new Set<string>();

    for (const match of matches) {
      mentionedNames.add(match[1]);
    }

    if (mentionedNames.size === 0) return;

    // Direct Database cross-reference for identity matching
    const mentionedUsers = await this.prisma.user.findMany({
      where: {
        companyId,
        name: { in: Array.from(mentionedNames) },
        id: { not: senderId }
      },
      select: { id: true, name: true }
    });

    for (const u of mentionedUsers) {
      await this.notifications.createNotification({
        userId: u.id,
        ticketId,
        type: 'TICKET_MENTION',
        title: 'Collaborative Mention localized',
        message: `${senderName} mentioned you in the intelligence feed for ${ticketNumber}.`,
        actionUrl: `/tickets/${ticketId}`
      });
    }
  }

  async removeAssignment(ticketId: string, assignmentId: string, userId: string, role: string, companyId: string) {
    const ticket = await this.findOne(ticketId, companyId);
    const isAdmin = ['COMPANY_ADMIN', 'SUPER_ADMIN', 'ADMIN'].includes(role);
    const isOwner = ticket.requesterId === userId;
    
    if (!isAdmin && !isOwner) {
      throw new ForbiddenException('Only Administrators or the ticket initiator can revoke personnel access.');
    }

    const assignment = await this.prisma.ticketAssignment.findUnique({ where: { id: assignmentId } });
    if (!assignment) throw new NotFoundException('Assignment record not found');

    const userToRemove = await this.prisma.user.findUnique({ where: { id: assignment.userId } });

    // Do not allow removing the requester (ticket owner)
    if (assignment.userId === ticket.requesterId) {
      throw new ForbiddenException('Cannot remove the ticket requester from the squad.');
    }

    await this.prisma.ticketAssignment.delete({ where: { id: assignmentId } });
    
    const remover = await this.prisma.user.findUnique({ where: { id: userId } });
    await this.addSystemComment(ticketId, userId, `${userToRemove?.name}'s access to this ticket has been revoked by ${remover?.name}.`, companyId);

    // Notify the removed user
    await this.notifications.createNotification({
      userId: assignment.userId,
      ticketId: ticketId,
      type: 'TICKET_REMOVED',
      title: 'Removed from Ticket',
      message: `You have been removed from ticket ${ticket.ticketNumber} by ${remover?.name}. You no longer have access to this ticket.`,
      actionUrl: `/tickets`,
    });

    return { success: true };
  }

  async update(id: string, userId: string, role: string, data: any, companyId: string) {
    const ticket = await this.findOne(id, companyId) as any;
    const isAdmin = ['COMPANY_ADMIN', 'SUPER_ADMIN', 'ADMIN'].includes(role);
    const isOwner = ticket.requesterId === userId;
    const isAssignee = ticket.assigneeId === userId || 
                      ticket.assignments?.some((a: any) => a.userId === userId);
    const isReceiverManager = ticket.receiverManagerId === userId || 
                             ticket.receiverDept?.managerId === userId;

    if (!isAdmin && !isOwner && !isAssignee && !isReceiverManager) {
      throw new ForbiddenException('You do not have administrative authority over this ticket.');
    }

    if (data.receiverDeptId === null || data.receiverDeptId === '') {
      throw new BadRequestException('A receiver department is mandatory. Select a new one before removing.');
    }

    /**
     * Closing a ticket does not happen through here.
     *
     * Two status dropdowns on the detail page could set RESOLVED or CANCELLED straight
     * through this generic update, which skipped the endpoints that ask how it was
     * resolved or why it was cancelled. The note is the entire point of asking, and a
     * closing route that quietly does not ask is the one everybody ends up using.
     *
     * Refused here rather than fixed at the two dropdowns, because the next screen that
     * PATCHes a status would skip it the same way.
     */
    if (data.status && data.status !== ticket.status) {
      if (data.status === 'RESOLVED') {
        throw new BadRequestException(
          'Use Mark resolved, so the fix is recorded for whoever hits this next.',
        );
      }
      if (data.status === 'CANCELLED') {
        throw new BadRequestException('Use Cancel, so the reason is recorded.');
      }
    }

    // If receiver department changed, update the receiver manager too
    let receiverManagerId = ticket.receiverManagerId;
    if (data.receiverDeptId && data.receiverDeptId !== ticket.receiverDeptId) {
      const dept = await this.prisma.department.findUnique({ where: { id: data.receiverDeptId } });
      receiverManagerId = dept?.managerId || null;
    }

    if (data.status && data.status !== ticket.status) {
      await this.addSystemComment(id, userId, `Manual status override: ${data.status.replace(/_/g, ' ')}`, companyId);
    }

    return this.prisma.ticket.update({
      where: { id },
      data: {
        ...data,
        receiverManagerId,
        id: undefined,
        companyId: undefined,
        ticketNumber: undefined,
        requesterId: undefined,
      }
    });
  }

  async remove(id: string, userId: string, role: string, companyId: string) {
    const ticket = await this.findOne(id, companyId);
    const isAdmin = ['COMPANY_ADMIN', 'SUPER_ADMIN'].includes(role);

    if (!isAdmin) {
      throw new ForbiddenException('Only Administrators can delete tickets.');
    }

    return this.prisma.ticket.delete({ where: { id } });
  }

  private async generateTicketNumber(companyId: string): Promise<string> {
    const lastTicket = await this.prisma.ticket.findFirst({
      where: { companyId, ticketNumber: { startsWith: 'TKT-' } },
      orderBy: { createdAt: 'desc' },
      select: { ticketNumber: true },
    });

    if (!lastTicket || !lastTicket.ticketNumber) {
      return 'TKT-1001';
    }

    const lastNum = parseInt(lastTicket.ticketNumber.split('-')[1]);
    if (isNaN(lastNum)) return 'TKT-1001';
    return `TKT-${lastNum + 1}`;
  }
}
