import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { deriveObjectiveStatus, elapsedFraction, objectiveProgress, objectivePercent, didObjectiveLand, keyResultPercent, isKeyResultMet, yearVerdict } from '../okr/okr-math';
import { realTasksOnly } from '../tasks/task-filters';

/**
 * Keeps quarters and objectives honest about time.
 *
 * Before this, quarter status only ever changed when a human clicked something, so
 * startDate and endDate were decorative: a quarter that ended in March could still
 * be ACTIVE in June. Objective status was set once at creation and never revisited,
 * so an objective at 10% with three days left still read ON_TRACK.
 *
 * Everything here is idempotent. Running it twice in a row changes nothing the
 * second time, which matters because Render can restart a service mid-run.
 */
@Injectable()
export class OkrAutomationService {
  private readonly logger = new Logger(OkrAutomationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Runs early enough that the day starts with correct statuses. */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async runDailyMaintenance(): Promise<void> {
    this.logger.log('Running OKR daily maintenance');
    await this.flagQuartersReadyToStart();
    await this.flagOverdueQuarters();
    await this.refreshObjectiveStatuses();
  }

  /**
   * A quarter whose start date has arrived is announced, never started.
   *
   * This used to activate it, and to close the previous one on the way past. Both
   * were wrong. Starting a cycle commits a team to a set of objectives, and closing
   * one decides what happens to every unfinished task; neither is a decision a
   * timestamp should make at one in the morning. Closing automatically was the worse
   * of the two, because it skipped the carry-over choice entirely and released work
   * nobody had agreed to drop.
   *
   * So the clock only ever tells someone that a quarter is due. Start cycle stays a
   * button a person presses.
   */
  async flagQuartersReadyToStart(): Promise<number> {
    const now = new Date();

    const due = await this.prisma.quarter.findMany({
      where: { status: 'UPCOMING', startDate: { lte: now } },
      orderBy: { startDate: 'asc' },
      select: { id: true, companyId: true, name: true, year: true, startDate: true },
    });

    const seen = new Set<string>();
    let flagged = 0;

    for (const quarter of due) {
      // One reminder per company: the earliest quarter waiting is the one to start.
      if (seen.has(quarter.companyId)) continue;
      seen.add(quarter.companyId);

      // A quarter still running is not late; its successor waits by design.
      const running = await this.prisma.quarter.findFirst({
        where: { companyId: quarter.companyId, status: 'ACTIVE' },
        select: { id: true, endDate: true },
      });
      if (running && running.endDate > now) continue;

      const daysWaiting = Math.floor(
        (now.getTime() - quarter.startDate.getTime()) / 86_400_000,
      );
      // Say it on the day, then weekly, rather than every morning forever.
      if (daysWaiting !== 0 && daysWaiting !== 1 && daysWaiting % 7 !== 0) continue;

      flagged++;
      await this.notifyCompanyAdmins(
        quarter.companyId,
        'QUARTER_READY_TO_START',
        `${quarter.name} ${quarter.year} is ready to start`,
        'Its start date has arrived. Open Strategy and press Start cycle when the team is ready. Nothing begins until you do.',
        '/strategy',
      );
    }

    return flagged;
  }

  /**
   * Quarters past their end date are not closed automatically: closing decides what
   * happens to unfinished work, and that is a judgement call. Instead the people who
   * can close it are told, once.
   */
  async flagOverdueQuarters(): Promise<number> {
    const now = new Date();

    const overdue = await this.prisma.quarter.findMany({
      where: { status: 'ACTIVE', endDate: { lt: now } },
      select: { id: true, companyId: true, name: true, year: true, endDate: true },
    });

    for (const quarter of overdue) {
      const daysOver = Math.floor((now.getTime() - quarter.endDate.getTime()) / 86_400_000);

      // Nag on the first day, then weekly, rather than every morning forever.
      if (daysOver !== 1 && daysOver % 7 !== 0) continue;

      const openTasks = await this.prisma.task.count({
        where: realTasksOnly({ quarterId: quarter.id, phase: { notIn: ['COMPLETED', 'ARCHIVED'] } }),
      });

      await this.notifyCompanyAdmins(
        quarter.companyId,
        'QUARTER_OVERDUE',
        `${quarter.name} ${quarter.year} ended ${daysOver} day${daysOver === 1 ? '' : 's'} ago`,
        openTasks > 0
          ? `${openTasks} task${openTasks === 1 ? '' : 's'} are still open. Closing the quarter lets you carry them over or release them.`
          : 'All its tasks are finished. Close the quarter to move on.',
        '/strategy',
      );
    }

    return overdue.length;
  }

  /**
   * Derive objective status from progress against time elapsed in its quarter.
   *
   * An objective is only meaningfully "at risk" relative to how much of the quarter
   * is gone: 40% done is healthy in week two and alarming in the final week. Pace is
   * progress divided by elapsed time, so 1.0 means exactly on schedule.
   *
   * CANCELLED is never touched: a human set it and time should not undo that.
   */
  async refreshObjectiveStatuses(): Promise<number> {
    const objectives = await this.prisma.objective.findMany({
      where: { status: { notIn: ['CANCELLED'] }, quarterId: { not: null } },
      select: {
        id: true,
        status: true,
        keyResults: { select: { startValue: true, targetValue: true, currentValue: true } },
        quarter: { select: { startDate: true, endDate: true, status: true } },
      },
    });

    const now = new Date();
    let changed = 0;

    for (const obj of objectives) {
      if (!obj.quarter || obj.keyResults.length === 0) continue;

      const progress = objectiveProgress(obj.keyResults);

      const elapsed = elapsedFraction(obj.quarter.startDate, obj.quarter.endDate, now);

      const next = deriveObjectiveStatus(progress, elapsed, obj.quarter.status === 'CLOSED');

      if (next === obj.status) continue;

      await this.prisma.objective.update({ where: { id: obj.id }, data: { status: next } });
      changed++;

      // Only a worsening status is worth interrupting someone for.
      if (next === 'AT_RISK' || next === 'OFF_TRACK') {
        await this.notifyObjectiveOwner(obj.id, next, Math.round(progress * 100), Math.round(elapsed * 100));
      }
    }

    if (changed > 0) this.logger.log(`Objective status updated on ${changed} objective(s)`);
    return changed;
  }


  private async notifyObjectiveOwner(
    objectiveId: string,
    status: 'AT_RISK' | 'OFF_TRACK',
    progressPct: number,
    elapsedPct: number,
  ): Promise<void> {
    const objective = await this.prisma.objective.findUnique({
      where: { id: objectiveId },
      select: { title: true, ownerId: true },
    });
    if (!objective?.ownerId) return;

    await this.notifications.createNotification({
      userId: objective.ownerId,
      type: status === 'AT_RISK' ? 'OBJECTIVE_AT_RISK' : 'OBJECTIVE_OFF_TRACK',
      title: status === 'AT_RISK' ? 'Objective is falling behind' : 'Objective is off track',
      message: `"${objective.title}" is ${progressPct}% complete with ${elapsedPct}% of the quarter gone.`,
      actionUrl: `/objectives/${objectiveId}`,
    });
  }

  /** Everyone in the company who can act on quarter-level decisions. */
  private async notifyCompanyAdmins(
    companyId: string,
    type: string,
    title: string,
    message: string,
    actionUrl: string,
  ): Promise<void> {
    const admins = await this.prisma.user.findMany({
      where: { companyId, status: 'ACTIVE', role: { in: ['COMPANY_ADMIN', 'ADMIN'] } },
      select: { id: true },
    });

    if (admins.length === 0) return;

    await this.notifications.createBulkNotifications(
      admins.map((a) => ({ userId: a.id, type, title, message, actionUrl })),
    );
  }
  // ─────────────────────────────────────────────────────────────────────────
  // Year rollover
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Close out a year for one company.
   *
   * Closes any quarter still open in that year, then carries unmet objectives into
   * the following year rather than letting them evaporate when their quarter shuts.
   *
   * A carried objective is a NEW objective linked back to the original through
   * carriedFromId. Moving the original would rewrite history and make last year look
   * like it finished work it did not; copying keeps the miss on the record and gives
   * the new year a fresh target. Key results are recreated at their current values,
   * so a KR that reached 60% starts the new year from 60% rather than from zero.
   *
   * Idempotent: an objective that already has a carry-forward is skipped, so running
   * this twice cannot duplicate anything.
   */
  async closeYear(
    companyId: string,
    year: number,
    options: { rolloverTaskIds?: string[]; leaveUnscheduled?: boolean } = {},
  ): Promise<{
    year: number;
    nextYear: number;
    quartersClosed: number;
    objectivesCompleted: number;
    objectivesCarried: number;
    nextYearQuartersCreated: number;
    targetQuarter: string | null;
    targetQuarterId: string | null;
    started: boolean;
    tasksRolledOver: number;
    tasksReleased: number;
  }> {
    const quarters = await this.prisma.quarter.findMany({
      where: { companyId, year },
      orderBy: { startDate: 'asc' },
      select: { id: true, name: true, status: true },
    });

    const stillOpen = quarters.filter((q) => q.status !== 'CLOSED');

    // Where next year begins. Creating it is unconditional now: ending a year with
    // nowhere for the unfinished work to go is what stranded it before.
    let nextYearQuartersCreated = 0;
    let target = await this.prisma.quarter.findFirst({
      where: { companyId, year: year + 1 },
      orderBy: { startDate: 'asc' },
      select: { id: true, name: true, status: true },
    });
    const nextYearAlreadyPlanned = Boolean(target);

    if (!target) {
      // Calendar quarters for the new year, all UPCOMING. Nothing starts on its own:
      // the year the app invented has no objectives in it yet.
      for (let i = 0; i < 4; i++) {
        const created = await this.prisma.quarter.create({
          data: {
            companyId,
            name: `Q${i + 1}`,
            year: year + 1,
            startDate: new Date(Date.UTC(year + 1, i * 3, 1)),
            // Last day of the quarter: day 0 of the next month rolls back one day.
            endDate: new Date(Date.UTC(year + 1, i * 3 + 3, 0, 23, 59, 59)),
            status: 'UPCOMING',
          },
          select: { id: true, name: true, status: true },
        });
        if (i === 0) target = created;
        nextYearQuartersCreated++;
      }
    }

    // Unfinished work gets the same decision a single quarter's close gives it. The
    // year used to shut its quarters directly, which left tasks pointing at a closed
    // cycle: not carried, not released, just invisible. That was worse than dropping
    // them, because nobody was told.
    const { tasksRolledOver, tasksReleased } = await this.settleTasksForClosingYear(
      companyId,
      year,
      stillOpen,
      options.rolloverTaskIds ?? [],
      options.leaveUnscheduled ? null : (target?.id ?? null),
      target,
    );

    // Ending a year ends its cycles now, so they record now as their real ending
    // rather than appearing to have run to whatever date was on the calendar.
    const closedAt = new Date();
    let quartersClosed = 0;
    for (const q of stillOpen) {
      await this.prisma.quarter.update({
        where: { id: q.id },
        data: { status: 'CLOSED', closedAt },
      });
      quartersClosed++;
    }

    const objectives = await this.prisma.objective.findMany({
      where: {
        companyId,
        quarter: { year },
        status: { notIn: ['CANCELLED'] },
        carriedTo: { none: {} }, // never carry the same objective twice
      },
      select: {
        id: true,
        title: true,
        description: true,
        ownerId: true,
        keyResults: {
          select: { title: true, unit: true, startValue: true, targetValue: true, currentValue: true },
        },
      },
    });

    let objectivesCompleted = 0;
    let objectivesCarried = 0;

    for (const obj of objectives) {
      const met = didObjectiveLand(obj.keyResults);

      if (met) {
        await this.prisma.objective.update({ where: { id: obj.id }, data: { status: 'COMPLETED' } });
        objectivesCompleted++;
        continue;
      }

      await this.prisma.objective.update({ where: { id: obj.id }, data: { status: 'OFF_TRACK' } });

      if (!target) continue; // nowhere to carry it to

      await this.prisma.objective.create({
        data: {
          companyId,
          quarterId: target.id,
          title: obj.title,
          description: obj.description,
          ownerId: obj.ownerId,
          status: 'ON_TRACK',
          carriedFromId: obj.id,
          keyResults: {
            create: obj.keyResults.map((kr) => ({
              title: kr.title,
              unit: kr.unit,
              // Resume from where the work actually got to, not from zero.
              startValue: kr.currentValue,
              currentValue: kr.currentValue,
              targetValue: kr.targetValue,
            })),
          },
        },
      });
      objectivesCarried++;

      if (obj.ownerId) {
        await this.notifications.createNotification({
          userId: obj.ownerId,
          type: 'OBJECTIVE_CARRIED_FORWARD',
          title: 'Objective carried into the new year',
          message: `"${obj.title}" did not complete in ${year} and continues in ${target.name} ${year + 1}, starting from the progress already made.`,
          actionUrl: '/objectives',
        });
      }
    }

    // A year the planners had already laid out takes over straight away, exactly as
    // one quarter hands to the next. A year the app just invented waits, because
    // nobody has agreed to it. Either way the team sees nothing until it is ready.
    let started = false;
    if (nextYearAlreadyPlanned && target?.status === 'UPCOMING') {
      const running = await this.prisma.quarter.findFirst({
        where: { companyId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!running) {
        await this.prisma.quarter.update({ where: { id: target.id }, data: { status: 'ACTIVE' } });
        started = true;
      }
    }

    this.logger.log(
      `Year ${year} closed for company ${companyId}: ${quartersClosed} quarter(s), ` +
        `${objectivesCompleted} completed, ${objectivesCarried} carried, ` +
        `${tasksRolledOver} task(s) carried, ${tasksReleased} released`,
    );

    await this.notifyCompanyAdmins(
      companyId,
      'YEAR_CLOSED',
      `${year} is closed`,
      target
        ? started
          ? `${target.name} ${year + 1} has started. ${objectivesCarried} unmet objective${objectivesCarried === 1 ? '' : 's'} carried forward with the progress already made.`
          : `${target.name} ${year + 1} is set up and waiting for you to plan it and press Start cycle. ${objectivesCarried} unmet objective${objectivesCarried === 1 ? '' : 's'} carried forward.`
        : `${objectivesCompleted} objective${objectivesCompleted === 1 ? '' : 's'} completed.`,
      '/strategy',
    );

    return {
      year,
      nextYear: year + 1,
      quartersClosed,
      objectivesCompleted,
      objectivesCarried,
      nextYearQuartersCreated,
      targetQuarter: target?.name ?? null,
      targetQuarterId: target?.id ?? null,
      started,
      tasksRolledOver,
      tasksReleased,
    };
  }

  /**
   * Carry or release every unfinished task in the quarters a year is about to close,
   * and tell each assignee which happened to theirs.
   *
   * Anything not named in `rolloverTaskIds` is released: it keeps its assignee and
   * belongs to no quarter. Carrying is the default the dialog offers, so a release
   * here is something a person chose.
   */
  private async settleTasksForClosingYear(
    companyId: string,
    year: number,
    openQuarters: { id: string }[],
    rolloverTaskIds: string[],
    targetQuarterId: string | null,
    target: { name: string; year?: number } | null,
  ): Promise<{ tasksRolledOver: number; tasksReleased: number }> {
    if (openQuarters.length === 0) return { tasksRolledOver: 0, tasksReleased: 0 };

    const quarterIds = openQuarters.map((q) => q.id);
    // Read both sets before writing, while the links still point somewhere. Left
    // unfiltered on purpose: these decide what the updates below touch, so they have
    // to reach subtask mirror rows too, or one is orphaned in a closed year.
    const [rollingOver, beingReleased] = await Promise.all([
      rolloverTaskIds.length > 0
        ? this.prisma.task.findMany({
            where: { id: { in: rolloverTaskIds }, companyId, quarterId: { in: quarterIds } },
            select: { id: true, title: true, assignedToId: true },
          })
        : Promise.resolve([]),
      this.prisma.task.findMany({
        where: {
          companyId,
          quarterId: { in: quarterIds },
          id: { notIn: rolloverTaskIds },
          phase: { notIn: ['COMPLETED', 'ARCHIVED'] },
        },
        select: { id: true, title: true, assignedToId: true },
      }),
    ]);

    if (rollingOver.length > 0) {
      await this.prisma.task.updateMany({
        where: { id: { in: rollingOver.map((t) => t.id) }, companyId },
        data: { quarterId: targetQuarterId, isRolledOver: true },
      });
    }

    if (beingReleased.length > 0) {
      await this.prisma.task.updateMany({
        where: { id: { in: beingReleased.map((t) => t.id) }, companyId },
        data: { quarterId: null },
      });
    }

    const payloads = [
      ...rollingOver
        .filter((t) => t.assignedToId)
        .map((t) => ({
          userId: t.assignedToId!,
          taskId: t.id,
          type: 'TASK_ROLLED_OVER',
          title: 'Your task moved into the new year',
          message: target
            ? `"${t.title}" carried from ${year} into ${target.name} ${year + 1}.`
            : `"${t.title}" carried out of ${year} and is not in a quarter yet.`,
          actionUrl: `/tasks/${t.id}`,
        })),
      ...beingReleased
        .filter((t) => t.assignedToId)
        .map((t) => ({
          userId: t.assignedToId!,
          taskId: t.id,
          type: 'TASK_RELEASED_FROM_QUARTER',
          title: 'Your task is no longer in a quarter',
          message: `${year} closed and "${t.title}" was not carried forward. It is still assigned to you and is now unscheduled.`,
          actionUrl: `/tasks/${t.id}`,
        })),
    ];

    if (payloads.length > 0) await this.notifications.createBulkNotifications(payloads);

    return { tasksRolledOver: rollingOver.length, tasksReleased: beingReleased.length };
  }

  /** Unfinished work still sitting in a year's open quarters, for the closing dialog. */
  async getOpenTasksForYear(companyId: string, year: number) {
    const quarters = await this.prisma.quarter.findMany({
      where: { companyId, year, status: { not: 'CLOSED' } },
      select: { id: true, name: true, year: true, status: true },
      orderBy: { startDate: 'asc' },
    });
    if (quarters.length === 0) return { quarters: [], tasks: [] };

    const tasks = await this.prisma.task.findMany({
      where: realTasksOnly({
        companyId,
        quarterId: { in: quarters.map((q) => q.id) },
        phase: { notIn: ['COMPLETED', 'ARCHIVED'] },
      }),
      select: {
        id: true,
        title: true,
        taskNumber: true,
        quarterId: true,
        assignedTo: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return { quarters, tasks };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Year report
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Everything needed to answer one question: did the company hit its goals this
   * year, and where did it fall short?
   *
   * Read-only. Closing a year changes data; reading a year must not, so this can be
   * run mid-year to see how things stand without committing to anything.
   */
  async getYearReport(companyId: string, year: number) {
    const quarters = await this.prisma.quarter.findMany({
      where: { companyId, year },
      orderBy: { startDate: 'asc' },
      select: {
        id: true, name: true, status: true, startDate: true, endDate: true,
        objectives: {
          select: {
            id: true, title: true, status: true, ownerId: true,
            keyResults: { select: { title: true, unit: true, startValue: true, targetValue: true, currentValue: true } },
          },
        },
      },
    });

    const quarterIds = quarters.map((q) => q.id);

    // Objective has an ownerId but no relation to User, so names are resolved in one
    // extra query rather than a join.
    const ownerIds = [...new Set(
      quarters.flatMap((q) => q.objectives.map((o) => o.ownerId).filter((id): id is string => !!id)),
    )];
    const owners = ownerIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true } })
      : [];
    const ownerName = new Map(owners.map((u) => [u.id, u.name]));

    // Task counts per quarter, in two queries rather than one per quarter.
    const [taskTotals, taskDone] = await Promise.all([
      quarterIds.length
        ? this.prisma.task.groupBy({ by: ['quarterId'], where: realTasksOnly({ quarterId: { in: quarterIds } }), _count: true })
        : Promise.resolve([] as any[]),
      quarterIds.length
        ? this.prisma.task.groupBy({
            by: ['quarterId'],
            where: realTasksOnly({ quarterId: { in: quarterIds }, phase: { in: ['COMPLETED', 'ARCHIVED'] } }),
            _count: true,
          })
        : Promise.resolve([] as any[]),
    ]);

    const totalBy = new Map(taskTotals.map((r: any) => [r.quarterId, r._count]));
    const doneBy = new Map(taskDone.map((r: any) => [r.quarterId, r._count]));

    const quarterRows = quarters.map((q) => {
      const objectives = q.objectives.map((o) => ({
        id: o.id,
        title: o.title,
        owner: o.ownerId ? ownerName.get(o.ownerId) ?? null : null,
        status: o.status,
        progress: objectivePercent(o.keyResults),
        landed: didObjectiveLand(o.keyResults),
        keyResults: o.keyResults.map((kr) => ({
          title: kr.title,
          unit: kr.unit,
          start: kr.startValue,
          target: kr.targetValue,
          current: Math.round(kr.currentValue * 100) / 100,
          progress: keyResultPercent(kr),
          met: isKeyResultMet(kr),
        })),
      }));

      const tasksTotal = totalBy.get(q.id) ?? 0;
      const tasksCompleted = doneBy.get(q.id) ?? 0;

      return {
        id: q.id,
        name: q.name,
        status: q.status,
        startDate: q.startDate,
        endDate: q.endDate,
        objectives,
        objectivesTotal: objectives.length,
        objectivesLanded: objectives.filter((o) => o.landed).length,
        // Mean objective progress, so a quarter with one objective at 100% and one at
        // 0% reads 50 rather than looking finished.
        progress: objectives.length
          ? Math.round(objectives.reduce((s, o) => s + o.progress, 0) / objectives.length)
          : 0,
        tasksTotal,
        tasksCompleted,
        taskCompletionRate: tasksTotal > 0 ? Math.round((tasksCompleted / tasksTotal) * 100) : 0,
      };
    });

    const allObjectives = quarterRows.flatMap((q) => q.objectives);
    const landed = allObjectives.filter((o) => o.landed);
    const allKeyResults = allObjectives.flatMap((o) => o.keyResults);

    const tasksTotal = quarterRows.reduce((s, q) => s + q.tasksTotal, 0);
    const tasksCompleted = quarterRows.reduce((s, q) => s + q.tasksCompleted, 0);

    const objectiveRate = allObjectives.length
      ? Math.round((landed.length / allObjectives.length) * 100)
      : 0;

    // The headline verdict. Thresholds are a judgement call, stated here rather than
    // hidden in the UI so they can be argued with and changed in one place.
    const verdict = yearVerdict(allObjectives.length, landed.length);

    return {
      year,
      verdict,
      objectiveRate,
      summary: {
        quarters: quarterRows.length,
        quartersClosed: quarterRows.filter((q) => q.status === 'CLOSED').length,
        objectivesTotal: allObjectives.length,
        objectivesLanded: landed.length,
        objectivesMissed: allObjectives.length - landed.length,
        keyResultsTotal: allKeyResults.length,
        keyResultsMet: allKeyResults.filter((kr) => kr.met).length,
        averageObjectiveProgress: allObjectives.length
          ? Math.round(allObjectives.reduce((s, o) => s + o.progress, 0) / allObjectives.length)
          : 0,
        tasksTotal,
        tasksCompleted,
        taskCompletionRate: tasksTotal > 0 ? Math.round((tasksCompleted / tasksTotal) * 100) : 0,
      },
      quarters: quarterRows,
      // Ranked worst first: a report is read to find what needs attention.
      shortfalls: allObjectives
        .filter((o) => !o.landed)
        .sort((a, b) => a.progress - b.progress)
        .map((o) => ({ id: o.id, title: o.title, owner: o.owner, progress: o.progress, status: o.status })),
    };
  }

}
