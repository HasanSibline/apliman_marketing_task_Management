import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import * as XLSX from 'xlsx';
import { UserRole } from '../types/prisma';

// This is a simplified version that provides basic analytics while the workflow system is integrated

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

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

  async getDashboardStats(userId?: string) {
    // Get company filter
    let companyId: string | null = null;
    if (userId) {
      companyId = await this.getUserCompanyId(userId);
    }

    const companyFilter = companyId ? { companyId } : {};

    const [
      totalUsers,
      activeUsers,
      totalTasks,
    ] = await Promise.all([
      this.prisma.user.count({
        where: { 
          status: { not: 'RETIRED' },
          ...companyFilter,
        },
      }),
      this.prisma.user.count({
        where: { 
          status: 'ACTIVE',
          ...companyFilter,
        },
      }),
      this.prisma.task.count({
        where: companyFilter,
      }),
    ]);

    // Get completed tasks using workflow phases
    const completedTasks = await this.getCompletedTasksCount(companyFilter);
    const inProgressTasks = await this.getInProgressTasksCount(companyFilter);
    const pendingTasks = await this.getPendingTasksCount(companyFilter);

    // Get overdue tasks
    const now = new Date();
    const overdueTasks = await this.prisma.task.count({
        where: {
        ...companyFilter,
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
      include: {
        _count: {
          select: { tasks: true }, // Count all tasks, not just MAIN
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
      where: { /* taskType: 'MAIN' */ }, // Show all tasks
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        assignedTo: { select: { name: true, email: true } },
        currentPhase: { select: { name: true, color: true } },
        workflow: { select: { name: true } },
      },
    });

    // Get top performers (users with most completed tasks)
    const topPerformers = await this.prisma.user.findMany({
      where: { status: 'ACTIVE' },
      take: 5,
      select: {
        id: true,
        name: true,
        email: true,
        position: true,
        _count: { select: { assignedTasks: true } },
      },
      orderBy: { assignedTasks: { _count: 'desc' } },
    });

    // Get tasks completed this week
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const completedPhaseIds = await this.prisma.phase.findMany({
      where: { isEndPhase: true },
      select: { id: true },
    }).then(phases => phases.map(p => p.id));

    const tasksCompletedThisWeek = await this.prisma.task.count({
      where: {
        // taskType: 'MAIN',  // Count all tasks
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
      topPerformers: topPerformers.map(user => ({
        name: user.name,
        email: user.email,
        position: user.position,
        tasksCompleted: user._count.assignedTasks,
      })),
      tasksCompletedThisWeek,
      weekOverWeekChange: 0,
    };
  }

  async getUserAnalytics(userId: string, timeRange?: string) {
    console.log('=== getUserAnalytics called ===');
    console.log('User ID:', userId);
    console.log('Time range:', timeRange);
    
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
    
    console.log('Date from:', dateFrom);
    console.log('Weeks to calculate:', weeks);
    
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

    console.log('User found:', user.name);

    // First, check ALL tasks assigned to this user (any type)
    const allAssignedTasks = await this.prisma.task.count({
      where: { assignedToId: userId },
    });
    console.log('Total tasks assigned (any type):', allAssignedTasks);

    // Check task types distribution
    const tasksByType = await this.prisma.task.groupBy({
      by: ['taskType'],
        where: { assignedToId: userId },
      _count: true,
    });
    console.log('Tasks by type:', JSON.stringify(tasksByType));

    const [
      totalAssignedTasks,
      totalCreatedTasks,
    ] = await Promise.all([
      this.prisma.task.count({
        where: {
          assignedToId: userId,
          // Count both MAIN tasks and SUBTASK if they exist
          // taskType: 'MAIN',
        },
      }),
      this.prisma.task.count({
        where: {
          createdById: userId,
          // Count both MAIN tasks and SUBTASK if they exist
          // taskType: 'MAIN',
        },
      }),
    ]);

    console.log('Total assigned MAIN tasks:', totalAssignedTasks);
    console.log('Total created MAIN tasks:', totalCreatedTasks);

    const completedTasks = await this.getCompletedTasksCount({ 
      assignedToId: userId,
      // taskType: 'MAIN',  // Remove filter to count all tasks
    });

    console.log('Completed tasks:', completedTasks);

    const inProgressTasks = await this.getInProgressTasksCount({
      assignedToId: userId,
      // taskType: 'MAIN',  // Remove filter to count all tasks
    });

    console.log('In progress tasks:', inProgressTasks);

    // Get performance trend based on time range
    const performanceTrend = [];
    console.log('Calculating performance trend...');
    
    for (let i = weeks - 1; i >= 0; i--) {
      const periodStart = new Date();
      const periodEnd = new Date();
      let label = '';
      
      if (timeRange === 'year') {
        // For year view, show months
        periodStart.setMonth(periodStart.getMonth() - i - 1);
        periodStart.setDate(1);
        periodStart.setHours(0, 0, 0, 0);
        
        periodEnd.setMonth(periodEnd.getMonth() - i);
        periodEnd.setDate(0); // Last day of previous month
        periodEnd.setHours(23, 59, 59, 999);
        
        label = periodStart.toLocaleString('default', { month: 'short', year: 'numeric' });
      } else {
        // For week/month view, show weeks
        periodStart.setDate(periodStart.getDate() - (i * 7 + 7));
        periodStart.setHours(0, 0, 0, 0);
        
        periodEnd.setDate(periodEnd.getDate() - (i * 7));
        periodEnd.setHours(23, 59, 59, 999);
        
        label = `Week ${weeks - i}`;
      }

      console.log(`Period ${weeks - i}: ${periodStart.toISOString()} to ${periodEnd.toISOString()}`);

      // Get tasks assigned in this period
      const assignedInPeriod = await this.prisma.task.count({
        where: {
          assignedToId: userId,
          // taskType: 'MAIN',  // Remove filter to count all tasks
          createdAt: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
      });

      // Get tasks completed in this period
      const completedPhaseIds = await this.prisma.phase.findMany({
        where: { isEndPhase: true },
        select: { id: true },
      }).then(phases => phases.map(p => p.id));

      const completedInPeriod = await this.prisma.task.count({
        where: {
          assignedToId: userId,
          // taskType: 'MAIN',  // Remove filter to count all tasks
          currentPhaseId: { in: completedPhaseIds },
          updatedAt: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
      });

      console.log(`  - Assigned: ${assignedInPeriod}, Completed: ${completedInPeriod}`);

      performanceTrend.push({
        date: label,
        completed: completedInPeriod,
        assigned: assignedInPeriod,
      });
    }

    // Get tasks by status
    const tasksByStatus = [
      { name: 'Completed', value: completedTasks },
      { name: 'In Progress', value: inProgressTasks },
      { name: 'Pending', value: totalAssignedTasks - completedTasks - inProgressTasks },
    ].filter(item => item.value > 0);

    console.log('Tasks by status:', tasksByStatus);

    // Get recent activity
    const recentTasks = await this.prisma.task.findMany({
      where: {
        assignedToId: userId,
        // taskType: 'MAIN',  // Remove filter to show all tasks
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

    console.log('Recent tasks count:', recentTasks.length);

    const result = {
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

    console.log('=== Returning analytics data ===');
    console.log(JSON.stringify(result, null, 2));
    
    return result;
  }

  async getTeamAnalytics(userId?: string) {
    // Get company filter
    let companyId: string | null = null;
    if (userId) {
      companyId = await this.getUserCompanyId(userId);
    }

    const companyFilter = companyId ? { companyId } : {};

    // Simplified team analytics
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
          this.prisma.task.count({ where: { assignedToId: user.id /* taskType: 'MAIN' */ } }), // Count all tasks
          this.getCompletedTasksCount({ assignedToId: user.id /* taskType: 'MAIN' */ }), // Count all tasks
    ]);

    return {
          ...user,
          assignedTasks,
          completedTasks,
          completionRate: assignedTasks > 0 ? Math.round((completedTasks / assignedTasks) * 100) : 0,
        };
      })
    );

    // Calculate summary stats
    const totalTasks = teamStats.reduce((sum, member) => sum + member.assignedTasks, 0);
    const totalCompleted = teamStats.reduce((sum, member) => sum + member.completedTasks, 0);
    const averageCompletionRate = teamStats.length > 0 
      ? Math.round(teamStats.reduce((sum, member) => sum + member.completionRate, 0) / teamStats.length)
      : 0;

    // Get tasks completed this week
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const completedPhaseIds = await this.prisma.phase.findMany({
      where: { isEndPhase: true },
      select: { id: true },
    }).then(phases => phases.map(p => p.id));

    const tasksCompletedThisWeek = await this.prisma.task.count({
        where: { 
        // taskType: 'MAIN',  // Count all tasks
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
      totalTimeSpent: 0, // TODO: Implement time tracking
    };
  }

  async exportData(format: 'excel' | 'csv' = 'excel') {
    // Simplified export - basic task data
    const tasks = await this.prisma.task.findMany({
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
      // CSV format
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      return XLSX.utils.sheet_to_csv(worksheet);
    }
  }

  // Placeholder methods for compatibility
  async getTasksByPhase() {
    return [];
  }

  async getRecentTasks() {
    return [];
  }

  async getTopPerformers() {
    return [];
  }

  async getTasksCompletedThisWeek() {
    return 0;
  }

  async getWeekOverWeekChange() {
    return 0;
  }
}