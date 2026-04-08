import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import * as XLSX from 'xlsx';
import { UserRole } from '../types/prisma';

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

  // Helper method to get completed tasks (temporary workaround)
  private async getCompletedTasksCount(whereClause: any = {}) {
    // Get tasks in "Completed" or "Published" phases
    const completedPhases = await this.prisma.phase.findMany({
      where: {
        OR: [
          { name: { contains: 'Completed' } },
          { name: { contains: 'Published' } },
          { name: { contains: 'Done' } },
          { isEndPhase: true },
        ],
      },
      select: { id: true },
    });

    const phaseIds = completedPhases.map(p => p.id);

    return this.prisma.task.count({
      where: {
        ...whereClause,
        currentPhaseId: { in: phaseIds.length > 0 ? phaseIds : ['none'] },
      },
    });
  }

  // Helper method to get in-progress tasks (temporary workaround)
  private async getInProgressTasksCount(whereClause: any = {}) {
    const inProgressPhases = await this.prisma.phase.findMany({
      where: {
        AND: [
          { isStartPhase: false },
          { isEndPhase: false },
        ],
      },
      select: { id: true },
    });

    const phaseIds = inProgressPhases.map(p => p.id);

    return this.prisma.task.count({
      where: {
        ...whereClause,
        currentPhaseId: { in: phaseIds.length > 0 ? phaseIds : [] },
      },
    });
  }

  // Helper method to get pending tasks (temporary workaround)
  private async getPendingTasksCount(whereClause: any = {}) {
    const startPhases = await this.prisma.phase.findMany({
      where: { isStartPhase: true },
      select: { id: true },
    });

    const phaseIds = startPhases.map(p => p.id);

    return this.prisma.task.count({
      where: {
        ...whereClause,
        currentPhaseId: { in: phaseIds.length > 0 ? phaseIds : [] },
      },
    });
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
        where: globalFilter,
      }),
    ]);

    // Get completed, in-progress and pending tasks using global company-wide filter (Command View)
    const completedTasks = await this.getCompletedTasksCount(globalFilter);
    const inProgressTasks = await this.getInProgressTasksCount(globalFilter);
    const pendingTasks = await this.getPendingTasksCount(globalFilter);

    // Get overdue tasks
    const now = new Date();
    const overdueTasks = await this.prisma.task.count({
      where: {
        ...globalFilter,
        dueDate: { lt: now },
        currentPhaseId: {
          notIn: await this.prisma.phase.findMany({
            where: { isEndPhase: true },
            select: { id: true },
          }).then(phases => phases.map(p => p.id))
        },
      },
    });

    // Get tasks by phase
    const tasksByPhase = await this.prisma.phase.findMany({
      where: { workflow: { ...baseFilter } },
      include: {
        _count: {
          select: { tasks: { where: roleFilter } }, 
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
      where: globalFilter, // Everyone can see recent company tickets in the hub
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        assignedTo: { select: { name: true, email: true } },
        currentPhase: { select: { name: true, color: true } },
        workflow: { select: { name: true } },
      },
    });

    // Get top performers (ALWAYS company-wide, even for non-admins)
    const completedPhaseIdsForPerformers = await this.prisma.phase.findMany({
      where: { isEndPhase: true, ...(companyId ? { workflow: { companyId } } : {}) },
      select: { id: true },
    }).then(phases => phases.map(p => p.id));

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
        _count: { select: { assignedTasks: true } },
      },
      orderBy: { assignedTasks: { _count: 'desc' } },
    });

    // Re-score by completed tasks for a meaningful ranking
    const performersWithCompletions = await Promise.all(
      topPerformers.map(async (u) => {
        const completed = await this.prisma.task.count({
          where: { assignedToId: u.id, currentPhaseId: { in: completedPhaseIdsForPerformers } },
        });
        return { ...u, completedTasks: completed };
      })
    );
    const topPerformersRanked = performersWithCompletions
      .sort((a, b) => b.completedTasks - a.completedTasks);

    // Get tasks completed this week
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const completedPhaseIds = await this.prisma.phase.findMany({
      where: { isEndPhase: true },
      select: { id: true },
    }).then(phases => phases.map(p => p.id));

    const tasksCompletedThisWeek = await this.prisma.task.count({
      where: {
        ...globalFilter,
        currentPhaseId: { in: completedPhaseIds },
        updatedAt: { gte: oneWeekAgo },
      },
    });

    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return {
      totalUsers,
      activeUsers,
      totalTasks,
      completedTasks,
      inProgressTasks,
      pendingTasks,
      overdueTasks,
      completionRate,
      tasksByPhase: tasksByPhaseFormatted,
      recentTasks: recentTasks.map(task => ({
        id: task.id,
        title: task.title,
        assignedTo: task.assignedTo?.name || 'Unassigned',
        phase: task.currentPhase?.name || 'Unknown',
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

    // Calculate date range based on timeRange parameter
    let dateFrom = new Date();
    let weeks = 4; // Default for chart

    switch (timeRange) {
      case 'week':
        dateFrom.setDate(dateFrom.getDate() - 7);
        weeks = 1;
        break;
      case 'month':
        dateFrom.setMonth(dateFrom.getMonth() - 1);
        weeks = 4;
        break;
      case 'year':
        dateFrom.setFullYear(dateFrom.getFullYear() - 1);
        weeks = 12; // Show last 12 months
        break;
      default:
        dateFrom.setMonth(dateFrom.getMonth() - 1); // Default to month
        weeks = 4;
    }

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
        where: {
          assignedToId: userId,
        },
      }),
      this.prisma.task.count({
        where: {
          createdById: userId,
        },
      }),
    ]);

    const completedTasks = await this.getCompletedTasksCount({
      assignedToId: userId,
    });

    const inProgressTasks = await this.getInProgressTasksCount({
      assignedToId: userId,
    });

    const performanceTrend = [];
    for (let i = weeks - 1; i >= 0; i--) {
      const periodStart = new Date();
      const periodEnd = new Date();
      let label = '';

      if (timeRange === 'year') {
        periodStart.setMonth(periodStart.getMonth() - i - 1);
        periodStart.setDate(1);
        periodStart.setHours(0, 0, 0, 0);

        periodEnd.setMonth(periodEnd.getMonth() - i);
        periodEnd.setDate(0); 
        periodEnd.setHours(23, 59, 59, 999);

        label = periodStart.toLocaleString('default', { month: 'short', year: 'numeric' });
      } else {
        periodStart.setDate(periodStart.getDate() - (i * 7 + 7));
        periodStart.setHours(0, 0, 0, 0);

        periodEnd.setDate(periodEnd.getDate() - (i * 7));
        periodEnd.setHours(23, 59, 59, 999);

        label = `Week ${weeks - i}`;
      }

      const assignedInPeriod = await this.prisma.task.count({
        where: {
          assignedToId: userId,
          createdAt: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
      });

      const completedPhaseIds = await this.prisma.phase.findMany({
        where: { isEndPhase: true },
        select: { id: true },
      }).then(phases => phases.map(p => p.id));

      const completedInPeriod = await this.prisma.task.count({
        where: {
          assignedToId: userId,
          currentPhaseId: { in: completedPhaseIds },
          updatedAt: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
      });

      performanceTrend.push({
        date: label,
        completed: completedInPeriod,
        assigned: assignedInPeriod,
      });
    }

    const tasksByStatus = [
      { name: 'Completed', value: completedTasks },
      { name: 'In Progress', value: inProgressTasks },
      { name: 'Pending', value: totalAssignedTasks - completedTasks - inProgressTasks },
    ].filter(item => item.value > 0);

    const recentTasks = await this.prisma.task.findMany({
      where: {
        assignedToId: userId,
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: {
        id: true,
        title: true,
        currentPhase: { select: { name: true } },
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
        pendingTasks: totalAssignedTasks - completedTasks - inProgressTasks,
        completionRate: totalAssignedTasks > 0 ? Math.round((completedTasks / totalAssignedTasks) * 100) : 0,
      },
      performanceTrend,
      tasksByStatus,
      recentActivity: recentTasks.map(task => ({
        id: task.id,
        title: task.title,
        phase: task.currentPhase?.name || 'Unknown',
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

    const teamStats = await Promise.all(
      users.map(async (user) => {
        const [assignedTasks, completedTasks] = await Promise.all([
          this.prisma.task.count({ where: { assignedToId: user.id } }), 
          this.getCompletedTasksCount({ assignedToId: user.id }), 
        ]);

        return {
          ...user,
          assignedTasks,
          completedTasks,
          completionRate: assignedTasks > 0 ? Math.round((completedTasks / assignedTasks) * 100) : 0,
        };
      })
    );

    const totalTasks = teamStats.reduce((sum, member) => sum + member.assignedTasks, 0);
    const totalCompleted = teamStats.reduce((sum, member) => sum + member.completedTasks, 0);
    const averageCompletionRate = teamStats.length > 0
      ? Math.round(teamStats.reduce((sum, member) => sum + member.completionRate, 0) / teamStats.length)
      : 0;

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const completedPhaseIds = await this.prisma.phase.findMany({
      where: { isEndPhase: true },
      select: { id: true },
    }).then(phases => phases.map(p => p.id));

    const tasksCompletedThisWeek = await this.prisma.task.count({
      where: {
        currentPhaseId: { in: completedPhaseIds },
        updatedAt: { gte: oneWeekAgo },
      },
    });

    return {
      teamMembers: teamStats,
      totalMembers: users.length,
      activeMembers: users.filter(u => u.status === 'ACTIVE').length,
      summary: {
        totalTeamMembers: users.length,
        totalTasks,
        averageCompletionRate,
        teamPerformance: averageCompletionRate,
        tasksCompletedThisWeek,
      },
      totalTimeSpent: 0, 
    };
  }

  async exportData(userId: string, format: 'excel' | 'csv' = 'excel') {
    const companyId = await this.getUserCompanyId(userId);
    const companyFilter = companyId ? { companyId } : {};

    const tasks = await this.prisma.task.findMany({
      where: companyFilter,
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
      'Current Phase': task.currentPhase.name,
      'Workflow': task.workflow.name,
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

  async getTasksByPhase() { return []; }
  async getRecentTasks() { return []; }
  async getTopPerformers() { return []; }
  async getTasksCompletedThisWeek() { return 0; }
  async getWeekOverWeekChange() { return 0; }
}