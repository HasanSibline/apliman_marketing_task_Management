import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Inject, forwardRef } from '@nestjs/common';
import { CompaniesService } from '../companies/companies.service';
import { MicrosoftService } from '../microsoft/microsoft.service';
import { AiService } from '../ai/ai.service';
import { SendMessageDto, CreateSessionDto, UpdateContextDto, ChatQueryDto } from './dto/chat.dto';

import { ConfigService } from '@nestjs/config';

/**
 * How long one nudge holds the rotation before the next is picked.
 *
 * Matched to NUDGE_INTERVAL_MS in FloatingChatButton, the rate the client asks at.
 * Shorter and two polls inside one bucket repeat themselves; longer and consecutive
 * nudges skip entries. They are two constants in two services rather than one shared
 * value, so if the client's interval changes this has to change with it.
 */
const NUDGE_ROTATION_MS = 3 * 60_000;

/** "3rd" rather than "3", because a leaderboard position is an ordinal. */
function ordinal(n: number): string {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly aiServiceUrl: string;

  constructor(
    private prisma: PrismaService,
    private httpService: HttpService,
    private configService: ConfigService,
    private microsoftService: MicrosoftService,
    @Inject(forwardRef(() => CompaniesService))
    private companiesService: CompaniesService,
    private aiService: AiService,
  ) {
    this.aiServiceUrl = this.configService.get<string>('AI_SERVICE_URL', 'http://localhost:8001');
  }

  /** Authorization headers sent with every AI service request */
  private get aiServiceHeaders(): Record<string, string> {
    const secret = this.configService.get<string>('AI_SERVICE_SECRET', '');
    return secret ? { Authorization: `Bearer ${secret}` } : {};
  }

  /**
   * A short, true thing to say to this person right now.
   *
   * Deliberately not written by the AI. A nudge has to be instant, free and correct,
   * and none of those survive a round trip to a language model: it would cost a call
   * per person per interval, arrive seconds late, be unavailable exactly when the AI
   * is down, and occasionally invent a number. Everything here is counted from the
   * database, so it is always available and never wrong.
   *
   * Ordered by what deserves attention rather than by what is cheerful. Something
   * overdue outranks praise, because a greeting shown over a missed deadline is worse
   * than no greeting. Only when nothing needs attention does it congratulate.
   */
  async getNudge(userId: string): Promise<{ text: string; tone: 'urgent' | 'info' | 'praise' } | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true, departmentId: true, role: true, isTicketApprover: true },
    });
    if (!user?.companyId) return null;

    const now = new Date();
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    /**
     * Mine, in the sense of work I owe.
     *
     * assignedToId alone was wrong: the app has assigned tasks to several people
     * through TaskAssignment for a long time, and the scalar is only still written
     * for backward compatibility. Anyone assigned the modern way was invisible here,
     * so the bot cheerfully reported a clear board to people who had a full one.
     *
     * createdById is deliberately not included, though the tasks list does include
     * it. Raising a task is not owing it, and a reminder about someone else's work
     * is noise wearing the costume of a reminder.
     */
    const mine = {
      OR: [{ assignedToId: userId }, { assignments: { some: { userId } } }],
    };

    /** Not finished, by the same three-part rule the rest of the app uses. */
    const open = {
      completedAt: null,
      phase: { notIn: ['COMPLETED', 'ARCHIVED'] as any },
      NOT: { currentPhase: { isEndPhase: true } },
    };

    /**
     * A task the board would show. Every subtask is also a Task row of type SUBTASK,
     * and the board hides them because they already appear inside their parent; a
     * nudge counting them reports work the person cannot find when they go looking.
     */
    const realTask = { taskType: { not: 'SUBTASK' } };

    /** Tickets are the same story: assigneeId is marked deprecated in the schema. */
    const mineTicket = {
      OR: [{ assigneeId: userId }, { assignments: { some: { userId } } }],
    };

    const [
      overdue,
      dueToday,
      doneThisWeek,
      openTickets,
      awaitingMyDecision,
      myRequestsAnswered,
      finishedThisMonth,
      unscheduled,
      myRequestsResolved,
      openSubtasks,
    ] = await Promise.all([
      // Counted and sampled separately. Taking a couple of rows and reporting how
      // many came back caps the number at whatever the limit was, so someone with
      // nine tasks due today is told there are two.
      Promise.all([
        this.prisma.task.count({ where: { ...mine, ...open, ...realTask, dueDate: { lt: now } } }),
        this.prisma.task.findFirst({
          where: { ...mine, ...open, ...realTask, dueDate: { lt: now } },
          select: { taskNumber: true, dueDate: true },
          orderBy: { dueDate: 'asc' },
        }),
      ]),
      Promise.all([
        this.prisma.task.count({
          where: { ...mine, ...open, ...realTask, dueDate: { gte: now, lte: endOfToday } },
        }),
        this.prisma.task.findFirst({
          where: { ...mine, ...open, ...realTask, dueDate: { gte: now, lte: endOfToday } },
          select: { taskNumber: true },
          orderBy: { dueDate: 'asc' },
        }),
      ]),
      this.prisma.task.count({
        where: { ...mine, ...realTask, completedAt: { gte: weekAgo } },
      }),
      Promise.all([
        this.prisma.ticket.count({
          where: { ...mineTicket, status: { in: ['ASSIGNED', 'IN_PROGRESS'] as any } },
        }),
        this.prisma.ticket.findFirst({
          where: { ...mineTicket, status: { in: ['ASSIGNED', 'IN_PROGRESS'] as any } },
          select: { ticketNumber: true },
          orderBy: { createdAt: 'asc' },
        }),
      ]),
      // Waiting on me specifically, either because I am the named manager for it or
      // because I am the department's approver and it has reached my desk.
      this.prisma.ticket.count({
        where: {
          status: 'PENDING_REC_MGR' as any,
          OR: [
            { receiverManagerId: userId },
            ...(user.isTicketApprover && user.departmentId
              ? [{ receiverDeptId: user.departmentId }]
              : []),
          ],
        },
      }),
      // Something I asked another department for, now moving.
      this.prisma.ticket.count({
        where: {
          requesterId: userId,
          status: { in: ['ASSIGNED', 'IN_PROGRESS'] as any },
          updatedAt: { gte: weekAgo },
        },
      }),
      // Compared in JS rather than SQL. Asking the database whether one column is
      // later than another needs a field reference, which is a moving target across
      // Prisma versions; this is one person's month, so the rows are few and the
      // comparison is unambiguous.
      this.prisma.task.findMany({
        where: { ...mine, ...realTask, completedAt: { gte: monthStart } },
        select: { completedAt: true, dueDate: true },
      }),
      // Work of mine that no quarter owns. Easy to accumulate and invisible on the
      // strategy pages, which only show what is inside a cycle.
      this.prisma.task.count({
        where: { ...mine, ...open, ...realTask, quarterId: null },
      }),
      // Something I asked for that came back done.
      this.prisma.ticket.count({
        where: {
          requesterId: userId,
          status: 'RESOLVED' as any,
          updatedAt: { gte: weekAgo },
        },
      }),
      // Subtasks are assigned separately from their parent task and are the usual
      // place work hides: the task looks untouched while three of its parts are mine.
      this.prisma.subtask
        .count({
          // Scoped to subtasks whose parent task is still running. One left unticked
          // on a task that shipped weeks ago is bookkeeping, not work, and counting
          // it would leave a number nobody can ever bring down to zero.
          where: { assignedToId: userId, isCompleted: false, task: { ...open } },
        })
        .catch(() => 0),
    ]);

    const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

    const [overdueCount, firstOverdue] = overdue;
    const [dueTodayCount, firstDueToday] = dueToday;
    const [openTicketCount, firstOpenTicket] = openTickets;

    /**
     * One item gets named, several get counted.
     *
     * Named by number rather than title: TSK-1003 is what the task is called in the
     * list, on the card and in the URL, so it is the thing you can act on. A title
     * is prose, it is often long enough to wrap the bubble twice, and two tasks can
     * share one.
     *
     * taskNumber is nullable, though. Tasks promoted from a subtask never get one, so
     * a single task without a number falls back to naming its kind rather than
     * printing "null is due today".
     */
    type Nudge = { text: string; tone: 'urgent' | 'info' | 'praise' };

    /**
     * Everything true about this person right now, rather than the first true thing.
     *
     * This was a ladder of early returns, which meant whoever had one task past due
     * saw that one sentence every three minutes for as long as it stayed past due,
     * and never reached the ticket or the analytics lines at all. The extra branches
     * existed and were unreachable. Collecting them and rotating is what makes the
     * bot worth glancing at twice.
     */
    const pool: Nudge[] = [];

    if (overdueCount > 0) {
      const id = firstOverdue?.taskNumber;
      const days = firstOverdue?.dueDate
        ? Math.floor((now.getTime() - firstOverdue.dueDate.getTime()) / 86_400_000)
        : 0;
      pool.push({
        tone: 'urgent',
        text:
          overdueCount > 1
            ? `${overdueCount} tasks are past due.`
            : id
              ? days >= 1
                ? `${id} is ${days} ${plural(days, 'day', 'days')} past due.`
                : `${id} is past due.`
              : 'One task is past due.',
      });
    }

    if (awaitingMyDecision > 0) {
      pool.push({
        tone: 'urgent',
        text: `${awaitingMyDecision} ${plural(awaitingMyDecision, 'ticket is', 'tickets are')} waiting on your decision.`,
      });
    }

    if (dueTodayCount > 0) {
      const id = firstDueToday?.taskNumber;
      pool.push({
        tone: 'info',
        text:
          dueTodayCount > 1
            ? `${dueTodayCount} tasks are due today.`
            : id
              ? `${id} is due today.`
              : 'One task is due today.',
      });
    }

    if (openTicketCount > 0) {
      const id = firstOpenTicket?.ticketNumber;
      pool.push({
        tone: 'info',
        text:
          openTicketCount > 1
            ? `${openTicketCount} tickets are assigned to you.`
            : id
              ? `${id} is assigned to you.`
              : 'One ticket is assigned to you.',
      });
    }

    if (openSubtasks > 0) {
      pool.push({
        tone: 'info',
        text: `${openSubtasks} ${plural(openSubtasks, 'subtask is', 'subtasks are')} still open under your tasks.`,
      });
    }

    if (unscheduled > 0) {
      pool.push({
        tone: 'info',
        text: `${unscheduled} of your ${plural(unscheduled, 'task is', 'tasks are')} not in a quarter yet.`,
      });
    }

    // Analytics, and the only line here that is a rate rather than a count. Measured
    // over tasks that actually had a deadline, because one finished without a due
    // date is neither on time nor late, and counting it as either is a made-up
    // number. Said only once there is enough of a month behind it to mean something.
    const dated = finishedThisMonth.filter((t) => t.dueDate && t.completedAt);
    if (dated.length >= 4) {
      // On time means "on or before the day it was due", not "before midnight that
      // morning". Due dates come from a date input, so they arrive as midnight, and a
      // straight <= comparison marks everything finished during its own due date as
      // late: someone who has never missed a deadline would be shown 0% on time.
      const onTime = dated.filter(
        (t) => t.completedAt!.getTime() < t.dueDate!.getTime() + 86_400_000,
      ).length;
      const rate = Math.round((onTime / dated.length) * 100);
      pool.push(
        rate === 100
          ? { tone: 'praise', text: `All ${dated.length} tasks this month landed on time.` }
          : rate >= 80
            ? { tone: 'praise', text: `${rate}% of your tasks landed on time this month.` }
            : { tone: 'info', text: `${rate}% on time this month, across ${dated.length} tasks.` },
      );
    }

    if (finishedThisMonth.length >= 2) {
      pool.push({
        tone: 'praise',
        text: `${finishedThisMonth.length} tasks finished this month so far.`,
      });
    }

    if (myRequestsResolved > 0) {
      pool.push({
        tone: 'praise',
        text: `${myRequestsResolved} of your ${plural(myRequestsResolved, 'request came', 'requests came')} back done this week.`,
      });
    }

    if (myRequestsAnswered > 0) {
      pool.push({
        tone: 'info',
        text: `${myRequestsAnswered} of your ${plural(myRequestsAnswered, 'request', 'requests')} moved this week.`,
      });
    }

    if (doneThisWeek >= 3) {
      pool.push({ tone: 'praise', text: `${doneThisWeek} tasks finished this week. Nice run.` });
    }

    if (pool.length === 0) {
      // Nothing needs attention and nothing to celebrate. Saying nothing is better
      // than manufacturing something: a widget that always has an opinion stops
      // being read.
      return doneThisWeek > 0
        ? { tone: 'praise', text: 'Your board is clear. Well done.' }
        : null;
    }

    /**
     * Which one to say this time.
     *
     * Stepped by the clock rather than chosen at random, so the same thing is not
     * repeated twice running and the sequence does not need anything remembered
     * between requests. The bucket is the nudge interval the client polls on, so
     * consecutive nudges land on consecutive entries and a full turn through
     * everything true takes as many nudges as there are things to say.
     */
    const bucket = Math.floor(now.getTime() / NUDGE_ROTATION_MS);
    return pool[bucket % pool.length];
  }

  /**
   * Today, for one person: the facts, then a brief written from them.
   *
   * Two halves with different guarantees, and the split is the point.
   *
   * The **facts** are counted from the database. They are exact, they cost nothing,
   * and they are always returned. Everything a reader might act on lives here.
   *
   * The **brief** is prose over those facts. The AI writes it when a company has a
   * provider configured; otherwise it is composed below. Either way the numbers came
   * from the query, never from the model, so the brief cannot invent a deadline. The
   * model is being asked to phrase a paragraph, not to look anything up.
   *
   * `aiWritten` says which happened, because a reader deserves to know whether they
   * are reading a language model or a template.
   */
  async getDayBrief(userId: string): Promise<{
    greeting: string;
    items: { kind: string; label: string; detail: string; tone: 'urgent' | 'info' | 'praise' }[];
    summary: string;
    aiWritten: boolean;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, companyId: true, departmentId: true, isTicketApprover: true },
    });

    const now = new Date();
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);

    // The same two predicates the nudge uses, and for the same reason: assignedToId
    // alone misses everyone assigned through TaskAssignment, and Ticket.assigneeId is
    // marked deprecated in the schema.
    const mine = { OR: [{ assignedToId: userId }, { assignments: { some: { userId } } }] };

    /**
     * A task, in the sense the board means it.
     *
     * Every subtask is also written as a Task row of type SUBTASK, and the board
     * excludes them because they are already shown inside their parent. This did not,
     * so the brief listed five tasks "140 days past due" for someone whose board read
     * To do: 0 — the same five rows, counted in a place that filtered them and a place
     * that did not. Anything user-facing has to agree with the board or one of the two
     * is lying.
     */
    const realTask = { taskType: { not: 'SUBTASK' } };

    const open = {
      completedAt: null,
      phase: { notIn: ['COMPLETED', 'ARCHIVED'] as any },
      NOT: { currentPhase: { isEndPhase: true } },
    };
    const mineTicket = { OR: [{ assigneeId: userId }, { assignments: { some: { userId } } }] };

    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      overdue,
      dueToday,
      awaitingMe,
      myTickets,
      openSubtasks,
      finishedThisWeek,
      meetings,
      finishedToday,
      monthCompletions,
    ] = await Promise.all([
        this.prisma.task.findMany({
          where: { ...mine, ...open, ...realTask, dueDate: { lt: now } },
          select: { taskNumber: true, title: true, dueDate: true },
          orderBy: { dueDate: 'asc' },
          take: 5,
        }),
        this.prisma.task.findMany({
          where: { ...mine, ...open, ...realTask, dueDate: { gte: now, lte: endOfToday } },
          select: { taskNumber: true, title: true },
          orderBy: { priority: 'desc' },
          take: 5,
        }),
        this.prisma.ticket.count({
          where: {
            status: 'PENDING_REC_MGR' as any,
            OR: [
              { receiverManagerId: userId },
              ...(user?.isTicketApprover && user?.departmentId
                ? [{ receiverDeptId: user.departmentId }]
                : []),
            ],
          },
        }),
        this.prisma.ticket.findMany({
          where: { ...mineTicket, status: { in: ['ASSIGNED', 'IN_PROGRESS'] as any } },
          select: { ticketNumber: true, title: true },
          take: 5,
        }),
        this.prisma.subtask
          .count({ where: { assignedToId: userId, isCompleted: false, task: { ...open } } })
          .catch(() => 0),
        this.prisma.task.count({ where: { ...mine, ...realTask, completedAt: { gte: weekAgo } } }),
        // Today's calendar. Most people will not have connected an account, and Graph
        // is the one call here that leaves our infrastructure, so it fails to an empty
        // list rather than taking the brief down with it.
        this.microsoftService
          .getCalendarEvents(userId, startOfToday.toISOString(), endOfToday.toISOString())
          .catch(() => [] as any[]),

        // What they have already closed today. This is the difference between a brief
        // that lists what is left and one that notices you have been working.
        this.prisma.task.findMany({
          where: { ...mine, ...realTask, completedAt: { gte: startOfToday } },
          select: { taskNumber: true, title: true },
          take: 5,
        }),

        /**
         * Where they stand this month, tallied here rather than grouped in SQL.
         *
         * A groupBy can only group on a column, and a task's people live in
         * TaskAssignment as well as in assignedToId, so grouping would rank everyone
         * by the legacy scalar and quietly score multi-assignee work to one person.
         * One month of one company's completed tasks is a small set; counting it in
         * memory is honest and cheap.
         */
        user?.companyId
          ? this.prisma.task.findMany({
              where: {
                companyId: user.companyId,
                ...realTask,
                completedAt: { gte: monthStart },
              },
              select: { assignedToId: true, assignments: { select: { userId: true } } },
            })
          : Promise.resolve([] as any[]),
      ]);

    const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
    const items: {
      kind: string;
      /** The left column: a clock time for a meeting, a reference for everything else. */
      meta: string;
      label: string;
      detail: string;
      tone: 'urgent' | 'info' | 'praise';
    }[] = [];

    /**
     * Meetings lead, because they are the only thing here you cannot reschedule by
     * deciding to. A task can move; a ten o'clock cannot.
     *
     * Graph nests the time as start.dateTime with a separate timeZone, so it is read
     * through that rather than as a string, and anything unparseable is dropped rather
     * than printed as Invalid Date.
     */
    const meetingRows = (Array.isArray(meetings) ? meetings : [])
      .map((e: any) => {
        const raw = e?.start?.dateTime ?? e?.start;
        const at = raw ? new Date(raw) : null;
        return at && !isNaN(at.getTime()) ? { at, title: e.subject || 'Meeting' } : null;
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.at - b.at) as { at: Date; title: string }[];

    for (const m of meetingRows.slice(0, 6)) {
      const passed = m.at < now;
      items.push({
        kind: 'meeting',
        meta: m.at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        label: m.title,
        detail: passed ? 'Earlier today' : 'Today',
        tone: passed ? 'info' : 'urgent',
      });
    }

    for (const t of overdue) {
      const days = t.dueDate ? Math.floor((now.getTime() - t.dueDate.getTime()) / 86_400_000) : 0;
      items.push({
        kind: 'task',
        meta: t.taskNumber ?? 'Task',
        label: t.title,
        detail: days >= 1 ? `${days} ${plural(days, 'day', 'days')} past due` : 'Past due',
        tone: 'urgent',
      });
    }

    if (awaitingMe > 0) {
      items.push({
        kind: 'ticket',
        meta: 'Approve',
        label: `${awaitingMe} ${plural(awaitingMe, 'ticket needs', 'tickets need')} your decision`,
        detail: 'Waiting on you',
        tone: 'urgent',
      });
    }

    for (const t of dueToday) {
      items.push({
        kind: 'task',
        meta: t.taskNumber ?? 'Task',
        label: t.title,
        detail: 'Due today',
        tone: 'info',
      });
    }

    for (const t of myTickets) {
      items.push({
        kind: 'ticket',
        meta: t.ticketNumber,
        label: t.title,
        detail: 'Assigned to you',
        tone: 'info',
      });
    }

    if (openSubtasks > 0) {
      items.push({
        kind: 'subtask',
        meta: 'Subtasks',
        label: `${openSubtasks} still open`,
        detail: 'Under running tasks',
        tone: 'info',
      });
    }

    if (finishedThisWeek > 0) {
      items.push({
        kind: 'done',
        meta: 'Done',
        label: `${finishedThisWeek} finished this week`,
        detail: 'Last seven days',
        tone: 'praise',
      });
    }

    const hour = now.getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

    /**
     * Where they stand this month among everyone else in the company.
     *
     * Each task credits everybody on it once, whether they were named through the old
     * scalar or through TaskAssignment, so a shared task does not count for one person
     * and vanish for the other.
     */
    const tally = new Map<string, number>();
    for (const t of monthCompletions as any[]) {
      const people = new Set<string>();
      if (t.assignedToId) people.add(t.assignedToId);
      for (const a of t.assignments ?? []) people.add(a.userId);
      for (const p of people) tally.set(p, (tally.get(p) ?? 0) + 1);
    }
    const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1]);
    const myPosition = ranked.findIndex(([id]) => id === userId);
    const standing =
      myPosition >= 0 && ranked.length > 1
        ? { rank: myPosition + 1, of: ranked.length, done: ranked[myPosition][1] }
        : null;

    /**
     * The composed brief: what ships when there is no AI, and what the AI is handed to
     * rewrite, so the facts are identical either way.
     *
     * Written as sentences about the day rather than a list of titles. Someone reading
     * "Research Aireach and Apliman's Telecom-Grade Engagement Infrastructure" in a
     * summary is reading the list again, in prose, which is longer and no clearer. The
     * list above already names things; this says what they add up to.
     */
    const sentences: string[] = [];

    // Progress first when there is any. A brief that opens with what is left, when you
    // have spent the day closing things, reads as though nobody noticed.
    if (finishedToday.length) {
      sentences.push(
        `You have closed ${finishedToday.length} ${plural(finishedToday.length, 'task', 'tasks')} today.`,
      );
    }

    // Meetings, including their absence: a day with no meetings is worth being told.
    const ahead = meetingRows.filter((m) => m.at >= now);
    if (ahead.length) {
      const next = ahead[0].at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      sentences.push(
        `You have ${ahead.length} ${plural(ahead.length, 'meeting', 'meetings')} left, the next at ${next}.`,
      );
    } else if (meetingRows.length) {
      sentences.push('Your meetings for today are behind you.');
    } else {
      sentences.push('Your calendar is clear today, so the time is yours to place.');
    }

    const workParts: string[] = [];
    if (overdue.length) {
      workParts.push(`${overdue.length} ${plural(overdue.length, 'is', 'are')} past due`);
    }
    if (dueToday.length) {
      workParts.push(`${dueToday.length} ${plural(dueToday.length, 'is', 'are')} due today`);
    }
    if (openSubtasks) {
      workParts.push(`${openSubtasks} ${plural(openSubtasks, 'subtask is', 'subtasks are')} open`);
    }
    if (workParts.length) {
      sentences.push(
        `On your board, ${workParts.slice(0, -1).join(', ')}${workParts.length > 1 ? ' and ' : ''}${workParts[workParts.length - 1]}.`,
      );
    } else {
      sentences.push('Nothing on your board is overdue or due today.');
    }

    if (awaitingMe || myTickets.length) {
      const ticketParts: string[] = [];
      if (awaitingMe) {
        ticketParts.push(
          `${awaitingMe} ${plural(awaitingMe, 'is', 'are')} waiting on your decision`,
        );
      }
      if (myTickets.length) {
        ticketParts.push(
          `${myTickets.length} ${plural(myTickets.length, 'is', 'are')} assigned to you`,
        );
      }
      sentences.push(`On tickets, ${ticketParts.join(' and ')}.`);
    } else {
      sentences.push('No tickets need you right now.');
    }

    if (standing) {
      sentences.push(
        `You are ${ordinal(standing.rank)} of ${standing.of} this month, on ${standing.done} ${plural(standing.done, 'task', 'tasks')} finished.`,
      );
    }

    let summary = sentences.join(' ');

    let aiWritten = false;

    try {
      const credential = await this.aiService.resolveAiCredential(userId);
      if (credential) {
        /**
         * Counts, not titles.
         *
         * The model is given the shape of the day and never the names of things. Hand
         * it a list of task titles and it writes them back out, which is the list
         * again in paragraph form: longer, no clearer, and it reads as a machine
         * reciting rather than a colleague telling you where you stand.
         */
        /**
         * Labels with no pronouns in them at all.
         *
         * These read "Tickets waiting on their decision" and "Tasks they finished this
         * week", and the model wrote the brief in the voice it was handed: "They have
         * no meetings today. They sit first of two." The instruction said second person
         * and lost to the data, which is the usual outcome. Naming a count without
         * naming a person leaves the prompt to decide who is being spoken to.
         */
        const facts = [
          `Meetings remaining today: ${ahead.length}${ahead.length ? ` (next at ${ahead[0].at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })})` : ''}`,
          `Meetings already held today: ${meetingRows.length - ahead.length}`,
          `Tasks past due: ${overdue.length}`,
          `Tasks due today: ${dueToday.length}`,
          `Open subtasks: ${openSubtasks}`,
          `Tickets awaiting a decision: ${awaitingMe}`,
          `Tickets assigned: ${myTickets.length}`,
          `Tasks completed today: ${finishedToday.length}`,
          `Tasks completed this week: ${finishedThisWeek}`,
          standing
            ? `Leaderboard position: ${ordinal(standing.rank)} of ${standing.of} this month, on ${standing.done} completed`
            : 'Leaderboard position: not enough data this month',
        ].join('\n');

        /**
         * /daily-brief, not /summarize.
         *
         * summarize_text wraps whatever it receives in "Summarize the following text",
         * so instructions sent to it are summarized rather than followed: this returned
         * a tidy paragraph describing the brief it should have written, in place of the
         * brief. The instructions live in the AI service now, and only counts cross the
         * wire.
         */
        const response = await this.httpService.axiosRef.post(
          `${this.aiServiceUrl}/daily-brief`,
          {
            firstName: user?.name?.split(' ')[0] ?? 'there',
            facts,
            max_length: 400,
            api_key: credential.apiKey,
            provider: credential.provider,
            model: credential.model ?? undefined,
          },
          { headers: this.aiServiceHeaders, timeout: 20000 },
        );
        const written: string = response.data?.brief?.trim() ?? '';

        /**
         * Reject a brief that is describing itself.
         *
         * A model handed instructions sometimes restates them instead of following
         * them, and the result reads plausibly enough to ship: "Write a brief, spoken
         * update warmly noting the work already finished..." went out looking exactly
         * like a summary. It always opens with the imperative it was given, which is
         * the one thing a brief written to somebody never does, so that is what this
         * checks. The composed text is already correct and takes over.
         */
        const echoesTheBrief = /^(write|create|generate|compose|draft|summari[sz]e|produce)\b/i.test(
          written,
        );

        /**
         * Written about the reader rather than to them.
         *
         * The first attempt came back "They have no meetings today. They sit first of
         * two", which is accurate, fluent and addressed to nobody in the room. Checking
         * for the absence of "you" catches it without banning "they", which a brief may
         * legitimately need for other people.
         */
        const notSpokenToThem = written.length > 0 && !/\byou(r|rs)?\b/i.test(written);

        if (written && !echoesTheBrief && !notSpokenToThem) {
          summary = written;
          aiWritten = true;
        } else if (echoesTheBrief) {
          this.logger.warn('Day brief: model restated the instructions, using composed text');
        } else if (notSpokenToThem) {
          this.logger.warn('Day brief: model wrote in the third person, using composed text');
        }
      }
    } catch (error) {
      // The composed brief above is already correct, so a provider being down costs
      // the phrasing and nothing else. Logged, not surfaced.
      this.logger.warn(`Day brief fell back to composed text: ${error.message}`);
    }

    return { greeting, items, summary, aiWritten };
  }

  /**
   * Get or create a chat session for a user
   */
  async getOrCreateSession(userId: string, sessionId?: string) {
    if (sessionId) {
      const session = await this.prisma.chatSession.findFirst({
        where: {
          id: sessionId,
          userId,
          isActive: true,
        },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            take: 50, // Last 50 messages for context
          },
        },
      });

      if (session) return session;
    }

    // Get user's companyId
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true },
    });

    // Create new session
    return this.prisma.chatSession.create({
      data: {
        userId,
        companyId: user?.companyId,
        title: 'New Chat',
        isActive: true,
      },
      include: {
        messages: true,
      },
    });
  }

  /**
   * Get user's chat context (learned information)
   */
  async getUserContext(userId: string) {
    let context = await this.prisma.userChatContext.findUnique({
      where: { userId },
    });

    if (!context) {
      context = await this.prisma.userChatContext.create({
        data: {
          userId,
          context: {},
        },
      });
    }

    return context;
  }

  /**
   * Update user's chat context with learned information
   * Intelligently merges new context with existing context
   */
  async updateUserContext(userId: string, newContext: any) {
    const existing = await this.getUserContext(userId);

    // Intelligently merge contexts - new values override old ones (for corrections)
    const updatedContext = this.mergeContextIntelligently(
      existing.context as any,
      newContext
    );

    updatedContext.lastUpdated = new Date().toISOString();

    return this.prisma.userChatContext.update({
      where: { userId },
      data: { context: updatedContext },
    });
  }

  /**
   * Intelligently merge new context with existing context
   * Handles corrections, updates, and array merging
   */
  private mergeContextIntelligently(existing: any, newContext: any): any {
    const merged = { ...existing };

    for (const [key, value] of Object.entries(newContext)) {
      if (key === 'lastUpdated') continue;

      // If the key doesn't exist, just add it
      if (!(key in merged)) {
        merged[key] = value;
        continue;
      }

      // If both are arrays, merge and deduplicate
      if (Array.isArray(value) && Array.isArray(merged[key])) {
        merged[key] = [...new Set([...merged[key], ...value])];
      }
      // If both are objects, merge recursively
      else if (
        typeof value === 'object' &&
        value !== null &&
        typeof merged[key] === 'object' &&
        merged[key] !== null &&
        !Array.isArray(value)
      ) {
        merged[key] = this.mergeContextIntelligently(merged[key], value);
      }
      // For primitive values, new value replaces old (handles corrections)
      else {
        merged[key] = value;
      }
    }

    return merged;
  }

  /**
   * Send a message and get AI response
   */
  async sendMessage(userId: string, dto: SendMessageDto, userToken?: string) {
    try {
      // Get or create session
      const session = await this.getOrCreateSession(userId, dto.sessionId);

      // Get user context
      const userContext = await this.getUserContext(userId);

      // Get user details (including companyId for filtering)
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          position: true,
          companyId: true,
          department: { select: { name: true } },
          manager: { select: { name: true } },
        },
      });

      // Save user message with file metadata included
      const userMessage = await this.prisma.chatMessage.create({
        data: {
          sessionId: session.id,
          role: 'user',
          content: dto.message,
          metadata: {
            ...dto.metadata,
            files: dto.files || [],
          },
        },
      });

      // Process mentions, task references, and ticket references
      const mentions = this.extractMentions(dto.message);
      const taskRefs = this.extractTaskReferences(dto.message);
      const ticketRefs = this.extractTicketReferences(dto.message);
      const isDeepAnalysis = /\b(deep|details|detailed|explain|elaborate)\b/i.test(dto.message);

      // Get user's company ID for filtering
      const userCompanyId = user.companyId;

      this.logger.log(`🏢 User company ID: ${userCompanyId}`);

      if (!userCompanyId) {
        this.logger.error(`❌ User ${user.name} has no companyId!`);
        throw new Error('Your account is not associated with a company. Please contact support.');
      }

      // Resolve the credential through the shared resolver: the company's own key
      // first, then the platform-wide key a super admin configured.
      const aiCredential = await this.aiService.resolveAiCredential(userId);

      if (!aiCredential) {
        throw new Error(
          'AI is not enabled for your company. Please ask your administrator to add an AI API key, ' +
            'or configure a platform key in Settings → AI Platform.',
        );
      }

      const aiApiKey = aiCredential.apiKey;
      const company = { name: aiCredential.companyName, aiProvider: aiCredential.provider };

      this.logger.log(`🏢 Company: ${company.name}, Provider: ${aiCredential.provider}`);

      // Get knowledge sources (COMPANY-SPECIFIC ONLY)
      const knowledgeSources = await this.prisma.knowledgeSource.findMany({
        where: {
          isActive: true,
          companyId: userCompanyId // CRITICAL: Only get this company's knowledge sources
        },
        select: {
          id: true,
          name: true,
          url: true,
          type: true,
          description: true,
          content: true,
          metadata: true,
        },
      });

      this.logger.log(`📚 Found ${knowledgeSources.length} knowledge sources for company ${company.name}`);
      knowledgeSources.forEach(ks => {
        this.logger.log(`  - ${ks.name} (${ks.type}): ${ks.content ? `${ks.content.length} chars` : 'NO CONTENT'}`);
      });

      // Fetch additional context based on mentions, task references, and ticket references
      const additionalContext = await this.fetchAdditionalContext(
        userId,
        mentions,
        taskRefs,
        ticketRefs
      );

      // Prepare conversation history
      const conversationHistory = await this.prisma.chatMessage.findMany({
        where: { sessionId: session.id },
        orderBy: { createdAt: 'asc' },
        take: 20, // Last 20 messages
        select: {
          role: true,
          content: true,
          createdAt: true,
        },
      });

      // Normalize file URLs to absolute paths so the AI service can fetch them
      const backendUrlConfig = this.configService.get<string>('BACKEND_URL', 'http://localhost:3001');
      const backendUrl = backendUrlConfig.replace(/\/$/, '');

      const normalizedFiles = (dto.files || []).map(file => {
        if (file.url && (file.url.startsWith('/') || !file.url.startsWith('http'))) {
          const prefix = file.url.startsWith('/') ? '' : '/';
          const fullUrl = `${backendUrl}${prefix}${file.url}`;
          this.logger.log(`🔗 Normalizing file URL: ${file.url} -> ${fullUrl}`);
          return { ...file, url: fullUrl };
        }
        return file;
      });

      this.logger.log(`📦 Payload DTO files: ${dto.files?.length || 0}`);
      this.logger.log(`📦 Normalized files to send to AI: ${normalizedFiles.length}`);

      // Call AI service with company name
      const chatPayload = {
        message: dto.message,
        userContext: userContext.context,
        user,
        conversationHistory,
        knowledgeSources,
        additionalContext,
        isDeepAnalysis,
        api_key: aiApiKey, // CRITICAL: Pass resolved API key (snake_case for Python)
        provider: aiCredential.provider || 'gemini',
        model: aiCredential.model ?? undefined, // platform key may pin a model
        companyName: company.name, // CRITICAL: Pass actual company name
        files: normalizedFiles, // Pass absolute URL files for multimodal support
        userToken, // Pass user's access token for file fetching
      };

      // One deadline for everything this message may cost upstream. Each call used to
      // carry its own budget, so a message that fell back to the platform key could
      // spend two full budgets back to back and outlive the browser's own patience,
      // which throws away the work and shows a network error instead of an answer.
      const deadline = Date.now() + ChatService.CHAT_BUDGET_MS;

      let aiResponse = await this.callAiChatService(chatPayload, deadline);

      // A company on a free provider tier hits per-minute limits routinely, and one
      // The platform-key retry that used to live here is gone with the platform key
      // itself. Falling back is the gateway's job now, across a company's own chain of
      // providers, rather than onto a shared credential nobody in the tenant owns.

      // Save assistant message (Safety first: ensure content is a string)
      const assistantContent = typeof aiResponse === 'string'
        ? aiResponse
        : (aiResponse?.message || aiResponse?.content || "I encountered an error processing your request.");

      const assistantMessage = await this.prisma.chatMessage.create({
        data: {
          sessionId: session.id,
          role: 'assistant',
          content: String(assistantContent),
          metadata: {
            mentions,
            taskRefs,
            ticketRefs,
            contextUsed: !!aiResponse?.contextUsed,
            files: aiResponse?.files || [], // For future AI return assets
          },
        },
      });

      // Update user context if AI learned something new
      if (aiResponse.learnedContext) {
        await this.updateUserContext(userId, aiResponse.learnedContext);
      }

      // Track CHAT AI usage (fire-and-forget)
      try {
        const monthYear = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
        await this.prisma.userAIUsage.upsert({
          where: { userId_feature_monthYear: { userId, feature: 'CHAT' as any, monthYear } },
          update: { count: { increment: 1 } },
          create: { userId, companyId: userCompanyId, feature: 'CHAT' as any, count: 1, monthYear },
        });
      } catch (trackErr) {
        this.logger.warn(`Failed to track CHAT usage: ${trackErr.message}`);
      }

      // Track domain questions for learning
      await this.trackDomainQuestion(userId, dto.message);

      // Update session title if it's the first real conversation
      if (conversationHistory.length <= 2 && session.title === 'New Chat') {
        const title = this.generateSessionTitle(dto.message);
        await this.prisma.chatSession.update({
          where: { id: session.id },
          data: { title },
        });
      }

      return {
        sessionId: session.id,
        message: assistantMessage,
        typing: false,
      };
    } catch (error) {
      this.logger.error('Error sending message:', error);
      throw error;
    }
  }

  /**
   * End a chat session
   */
  async endSession(userId: string, sessionId: string) {
    const session = await this.prisma.chatSession.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    return this.prisma.chatSession.update({
      where: { id: sessionId },
      data: {
        isActive: false,
        endedAt: new Date(),
      },
    });
  }

  /**
   * Get chat history for a user
   */
  async getChatHistory(userId: string, limit = 10) {
    return this.prisma.chatSession.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  /**
   * Get specific session
   */
  async getSession(userId: string, sessionId: string) {
    const session = await this.prisma.chatSession.findFirst({
      where: { id: sessionId, userId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    return session;
  }

  /**
   * Extract @mentions from message
   */
  private extractMentions(message: string): string[] {
    const mentionRegex = /@(\w+)/g;
    const mentions: string[] = [];
    let match;

    while ((match = mentionRegex.exec(message)) !== null) {
      mentions.push(match[1]);
    }

    return mentions;
  }

  /**
   * Extract /task references from message
   */
  private extractTaskReferences(message: string): string[] {
    const taskRegex = /\/([^\s]+)/g;
    const tasks: string[] = [];
    let match;

    while ((match = taskRegex.exec(message)) !== null) {
      tasks.push(match[1]);
    }

    // Also find codes like TSK-1001
    const tskRegex = /\bTSK-(\d+)\b/gi;
    while ((match = tskRegex.exec(message)) !== null) {
      tasks.push(match[0].toUpperCase());
    }

    return tasks;
  }

  /**
   * Extract #ticket references from message
   */
  private extractTicketReferences(message: string): string[] {
    const ticketRegex = /#([^\s]+)/g;
    const tickets: string[] = [];
    let match;

    while ((match = ticketRegex.exec(message)) !== null) {
      tickets.push(match[1]);
    }

    // Also find codes like TKT-1001
    const tktRegex = /\bTKT-(\d+)\b/gi;
    while ((match = tktRegex.exec(message)) !== null) {
      tickets.push(match[0].toUpperCase());
    }

    return tickets;
  }

  /**
   * Fetch additional context based on mentions and task references
   * COMPANY-SPECIFIC: Only fetch data from the user's company
   */
  private async fetchAdditionalContext(
    userId: string,
    mentions: string[],
    taskRefs: string[],
    ticketRefs: string[],
  ) {
    const context: any = {};

    // Get user's company for filtering
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true },
    });

    if (!user?.companyId) {
      return context; // No company, no context
    }

    // ALWAYS fetch the user's active tasks (limit for token safety)
    const activeTasks = await this.prisma.task.findMany({
      where: {
        companyId: user.companyId,
        completedAt: null,
        OR: [
          { assignedToId: userId },
          { assignments: { some: { userId } } },
        ]
      },
      select: {
        id: true,
        title: true,
        priority: true,
        dueDate: true,
        description: true, // Need this for context but truncate it later
        currentPhase: { select: { name: true } },
      },
      take: 10 // Reduced from 20
    });

    context.userActiveTasks = activeTasks.map(t => ({
      ...t,
      description: t.description?.substring(0, 300) + (t.description?.length > 300 ? '...' : '')
    }));

    // ALWAYS fetch the user's active tickets (limit for token safety)
    const activeTickets = await this.prisma.ticket.findMany({
      where: {
        companyId: user.companyId,
        status: { notIn: ['RESOLVED', 'CANCELLED'] },
        OR: [
          { requesterId: userId },
          { assignments: { some: { userId } } },
          { receiverManagerId: userId }
        ]
      },
      select: {
        id: true,
        ticketNumber: true,
        title: true,
        status: true,
        priority: true,
        description: true,
      },
      take: 5 // Reduced from 10
    });
    context.userActiveTickets = activeTickets.map(t => ({
      ...t,
      description: t.description?.substring(0, 300) + (t.description?.length > 300 ? '...' : '')
    }));

    // ALWAYS fetch the user's latest stats (optional but helpful)
    const completedTasksCount = await this.prisma.task.count({
      where: {
        companyId: user.companyId,
        completedAt: { not: null },
        OR: [
          { assignedToId: userId },
          { assignments: { some: { userId } } },
        ]
      }
    });

    context.userAnalytics = {
      activeTaskCount: activeTasks.length,
      completedTaskCount: completedTasksCount
    };

    // ALWAYS fetch company active Objectives (for general queries about goals)
    const activeObjectives = await this.prisma.objective.findMany({
      where: {
        companyId: user.companyId,
        status: { in: ['ON_TRACK', 'AT_RISK', 'OFF_TRACK'] }
      },
      select: {
        id: true,
        title: true,
        status: true,
      },
      take: 5 // Reduced from 10
    });
    context.companyObjectives = activeObjectives;

    // ALWAYS fetch active/upcoming quarters
    const activeQuarters = await this.prisma.quarter.findMany({
      where: {
        companyId: user.companyId,
        status: { in: ['ACTIVE', 'UPCOMING'] }
      },
      select: {
        id: true,
        name: true,
        year: true,
        status: true,
        startDate: true,
        endDate: true,
      },
      take: 2 // Reduced from 4
    });
    context.companyQuarters = activeQuarters;

    // Fetch mentioned users (SAME COMPANY ONLY)
    if (mentions.length > 0) {
      const users = await this.prisma.user.findMany({
        where: {
          companyId: user.companyId,
          name: {
            in: mentions,
            mode: 'insensitive',
          },
        },
        select: {
          id: true,
          name: true,
          role: true,
          position: true,
          // Limit nested tasks to avoid token bloat
          assignedTasks: {
            where: { completedAt: null },
            select: { title: true, priority: true },
            take: 3
          },
        },
      });
      context.mentionedUsers = users;
    }

    // Fetch referenced tasks (SAME COMPANY ONLY)
    if (taskRefs.length > 0) {
      const codes = taskRefs.filter(r => r.startsWith('TSK-'));
      const ticketCodes = taskRefs.filter(r => r.startsWith('TKT-'));
      const slugs = taskRefs.filter(r => !r.includes('-'));

      const tasks = await this.prisma.task.findMany({
        where: {
          companyId: user.companyId,
          OR: [
            ...(codes.length > 0 ? [{ taskNumber: { in: codes } }] : []),
            ...(slugs.length > 0 ? slugs.map(ref => ({ title: { contains: ref, mode: Prisma.QueryMode.insensitive } })) : []),
          ],
        },
        include: {
          assignedTo: { select: { name: true } },
          currentPhase: { select: { name: true } },
          comments: {
            take: 5,
            orderBy: { createdAt: 'desc' },
            select: { comment: true, user: { select: { name: true } } }
          }
        },
        take: 5
      });
      context.referencedTasks = tasks.map(t => ({
        ...t,
        description: t.description?.substring(0, 1000) + (t.description?.length > 1000 ? '...' : ''),
        comments: t.comments?.map(c => ({
          ...c,
          comment: c.comment.substring(0, 500) + (c.comment.length > 500 ? '...' : '')
        })) || []
      }));

      // Always fetch referenced tickets (TKT-1001 or #TKT-1001)
      const allTicketRefs = [...new Set([...ticketRefs, ...taskRefs.filter(r => r.startsWith('TKT-'))])];

      if (allTicketRefs.length > 0) {
        const tickets = await this.prisma.ticket.findMany({
          where: {
            companyId: user.companyId,
            ticketNumber: { in: allTicketRefs },
          },
          include: {
            requester: { select: { name: true } },
            receiverDept: { select: { name: true } },
            assignee: { select: { name: true } },
            comments: {
              where: { isSystem: false },
              take: 10, // Increased from 3
              orderBy: { createdAt: 'desc' },
              select: { comment: true, user: { select: { name: true } } }
            }
          },
        });
        context.referencedTickets = tickets.map(t => ({
          ...t,
          description: t.description?.substring(0, 2000) + (t.description?.length > 2000 ? '...' : ''),
          comments: t.comments.map(c => ({
            ...c,
            comment: c.comment.substring(0, 1000) + (c.comment.length > 1000 ? '...' : '')
          }))
        }));
      }
    }

    // NEW: Fetch recent Microsoft meeting transcripts for context
    try {
      const meetingContext = await this.microsoftService.getRecentMeetingContext(userId, 3);
      if (meetingContext.length > 0) {
        context.recentMeetings = meetingContext;
      }
    } catch (error) {
      this.logger.error('Failed to fetch meeting context for chat', error.message);
    }

    return context;
  }

  /**
   * Call AI chat service
   */
  /**
   * The AI service reports upstream rate limits inside a normal 200 response rather
   * than as an HTTP error, so this inspects the assistant text the user would see.
   */
  private isRateLimited(aiResponse: any): boolean {
    const text = String(aiResponse?.message ?? '');
    return /quota exceeded|rate limit|429|quota exhausted/i.test(text);
  }

  /**
   * How long the whole attempt may take, in milliseconds.
   *
   * This was ninety-five seconds, which is long enough to be indistinguishable from
   * the thing being broken. Waiting is only worth doing while it is likely to end in
   * an answer; past that it is just a slower way of saying no. Fifty seconds covers a
   * retry after a provider refuses a burst, and covers a service that was asleep when
   * the first attempt woke it, which is the case the warm-up ping already makes rare.
   */
  private static readonly CHAT_BUDGET_MS = 50_000;

  /** Waits between attempts. Short, since a rate limit usually clears in seconds. */
  private static readonly CHAT_BACKOFF_MS = [2_500, 5_000];

  /**
   * Per attempt. Long enough for a real answer including images, short enough that a
   * silent connection leaves room to try once more inside the budget.
   */
  private static readonly CHAT_ATTEMPT_TIMEOUT_MS = 22_000;

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Ask the AI service, and keep asking while it is worth asking.
   *
   * Most of what went wrong here was temporary and the user was told about it as
   * though it were permanent. A sleeping service takes the better part of a minute to
   * wake, and the request that wakes it is the one that fails. A free provider tier
   * refuses a burst and accepts the same message seconds later. In both cases the
   * honest thing is to wait and try again, not to hand back an apology the person can
   * do nothing with, and least of all one about quotas and API keys.
   *
   * So retryable failures are retried until the budget runs out, and only a genuinely
   * permanent problem is reported. Bad credentials are permanent and worth saying
   * plainly, because someone can act on them. Everything else gets the time it needs.
   */
  private async callAiChatService(data: any, deadline?: number) {
    const endBy = deadline ?? Date.now() + ChatService.CHAT_BUDGET_MS;
    let lastDetail = 'Unknown error';
    let attempt = 0;

    for (;;) {
      // Never start an attempt with less time left than it needs to mean anything.
      const remaining = endBy - Date.now();
      if (remaining < 3_000) {
        this.logger.warn(`AI chat out of time before attempt ${attempt + 1}`);
        break;
      }

      try {
        const response = await firstValueFrom(
          this.httpService.post(`${this.aiServiceUrl}/chat`, data, {
            headers: this.aiServiceHeaders,
            // Whichever is sooner: a normal attempt, or what is left of the deadline.
            timeout: Math.min(ChatService.CHAT_ATTEMPT_TIMEOUT_MS, remaining),
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
          }),
        );
        if (attempt > 0) {
          this.logger.log(`AI chat succeeded on attempt ${attempt + 1}`);
        }
        return response.data;
      } catch (error: any) {
        const statusCode = error.response?.status;
        const detail = error.response?.data?.detail;
        lastDetail = detail
          ? typeof detail === 'string'
            ? detail
            : JSON.stringify(detail)
          : error.message || 'Unknown error';

        // Credentials are the one thing waiting cannot fix, and the one thing an
        // admin can. Said plainly, immediately, rather than retried into a timeout.
        const isAuthProblem =
          statusCode === 401 ||
          statusCode === 403 ||
          lastDetail.includes('API_KEY_INVALID') ||
          lastDetail.includes('API key not valid');

        if (isAuthProblem) {
          this.logger.error(`AI chat rejected the credential: ${lastDetail}`);
          return {
            message:
              '⚠️ The AI key for your company is not being accepted. Please check it in company settings.',
            contextUsed: false,
            learnedContext: null,
          };
        }

        const isConnectionProblem =
          error.code === 'ECONNREFUSED' ||
          error.code === 'ENOTFOUND' ||
          error.code === 'ECONNRESET' ||
          error.code === 'ECONNABORTED' ||
          error.code === 'ETIMEDOUT' ||
          error.message?.includes('timeout') ||
          error.message?.includes('connect');

        const isBusy =
          statusCode === 429 ||
          statusCode >= 500 ||
          /quota|rate limit|429|overloaded|unavailable/i.test(lastDetail);

        const worthRetrying = isConnectionProblem || isBusy;
        const wait = ChatService.CHAT_BACKOFF_MS[
          Math.min(attempt, ChatService.CHAT_BACKOFF_MS.length - 1)
        ];

        // Only retry if what is left covers the wait and a worthwhile attempt after
        // it. Starting one the deadline will cut short spends the time and returns
        // nothing for it.
        const roomToTryAgain = Date.now() + wait + 8_000 <= endBy;

        if (!worthRetrying || !roomToTryAgain) {
          this.logger.error(`AI chat gave up after ${attempt + 1} attempt(s): ${lastDetail}`);
          break;
        }

        this.logger.warn(
          `AI chat attempt ${attempt + 1} failed (${lastDetail}); retrying in ${wait}ms`,
        );
        await this.sleep(wait);
        attempt++;
      }
    }

    // Out of time. Nothing here names quotas or keys: it is not the reader's problem
    // to solve, and the detail is in the logs and on the AI status page for the people
    // who can act on it.
    return {
      message:
        "That one is taking longer than it should. I have kept trying and not got there yet, so please send it again in a moment.",
      contextUsed: false,
      learnedContext: null,
    };
  }

  /**
   * Generate a session title from the first message
   */
  private generateSessionTitle(firstMessage: string): string {
    const words = firstMessage.split(' ').slice(0, 5);
    let title = words.join(' ');
    if (title.length > 50) {
      title = title.substring(0, 47) + '...';
    }
    return title || 'New Chat';
  }

  /**
   * Learn from user's task history
   * Analyzes completed and active tasks to extract insights
   * COMPANY-SPECIFIC: Only learns from the user's company data
   */
  async learnFromTaskHistory(userId: string) {
    try {
      // Get user context
      const userContext = await this.getUserContext(userId);

      // Get user's company for filtering
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { companyId: true },
      });

      if (!user?.companyId) {
        this.logger.warn('User has no company - skipping task history learning');
        return;
      }

      // Get completed tasks (last 10, COMPANY-SPECIFIC)
      const completedTasks = await this.prisma.task.findMany({
        where: {
          companyId: user.companyId, // CRITICAL: Same company only
          OR: [
            { createdById: userId },
            { assignedToId: userId },
            { assignments: { some: { userId } } },
          ],
          completedAt: { not: null },
        },
        orderBy: { completedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          title: true,
          description: true,
          taskType: true,
          priority: true,
          completedAt: true,
          goals: true,
        },
      });

      // Get active tasks (up to 5, COMPANY-SPECIFIC)
      const activeTasks = await this.prisma.task.findMany({
        where: {
          companyId: user.companyId, // CRITICAL: Same company only
          OR: [
            { createdById: userId },
            { assignedToId: userId },
            { assignments: { some: { userId } } },
          ],
          completedAt: null,
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          title: true,
          description: true,
          taskType: true,
          priority: true,
          dueDate: true,
          goals: true,
        },
      });

      // Call AI service to learn from tasks
      // Every learning call needs the company's own credential, exactly like the
      // chat call does. Sent without one, the AI service answered "AI is not
      // configured for your company" every single time and the error was swallowed
      // by the catch below, so this feature has never once run.
      const credential = await this.aiService.resolveAiCredential(userId);
      if (!credential) return null;

      const aiResponse = await this.httpService.axiosRef.post(
        `${this.aiServiceUrl}/learn-from-tasks`,
        {
          userContext: userContext.context,
          completedTasks,
          activeTasks,
          api_key: credential.apiKey,
          provider: credential.provider,
          model: credential.model ?? undefined,
        },
        {
          headers: this.aiServiceHeaders,
          timeout: 30000
        }
      );

      // Update user context with learned insights
      if (aiResponse.data?.learnedContext) {
        await this.updateUserContext(userId, aiResponse.data.learnedContext);
        this.logger.log(`✅ Learned from task history for user ${userId}`);
        return aiResponse.data.learnedContext;
      }

      return null;
    } catch (error) {
      this.logger.error(`Error learning from task history: ${error.message}`);
      return null;
    }
  }

  /**
   * Track domain-specific questions to learn user interests
   */
  async trackDomainQuestion(userId: string, message: string) {
    try {
      const userContext = await this.getUserContext(userId);
      const context = userContext.context as any;

      // Detect domain topics (generic company/industry terms)
      const domains = ['company', 'competitor', 'service', 'product', 'feature'];
      const messageLower = message.toLowerCase();

      for (const domain of domains) {
        if (messageLower.includes(domain)) {
          // Track question
          const questionsKey = `${domain}_questions`;
          const questions = context[questionsKey] || [];
          questions.push({
            question: message,
            timestamp: new Date().toISOString(),
          });

          // Keep only last 10 questions per domain
          const recentQuestions = questions.slice(-10);

          await this.updateUserContext(userId, {
            [questionsKey]: recentQuestions,
          });

          // If enough questions accumulated, trigger learning
          if (recentQuestions.length >= 3) {
            await this.learnDomainInterests(
              userId,
              domain,
              recentQuestions.map(q => q.question)
            );
          }

          break; // Only track for first matched domain
        }
      }
    } catch (error) {
      this.logger.error(`Error tracking domain question: ${error.message}`);
    }
  }

  /**
   * Learn what user is interested in regarding specific domains
   */
  private async learnDomainInterests(
    userId: string,
    domain: string,
    questions: string[]
  ) {
    try {
      const userContext = await this.getUserContext(userId);

      const credential = await this.aiService.resolveAiCredential(userId);
      if (!credential) return;

      const aiResponse = await this.httpService.axiosRef.post(
        `${this.aiServiceUrl}/learn-domain-interests`,
        {
          domainTopic: domain,
          userQuestions: questions,
          existingKnowledge: userContext.context,
          api_key: credential.apiKey,
          provider: credential.provider,
          model: credential.model ?? undefined,
        },
        {
          headers: this.aiServiceHeaders,
          timeout: 30000
        }
      );

      if (aiResponse.data?.learnedInterests) {
        await this.updateUserContext(userId, aiResponse.data.learnedInterests);
        this.logger.log(`✅ Learned ${domain} interests for user ${userId}`);
      }
    } catch (error) {
      this.logger.error(`Error learning domain interests: ${error.message}`);
    }
  }
}

