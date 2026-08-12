import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TicketStatus } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService
  ) { }

  async resolve(id: string, userId: string, companyId: string) {
    const ticket = await this.findOne(id, companyId);
    
    // Only assignee or manager can resolve
    const isAdmin = ['COMPANY_ADMIN', 'SUPER_ADMIN'].includes((await this.prisma.user.findUnique({ where: { id: userId } }))?.role || '');
    if (ticket.assigneeId !== userId && !isAdmin) {
      throw new ForbiddenException('Only the assigned resource or an admin can finalize this engagement');
    }

    const updated = await this.prisma.ticket.update({
      where: { id },
      data: { status: 'RESOLVED' }
    });

    await this.addSystemComment(id, userId, 'Status updated to Resolved', companyId);

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

  async create(companyId: string, userId: string, data: {
    title: string;
    description: string;
    receiverDeptId: string;
    assigneeId?: string;
    isInternal?: boolean;
    type?: string;
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

    const ticket = await this.prisma.ticket.create({
      data: {
        companyId,
        ticketNumber,
        title: data.title,
        description: data.description,
        type: (data.type as any) || 'GENERAL',
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

    // Strategy Center: Generate Initialization Briefing
    const summary = `Ticket Initialization: ${ticket.ticketNumber} established.
    PRIORITY: ${data.priority || 'MEDIUM'}
    LOGISTICAL TARGET: ${receiverDept?.name || 'Unassigned'}
    CONTEXT: ${data.title}`;
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

    const comment = reason ? `Rejected: ${reason}` : 'Rejected';
    await this.addSystemComment(id, userId, `Status set to Cancelled. Reason: ${reason || 'Denied'}`, companyId);
    await this.addComment(id, userId, comment, companyId, false);

    const updated = await this.prisma.ticket.update({
      where: { id },
      data: { status: TicketStatus.CANCELLED },
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
