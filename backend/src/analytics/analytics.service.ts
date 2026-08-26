import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import * as XLSX from 'xlsx';
import { UserRole } from '../types/prisma';
import { taskStage, TASK_STAGE_LABEL } from '../tasks/task-stage';
import { realTasksOnly } from '../tasks/task-filters';
import {
  PhasePartition,
  TaskBucket,
  averageCompletionRate,
  bucketWhere,
  completionRate,
  notCompletedWhere,
  partitionPhaseIds,
  reconcileBuckets,
} from './task-buckets';
import { trendPeriods } from './trend-periods';
import {
  averageResolutionHours,
  backlogByAge,
  slaComplianceRate,
  volumeByDepartment,
} from './ticket-metrics';

// This is a simplified version that provides basic analytics while the workflow system is integrated

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) { }

  /**
   * Get user's companyId for filtering
   */
  private async getUserCompanyId(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true, role: true },
    });

    if (user?.role === UserRole.SUPER_ADMIN) {
      return null; // Super admin sees all companies
    }

    return user?.companyId || null;
  }

  /**
   * Every phase in scope, split into terminal, middle and starting.
   *
   * Scoped by company through the workflow, which is the only route there is: a phase
   * carries no companyId of its own, it belongs to a workflow and the workflow belongs
   * to a company. A previous attempt at this scoping put `companyId` directly on the
   * phase where-clause, which is not a column on that model and made Prisma reject the
   * query outright, so the dashboard failed for every user who was not a super admin.
   *
   * A null companyId means a super admin looking across all tenants, and then the
   * phase list is deliberately global to match the task counts it is paired with.
   */
  private async loadPhasePartition(companyId?: string | null): Promise<PhasePartition> {
    const phases = await this.prisma.phase.findMany({
      where: companyId ? { workflow: { companyId } } : {},
      select: { id: true, isStartPhase: true, isEndPhase: true },
    });

    return partitionPhaseIds(phases);
  }

  /** Tasks matching `whereClause` that fall in one bucket. */
  private countBucket(whereClause: any, bucket: TaskBucket, partition: PhasePartition) {
    // The fragment carries its own top-level OR, so it goes under AND rather than
    // being spread over the caller's clause where it could silently replace one.
    const existingAnd = whereClause.AND === undefined
      ? []
      : Array.isArray(whereClause.AND) ? whereClause.AND : [whereClause.AND];

    return this.prisma.task.count({
      where: realTasksOnly({
        ...whereClause,
        AND: [...existingAnd, bucketWhere(bucket, partition)],
      }),
    });
  }

  /**
   * All three buckets for one set of tasks, guaranteed to add up to `total`.
   *
   * The three used to be independent queries with three different ideas of what a
   * phase means, so they overlapped and left gaps. They now come from one partition,
   * and the reconcile step is a tripwire: it should never have anything to do.
   */
  private async countBuckets(whereClause: any, partition: PhasePartition, total: number) {
    const [completed, inProgress, pending] = await Promise.all([
      this.countBucket(whereClause, 'completed', partition),
      this.countBucket(whereClause, 'inProgress', partition),
      this.countBucket(whereClause, 'pending', partition),
    ]);

    const counts = reconcileBuckets(total, { completed, inProgress, pending });

    if (counts.unaccounted !== 0) {
      // Pending absorbs the difference so the chart still adds up, but a partition
      // that does not partition is a defect and has to leave a trace.
      this.logger.warn(
        `Task buckets did not partition ${total} tasks (${JSON.stringify(whereClause)}): ` +
        `${counts.unaccounted} unaccounted for`,
      );
    }

    return counts;
  }

  async getDashboardStats(userId: string) {
    // Get user and company filter
    const userData = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true, role: true },
    });

    if (!userData) throw new Error('User not found');

    const isAdmin = [UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN].includes(userData.role as any);
    const companyId = userData.role === UserRole.SUPER_ADMIN ? null : userData.companyId;
    const baseFilter = companyId ? { companyId } : {};
    
    // Global stats are always company-wide for all users as requested
    const globalFilter = { ...baseFilter };
    
    // Tasks by Workflow/Phase remain personal for non-admins
    const roleFilter = isAdmin ? { ...baseFilter } : { ...baseFilter, assignedToId: userId };

    const [
      totalUsers,
      activeUsers,
      totalTasks,
    ] = await Promise.all([
      this.prisma.user.count({
        where: {
          status: { not: 'RETIRED' },
          ...baseFilter, 
        },
      }),
      this.prisma.user.count({
        where: {
          status: 'ACTIVE',
          ...baseFilter, 
        },
      }),
      this.prisma.task.count({
        where: realTasksOnly(globalFilter),
      }),
    ]);

    // Completed, In progress and Pending partition exactly the set that totalTasks
    // counted, using the global company-wide filter (Command View). The frontend
    // stacks them in a bar and a pie, so anything less than a partition draws a chart
    // that contradicts the total printed beside it.
    const phasePartition = await this.loadPhasePartition(companyId);
    const {
      completed: completedTasks,
      inProgress: inProgressTasks,
      pending: pendingTasks,
    } = await this.countBuckets(globalFilter, phasePartition, totalTasks);

    // Overdue is "past its due date and not finished", and it now says so with the
    // same rule the buckets use. It used to say `currentPhaseId: { notIn: endPhases }`,
    // which Prisma renders as a negation that drops rows where the column is NULL, so
    // a task with no phase could be a year late and never appear here.
    const now = new Date();
    const overdueTasks = await this.prisma.task.count({
      where: realTasksOnly({
        ...globalFilter,
        dueDate: { lt: now },
        AND: [notCompletedWhere(phasePartition)],
      }),
    });

    // Get tasks by phase
    const tasksByPhase = await this.prisma.phase.findMany({
      where: { workflow: { ...baseFilter } },
      include: {
        _count: {
          select: { tasks: { where: realTasksOnly(roleFilter) } },
        },
        workflow: { select: { name: true, color: true } },
      },
      orderBy: { order: 'asc' },
    });

    const tasksByPhaseFormatted = tasksByPhase.map(phase => ({
      phase: phase.name,
      count: phase._count.tasks,
      workflow: phase.workflow.name,
      color: phase.color || phase.workflow.color,
    }));

    // Get recent tasks
    const recentTasks = await this.prisma.task.findMany({
      where: realTasksOnly(globalFilter), // Everyone can see recent company tickets in the hub
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        assignedTo: { select: { name: true, email: true } },
        // isEndPhase and completedAt are what taskStage reads. Without them the
        // status below is the workflow phase wearing the word "status", which is how
        // a finished task came to be listed as To Do.
        currentPhase: { select: { name: true, color: true, isEndPhase: true } },
        workflow: { select: { name: true } },
      },
    });

    // Get top performers (ALWAYS company-wide, even for non-admins)
    const topPerformers = await this.prisma.user.findMany({
      where: { 
        status: { not: 'RETIRED' },
        ...baseFilter 
      },
      take: 1000, // Show full company roster
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        position: true,
        _count: { select: { assignedTasks: { where: realTasksOnly() } } },
      },
      orderBy: { assignedTasks: { _count: 'desc' } },
    });

    // Re-score by completed tasks for a meaningful ranking. Same rule as the Completed
    // KPI above, so the leaderboard column and the headline count cannot disagree
    // about the same person's finished work.
    const performersWithCompletions = await Promise.all(
      topPerformers.map(async (u) => {
        const completed = await this.countBucket({ assignedToId: u.id }, 'completed', phasePartition);
        return { ...u, completedTasks: completed };
      })
    );
    const topPerformersRanked = performersWithCompletions
      .sort((a, b) => b.completedTasks - a.completedTasks);

    // Get tasks completed this week. The end-phase list here was global, so one
    // tenant's week included every other tenant's finished work.
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const tasksCompletedThisWeek = await this.countBucket(
      { ...globalFilter, updatedAt: { gte: oneWeekAgo } },
      'completed',
      phasePartition,
    );

    return {
      totalUsers,
      activeUsers,
      totalTasks,
      completedTasks,
      inProgressTasks,
      pendingTasks,
      overdueTasks,
      completionRate: completionRate(completedTasks, totalTasks),
      tasksByPhase: tasksByPhaseFormatted,
      recentTasks: recentTasks.map(task => ({
        id: task.id,
        title: task.title,
        assignedTo: task.assignedTo?.name || 'Unassigned',
        /**
         * Where the task has got to, by the one rule the whole app uses.
         *
         * This reported currentPhase.name, which is a different question. A workflow
         * phase is the step a task sits at inside its workflow; a stage is whether
         * anyone has started it and whether it is done. A task finished by ticking
         * every subtask keeps whatever phase it was in, so the table listed work that
         * was plainly Completed on the board as To do here, and the two screens
         * contradicted each other.
         */
        phase: TASK_STAGE_LABEL[taskStage(task)],
        /** The workflow step, still worth showing, no longer pretending to be status. */
        workflowPhase: task.currentPhase?.name || null,
        phaseColor: task.currentPhase?.color,
        workflow: task.workflow?.name || 'Unknown',
        createdAt: task.createdAt,
      })),
      topPerformers: topPerformersRanked.map(user => ({
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        position: user.position,
        tasksCompleted: (user as any).completedTasks ?? 0,
      })),
      tasksCompletedThisWeek,
      weekOverWeekChange: 0,
    };
  }

  async getUserAnalytics(userId: string, timeRange?: string) {
    this.logger.debug(`getUserAnalytics userId=${userId} range=${timeRange}`);

    // How many buckets the trend chart gets. There was also a `dateFrom` here,
    // computed four different ways and then never read by anything; the buckets below
    // carry their own bounds.
    const periodCount = timeRange === 'week' ? 1 : timeRange === 'year' ? 12 : 4;

    // Get user details
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        position: true,
        status: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const [
      totalAssignedTasks,
      totalCreatedTasks,
    ] = await Promise.all([
      this.prisma.task.count({
        where: realTasksOnly({ assignedToId: userId }),
      }),
      this.prisma.task.count({
        where: realTasksOnly({ createdById: userId }),
      }),
    ]);

    // Scoped to the user's own company, so the phase lists this user's counts are
    // measured against are their tenant's and nobody else's.
    const phasePartition = await this.loadPhasePartition(await this.getUserCompanyId(userId));

    const {
      completed: completedTasks,
      inProgress: inProgressTasks,
      pending: pendingTasks,
    } = await this.countBuckets({ assignedToId: userId }, phasePartition, totalAssignedTasks);

    const performanceTrend = [];
    for (const period of trendPeriods(new Date(), timeRange, periodCount)) {
      const assignedInPeriod = await this.prisma.task.count({
        where: realTasksOnly({
          assignedToId: userId,
          createdAt: {
            gte: period.start,
            lte: period.end,
          },
        }),
      });

      // The end-phase list used to be re-fetched inside this loop, twelve times over
      // for a year, and it ignored the completion signals the KPI above reads.
      const completedInPeriod = await this.countBucket(
        {
          assignedToId: userId,
          updatedAt: { gte: period.start, lte: period.end },
        },
        'completed',
        phasePartition,
      );

      performanceTrend.push({
        date: period.label,
        completed: completedInPeriod,
        assigned: assignedInPeriod,
      });
    }

    // The same three numbers the stats block returns. This list used to recompute
    // Pending with its own copy of `total - completed - inProgress`, clamped here and
    // unclamped there, so the chart and the counter beside it could disagree.
    const tasksByStatus = [
      { name: 'Completed', value: completedTasks },
      { name: 'In Progress', value: inProgressTasks },
      { name: 'Pending', value: pendingTasks },
    ].filter(item => item.value > 0);

    const recentTasks = await this.prisma.task.findMany({
      where: realTasksOnly({ assignedToId: userId }),
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: {
        id: true,
        title: true,
        // Same three fields taskStage reads, for the same reason as above.
        phase: true,
        completedAt: true,
        currentPhase: { select: { name: true, isEndPhase: true } },
        updatedAt: true,
      },
    });

    return {
      user,
      stats: {
        totalAssignedTasks,
        totalCreatedTasks,
        completedTasks,
        inProgressTasks,
        pendingTasks,
        completionRate: completionRate(completedTasks, totalAssignedTasks),
      },
      performanceTrend,
      tasksByStatus,
      recentActivity: recentTasks.map(task => ({
        id: task.id,
        title: task.title,
        phase: TASK_STAGE_LABEL[taskStage(task)],
        workflowPhase: task.currentPhase?.name || null,
        updatedAt: task.updatedAt,
      })),
    };
  }

  async getTeamAnalytics(userId?: string) {
    let companyId: string | null = null;
    if (userId) {
      companyId = await this.getUserCompanyId(userId);
    }

    const companyFilter = companyId ? { companyId } : {};

    const users = await this.prisma.user.findMany({
      where: {
        status: { not: 'RETIRED' },
        ...companyFilter,
      },
      select: {
        id: true,
        name: true,
        email: true,
        position: true,
        status: true,
      },
    });

    // Loaded once for the whole team. It used to be re-read inside the per-member
    // count, which fetched every phase on the platform once per person.
    const phasePartition = await this.loadPhasePartition(companyId);

    const teamStats = await Promise.all(
      users.map(async (user) => {
        const [assignedTasks, completedTasks] = await Promise.all([
          this.prisma.task.count({ where: realTasksOnly({ assignedToId: user.id }) }),
          this.countBucket({ assignedToId: user.id }, 'completed', phasePartition),
        ]);

        return {
          ...user,
          assignedTasks,
          completedTasks,
          completionRate: completionRate(completedTasks, assignedTasks),
        };
      })
    );

    /**
     * Every real task in the company, which is what a card labelled "Total Tasks"
     * has to mean.
     *
     * This was the sum of the per-member assigned counts, so it silently dropped every
     * unassigned task and every task belonging to a retired member, and could never
     * match the same number on the dashboard. The member sum is still returned, under
     * a name that says what it actually is.
     */
    const totalTasks = await this.prisma.task.count({ where: realTasksOnly(companyFilter) });
    const assignedTasks = teamStats.reduce((sum, member) => sum + member.assignedTasks, 0);

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    // Company-scoped on purpose. This used to carry no company filter at all, so a
    // team's "completed this week" counted every tenant's finished work.
    const tasksCompletedThisWeek = await this.countBucket(
      { ...companyFilter, updatedAt: { gte: oneWeekAgo } },
      'completed',
      phasePartition,
    );

    const teamCompletionRate = averageCompletionRate(teamStats);

    return {
      teamMembers: teamStats,
      totalMembers: users.length,
      activeMembers: users.filter(u => u.status === 'ACTIVE').length,
      summary: {
        totalTeamMembers: users.length,
        totalTasks,
        /** The old totalTasks: how much of the above is on somebody's plate. */
        assignedTasks,
        averageCompletionRate: teamCompletionRate,
        teamPerformance: teamCompletionRate,
        tasksCompletedThisWeek,
      },
      totalTimeSpent: 0,
    };
  }

  async exportData(userId: string, format: 'excel' | 'csv' = 'excel') {
    const companyId = await this.getUserCompanyId(userId);
    const companyFilter = companyId ? { companyId } : {};

    // The export is an analytics artefact, not a database dump: counting its rows has
    // to give the same total the dashboard shows, or the discrepancy this filter
    // exists to remove simply reappears in a spreadsheet. The Task Type column below
    // still earns its place, since GENERAL, SOCIAL_MEDIA and COORDINATION remain.
    const tasks = await this.prisma.task.findMany({
      where: realTasksOnly(companyFilter),
      include: {
        createdBy: { select: { name: true, email: true } },
        assignedTo: { select: { name: true, email: true } },
        currentPhase: { select: { name: true } },
        workflow: { select: { name: true } },
      },
    });

    const exportData = tasks.map(task => ({
      'Task ID': task.id,
      'Title': task.title,
      'Description': task.description,
      'Task Type': task.taskType,
      'Priority': task.priority,
      // Both relations are optional on Task, and dereferencing them threw the whole
      // export away the moment one row had no workflow. strictNullChecks is off, so
      // the compiler never said so.
      'Current Phase': task.currentPhase?.name || 'No phase',
      'Workflow': task.workflow?.name || 'No workflow',
      'Created By': task.createdBy.name,
      'Assigned To': task.assignedTo?.name || 'Unassigned',
      'Created At': task.createdAt.toISOString(),
      'Due Date': task.dueDate?.toISOString() || '',
    }));

    if (format === 'excel') {
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Tasks');

      return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    } else {
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      return XLSX.utils.sheet_to_csv(worksheet);
    }
  }

  /**
   * Resolution time, SLA compliance, backlog age and department volume for one
   * company's tickets.
   *
   * companyId is required, unlike the task methods above: there is no "all companies"
   * mode here because nothing calling this route needs one (see the controller), and
   * a ticket carries no workflow to fall back on the way `loadPhasePartition` does for
   * a super admin looking across every tenant.
   */
  async getTicketAnalytics(companyId: string) {
    const tickets = await this.prisma.ticket.findMany({
      where: { companyId },
      select: {
        createdAt: true,
        resolvedAt: true,
        deadline: true,
        status: true,
        receiverDeptId: true,
        receiverDept: { select: { name: true } },
      },
    });

    const departmentTickets = tickets.map((t) => ({
      receiverDeptId: t.receiverDeptId,
      departmentName: t.receiverDept?.name || 'Unknown',
    }));

    return {
      averageResolutionHours: averageResolutionHours(tickets),
      slaComplianceRate: slaComplianceRate(tickets),
      backlogByAge: backlogByAge(tickets, new Date()),
      volumeByDepartment: volumeByDepartment(departmentTickets),
      totalTickets: tickets.length,
    };
  }

  async getTasksByPhase() { return []; }
  async getRecentTasks() { return []; }
  async getTopPerformers() { return []; }
  async getTasksCompletedThisWeek() { return 0; }
  async getWeekOverWeekChange() { return 0; }
}