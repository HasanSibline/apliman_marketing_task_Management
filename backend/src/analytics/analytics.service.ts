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

  async getDashboardStats() {
    const [
      totalUsers,
      activeUsers,
      totalTasks,
    ] = await Promise.all([
      this.prisma.user.count({
        where: { status: { not: 'RETIRED' } },
      }),
      this.prisma.user.count({
        where: { status: 'ACTIVE' },
      }),
      this.prisma.task.count({ where: { taskType: 'MAIN' } }),
    ]);

    // Get completed tasks using workflow phases
    const completedTasks = await this.getCompletedTasksCount({ taskType: 'MAIN' });
    const inProgressTasks = await this.getInProgressTasksCount({ taskType: 'MAIN' });
    const pendingTasks = await this.getPendingTasksCount({ taskType: 'MAIN' });

    // Get overdue tasks
    const now = new Date();
    const overdueTasks = await this.prisma.task.count({
        where: {
        taskType: 'MAIN',
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
          select: { tasks: { where: { taskType: 'MAIN' } } },
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
      where: { taskType: 'MAIN' },
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
        taskType: 'MAIN',
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

  async getUserAnalytics(userId: string) {
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
          taskType: 'MAIN',
        },
      }),
      this.prisma.task.count({
        where: { 
          createdById: userId,
          taskType: 'MAIN',
        },
      }),
    ]);

    const completedTasks = await this.getCompletedTasksCount({ 
      assignedToId: userId,
      taskType: 'MAIN',
    });

    const inProgressTasks = await this.getInProgressTasksCount({
      assignedToId: userId,
      taskType: 'MAIN',
    });

    // Get performance trend for the last 4 weeks
    const performanceTrend = [];
    for (let i = 3; i >= 0; i--) {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - (i * 7 + 7));
      weekStart.setHours(0, 0, 0, 0);
      
      const weekEnd = new Date();
      weekEnd.setDate(weekEnd.getDate() - (i * 7));
      weekEnd.setHours(23, 59, 59, 999);

      // Get tasks assigned in this week
      const assignedInWeek = await this.prisma.task.count({
        where: {
          assignedToId: userId,
          taskType: 'MAIN',
          createdAt: {
            gte: weekStart,
            lte: weekEnd,
          },
        },
      });

      // Get tasks completed in this week
      const completedPhaseIds = await this.prisma.phase.findMany({
        where: { isEndPhase: true },
        select: { id: true },
      }).then(phases => phases.map(p => p.id));

      const completedInWeek = await this.prisma.task.count({
        where: {
          assignedToId: userId,
          taskType: 'MAIN',
          currentPhaseId: { in: completedPhaseIds },
          updatedAt: {
            gte: weekStart,
            lte: weekEnd,
          },
        },
      });

      performanceTrend.push({
        date: `Week ${4 - i}`,
        completed: completedInWeek,
        assigned: assignedInWeek,
      });
    }

    // Get tasks by status
    const tasksByStatus = [
      { name: 'Completed', value: completedTasks },
      { name: 'In Progress', value: inProgressTasks },
      { name: 'Pending', value: totalAssignedTasks - completedTasks - inProgressTasks },
    ].filter(item => item.value > 0);

    // Get recent activity
    const recentTasks = await this.prisma.task.findMany({
      where: {
        assignedToId: userId,
        taskType: 'MAIN',
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

  async getTeamAnalytics() {
    // Simplified team analytics
    const users = await this.prisma.user.findMany({
      where: { status: { not: 'RETIRED' } },
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
          this.prisma.task.count({ where: { assignedToId: user.id, taskType: 'MAIN' } }),
          this.getCompletedTasksCount({ assignedToId: user.id, taskType: 'MAIN' }),
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
        taskType: 'MAIN',
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