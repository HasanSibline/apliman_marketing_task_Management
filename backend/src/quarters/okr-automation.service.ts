import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

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

    const now = Date.now();
    let changed = 0;

    for (const obj of objectives) {
      if (!obj.quarter || obj.keyResults.length === 0) continue;

      const progress = this.meanProgress(obj.keyResults);

      const start = obj.quarter.startDate.getTime();
      const end = obj.quarter.endDate.getTime();
      const span = Math.max(end - start, 1);
      const elapsed = Math.min(Math.max((now - start) / span, 0), 1);

      let next: 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK' | 'COMPLETED';

      if (progress >= 0.999) {
        next = 'COMPLETED';
      } else if (obj.quarter.status === 'CLOSED') {
        // The quarter is over and the objective did not land.
        next = 'OFF_TRACK';
      } else if (elapsed <= 0.1) {
        // Too early to judge: nothing is behind in the first week.
        next = 'ON_TRACK';
      } else {
        const pace = progress / elapsed;
        next = pace >= 0.8 ? 'ON_TRACK' : pace >= 0.5 ? 'AT_RISK' : 'OFF_TRACK';
      }

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

  /** Mean completion across key results, each clamped to its own 0..1 range. */
  private meanProgress(keyResults: { startValue: number; targetValue: number; currentValue: number }[]): number {
    if (keyResults.length === 0) return 0;
    const total = keyResults.reduce((sum, kr) => {
      const range = kr.targetValue - kr.startValue;
      if (range === 0) return sum + (kr.currentValue >= kr.targetValue ? 1 : 0);
      const ratio = (kr.currentValue - kr.startValue) / range;
      return sum + Math.min(Math.max(ratio, 0), 1);
    }, 0);
    return total / keyResults.length;
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
}
