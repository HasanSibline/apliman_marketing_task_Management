import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { deriveObjectiveStatus, elapsedFraction, objectiveProgress, didObjectiveLand, keyResultProgress, isKeyResultMet, yearVerdict } from '../okr/okr-math';

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
    await this.activateDueQuarters();
    await this.flagOverdueQuarters();
    await this.refreshObjectiveStatuses();
  }

  /**
   * UPCOMING quarters whose start date has arrived become ACTIVE.
   *
   * Only one quarter per company may be ACTIVE, matching the behaviour of manual
   * activation. When several are due at once, the earliest start wins and the rest
   * wait for the next run rather than silently overlapping.
   */
  async activateDueQuarters(): Promise<number> {
    const now = new Date();

    const due = await this.prisma.quarter.findMany({
      where: { status: 'UPCOMING', startDate: { lte: now } },
      orderBy: { startDate: 'asc' },
      select: { id: true, companyId: true, name: true, year: true },
    });

    const seen = new Set<string>();
    let activated = 0;

    for (const quarter of due) {
      if (seen.has(quarter.companyId)) continue;
      seen.add(quarter.companyId);

      const alreadyActive = await this.prisma.quarter.findFirst({
        where: { companyId: quarter.companyId, status: 'ACTIVE' },
        select: { id: true, endDate: true },
      });

      // An active quarter that has not ended yet keeps its place: starting the next
      // one early would close it behind the team's back.
      if (alreadyActive && alreadyActive.endDate > now) continue;

      await this.prisma.$transaction([
        ...(alreadyActive
          ? [
              this.prisma.quarter.update({
                where: { id: alreadyActive.id },
                data: { status: 'CLOSED' as const },
              }),
            ]
          : []),
        this.prisma.quarter.update({
          where: { id: quarter.id },
          data: { status: 'ACTIVE' as const },
        }),
      ]);

      activated++;
      this.logger.log(`Activated ${quarter.name} ${quarter.year} for company ${quarter.companyId}`);
      await this.notifyCompanyAdmins(
        quarter.companyId,
        'QUARTER_STARTED',
        `${quarter.name} ${quarter.year} has started`,
        `The quarter is now active. Tasks and objectives linked to it are in play.`,
        '/quarters',
      );
    }

    return activated;
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
        where: { quarterId: quarter.id, phase: { notIn: ['COMPLETED', 'ARCHIVED'] } },
      });

      await this.notifyCompanyAdmins(
        quarter.companyId,
        'QUARTER_OVERDUE',
        `${quarter.name} ${quarter.year} ended ${daysOver} day${daysOver === 1 ? '' : 's'} ago`,
        openTasks > 0
          ? `${openTasks} task${openTasks === 1 ? '' : 's'} are still open. Closing the quarter lets you carry them over or release them.`
          : 'All its tasks are finished. Close the quarter to move on.',
        '/quarters',
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
    options: { createNextYearQuarters?: boolean } = {},
  ): Promise<{
    year: number;
    quartersClosed: number;
    objectivesCompleted: number;
    objectivesCarried: number;
    nextYearQuartersCreated: number;
    targetQuarter: string | null;
  }> {
    const quarters = await this.prisma.quarter.findMany({
      where: { companyId, year },
      orderBy: { startDate: 'asc' },
      select: { id: true, name: true, status: true },
    });

    let quartersClosed = 0;
    for (const q of quarters.filter((q) => q.status !== 'CLOSED')) {
      await this.prisma.quarter.update({ where: { id: q.id }, data: { status: 'CLOSED' } });
      quartersClosed++;
    }

    // Where carried objectives land: the earliest quarter of the following year.
    let nextYearQuartersCreated = 0;
    let target = await this.prisma.quarter.findFirst({
      where: { companyId, year: year + 1 },
      orderBy: { startDate: 'asc' },
      select: { id: true, name: true },
    });

    if (!target && options.createNextYearQuarters) {
      // Calendar quarters for the new year, all UPCOMING. The daily job activates
      // each one on its start date, so nobody has to remember.
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
          select: { id: true, name: true },
        });
        if (i === 0) target = created;
        nextYearQuartersCreated++;
      }
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

    this.logger.log(
      `Year ${year} closed for company ${companyId}: ${quartersClosed} quarter(s), ` +
        `${objectivesCompleted} completed, ${objectivesCarried} carried`,
    );

    return {
      year,
      quartersClosed,
      objectivesCompleted,
      objectivesCarried,
      nextYearQuartersCreated,
      targetQuarter: target?.name ?? null,
    };
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
        ? this.prisma.task.groupBy({ by: ['quarterId'], where: { quarterId: { in: quarterIds } }, _count: true })
        : Promise.resolve([] as any[]),
      quarterIds.length
        ? this.prisma.task.groupBy({
            by: ['quarterId'],
            where: { quarterId: { in: quarterIds }, phase: { in: ['COMPLETED', 'ARCHIVED'] } },
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
        progress: Math.round(objectiveProgress(o.keyResults) * 100),
        landed: didObjectiveLand(o.keyResults),
        keyResults: o.keyResults.map((kr) => ({
          title: kr.title,
          unit: kr.unit,
          start: kr.startValue,
          target: kr.targetValue,
          current: Math.round(kr.currentValue * 100) / 100,
          progress: Math.round(keyResultProgress(kr) * 100),
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
