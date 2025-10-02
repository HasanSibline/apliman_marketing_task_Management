import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import * as XLSX from 'xlsx';
import { TaskPhase, UserRole } from '../types/prisma';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async getDashboardStats() {
    const [
      totalUsers,
      activeUsers,
      totalTasks,
      completedTasks,
      tasksByPhase,
      recentTasks,
      topPerformers,
    ] = await Promise.all([
      this.prisma.user.count({
        where: { status: { not: 'RETIRED' } },
      }),
      this.prisma.user.count({
        where: { status: 'ACTIVE' },
      }),
      this.prisma.task.count(),
      this.prisma.task.count({
        where: { phase: TaskPhase.COMPLETED },
      }),
      this.getTasksByPhase(),
      this.getRecentTasks(),
      this.getTopPerformers(),
    ]);

    return {
      totalUsers,
      activeUsers,
      totalTasks,
      completedTasks,
      tasksByPhase,
      recentTasks,
      topPerformers,
    };
  }

  async getUserAnalytics(userId: string) {
    const analytics = await this.prisma.analytics.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            position: true,
            role: true,
          },
        },
      },
    });

    if (!analytics) {
      return null;
    }

    // Get additional task statistics
    const [assignedTasks, completedTasks, overdueTasks] = await Promise.all([
      this.prisma.task.findMany({
        where: { assignedToId: userId },
        select: {
          id: true,
          title: true,
          phase: true,
          priority: true,
          dueDate: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.task.count({
        where: {
          assignedToId: userId,
          phase: TaskPhase.COMPLETED,
        },
      }),
      this.prisma.task.count({
        where: {
          assignedToId: userId,
          dueDate: { lt: new Date() },
          phase: { not: TaskPhase.COMPLETED },
        },
      }),
    ]);

    return {
      ...analytics,
      assignedTasks,
      completedTasks,
      overdueTasks,
    };
  }

  async getTeamAnalytics() {
    const teamStats = await this.prisma.analytics.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            position: true,
            role: true,
            status: true,
          },
        },
      },
      orderBy: { tasksCompleted: 'desc' },
    });

    const summary = {
      totalTeamMembers: teamStats.length,
      totalTasksAssigned: teamStats.reduce((sum, stat) => sum + stat.tasksAssigned, 0),
      totalTasksCompleted: teamStats.reduce((sum, stat) => sum + stat.tasksCompleted, 0),
      totalInteractions: teamStats.reduce((sum, stat) => sum + stat.interactions, 0),
      averageCompletionRate: teamStats.length > 0 
        ? teamStats.reduce((sum, stat) => sum + (stat.tasksCompleted / Math.max(stat.tasksAssigned, 1)), 0) / teamStats.length
        : 0,
    };

    return {
      summary,
      teamMembers: teamStats,
    };
  }

  async getTaskAnalytics() {
    const [
      tasksByPhase,
      tasksByPriority,
      averageCompletionTime,
      overdueTasks,
      recentlyCompleted,
      totalTimeSpent,
      activeTimers,
      completionRate,
      tasksCompletedThisWeek,
      weekOverWeekChange,
      taskDistribution,
    ] = await Promise.all([
      this.getTasksByPhase(),
      this.getTasksByPriority(),
      this.getAverageCompletionTime(),
      this.getOverdueTasks(),
      this.getRecentlyCompletedTasks(),
      this.getTotalTimeSpent(),
      this.getActiveTimers(),
      this.getCompletionRate(),
      this.getTasksCompletedThisWeek(),
      this.getWeekOverWeekChange(),
      this.getTaskDistribution(),
    ]);

    return {
      tasksByPhase,
      tasksByPriority,
      averageCompletionTime,
      overdueTasks,
      recentlyCompleted,
      totalTimeSpent,
      activeTimers,
      completionRate,
      tasksCompletedThisWeek,
      weekOverWeekChange,
      taskDistribution,
    };
  }

  async exportTasksToExcel(filters?: {
    phase?: TaskPhase;
    assignedToId?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const where: any = {};

    if (filters?.phase) {
      where.phase = filters.phase;
    }
    if (filters?.assignedToId) {
      where.assignedToId = filters.assignedToId;
    }
    if (filters?.dateFrom || filters?.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) {
        where.createdAt.gte = new Date(filters.dateFrom);
      }
      if (filters.dateTo) {
        where.createdAt.lte = new Date(filters.dateTo);
      }
    }

    const tasks = await this.prisma.task.findMany({
      where,
      include: {
        assignedTo: {
          select: {
            name: true,
            email: true,
            position: true,
          },
        },
        createdBy: {
          select: {
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            files: true,
            comments: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Transform data for Excel
    const excelData = tasks.map(task => ({
      'Task ID': task.id,
      'Title': task.title,
      'Description': task.description,
      'Phase': task.phase,
      'Priority': task.priority,
      'Goals': task.goals || 'Not specified',
      'Assigned To': task.assignedTo?.name || 'Unassigned',
      'Assigned Email': task.assignedTo?.email || '',
      'Assigned Position': task.assignedTo?.position || '',
      'Created By': task.createdBy.name,
      'Creator Email': task.createdBy.email,
      'Due Date': task.dueDate ? task.dueDate.toISOString().split('T')[0] : '',
      'Created Date': task.createdAt.toISOString().split('T')[0],
      'Updated Date': task.updatedAt.toISOString().split('T')[0],
      'Files Count': task._count.files,
      'Comments Count': task._count.comments,
    }));

    // Create workbook
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(excelData);

    // Auto-size columns
        if (excelData.length > 0) {
          const colWidths = Object.keys(excelData[0]).map(key => ({
            wch: Math.max(key.length, 15),
          }));
          worksheet['!cols'] = colWidths;
        }

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Tasks');

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    return {
      buffer,
      filename: `tasks_export_${new Date().toISOString().split('T')[0]}.xlsx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  private async getTasksByPhase() {
    const phases = Object.values(TaskPhase);
    const counts = await Promise.all(
      phases.map(async (phase) => {
        const count = await this.prisma.task.count({
          where: { phase },
        });
        return { phase, count };
      }),
    );

        return counts.reduce((acc, { phase, count }) => {
          (acc as any)[phase] = count;
          return acc;
        }, {} as Record<string, number>);
  }

  private async getTasksByPriority() {
    const priorities = [1, 2, 3, 4, 5];
    const counts = await Promise.all(
      priorities.map(async (priority) => {
        const count = await this.prisma.task.count({
          where: { priority },
        });
        return { priority, count };
      }),
    );

    return counts;
  }

  private async getAverageCompletionTime() {
    const completedTasks = await this.prisma.task.findMany({
      where: { phase: TaskPhase.COMPLETED },
      select: {
        createdAt: true,
        updatedAt: true,
      },
    });

    if (completedTasks.length === 0) {
      return 0;
    }

    const totalTime = completedTasks.reduce((sum, task) => {
      const completionTime = task.updatedAt.getTime() - task.createdAt.getTime();
      return sum + completionTime;
    }, 0);

    // Return average time in days
    return totalTime / completedTasks.length / (1000 * 60 * 60 * 24);
  }

  private async getOverdueTasks() {
    return this.prisma.task.count({
      where: {
        dueDate: { lt: new Date() },
        phase: { not: TaskPhase.COMPLETED },
      },
    });
  }

  private async getRecentTasks() {
    return this.prisma.task.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        assignedTo: {
          select: {
            name: true,
            email: true,
          },
        },
        createdBy: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });
  }

  private async getRecentlyCompletedTasks() {
    return this.prisma.task.findMany({
      where: { phase: TaskPhase.COMPLETED },
      take: 10,
      orderBy: { updatedAt: 'desc' },
      include: {
        assignedTo: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });
  }

  private async getTopPerformers() {
    return this.prisma.analytics.findMany({
      take: 5,
      orderBy: { tasksCompleted: 'desc' },
      include: {
        user: {
          select: {
            name: true,
            email: true,
            position: true,
          },
        },
      },
    });
  }

  private async getTotalTimeSpent() {
    // Time tracking not implemented in current schema
    // Return 0 for now
    return 0;
  }

  private async getActiveTimers() {
    // Time tracking not implemented in current schema
    // Return 0 for now
    return 0;
  }

  private async getCompletionRate() {
    const totalTasks = await this.prisma.task.count();
    const completedTasks = await this.prisma.task.count({
      where: { phase: TaskPhase.COMPLETED },
    });

    return totalTasks > 0 ? completedTasks / totalTasks : 0;
  }

  private async getTasksCompletedThisWeek() {
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    return this.prisma.task.count({
      where: {
        phase: TaskPhase.COMPLETED,
        updatedAt: { gte: startOfWeek },
      },
    });
  }

  private async getWeekOverWeekChange() {
    const now = new Date();
    const startOfThisWeek = new Date(now);
    startOfThisWeek.setDate(now.getDate() - now.getDay());
    startOfThisWeek.setHours(0, 0, 0, 0);

    const startOfLastWeek = new Date(startOfThisWeek);
    startOfLastWeek.setDate(startOfThisWeek.getDate() - 7);

    const [thisWeekTasks, lastWeekTasks] = await Promise.all([
      this.prisma.task.count({
        where: {
          phase: TaskPhase.COMPLETED,
          updatedAt: { gte: startOfThisWeek },
        },
      }),
      this.prisma.task.count({
        where: {
          phase: TaskPhase.COMPLETED,
          updatedAt: { 
            gte: startOfLastWeek,
            lt: startOfThisWeek,
          },
        },
      }),
    ]);

    if (lastWeekTasks === 0) return thisWeekTasks > 0 ? 1 : 0;
    return (thisWeekTasks - lastWeekTasks) / lastWeekTasks;
  }

  private async getTaskDistribution() {
    const [byPriority, byPhase] = await Promise.all([
      this.getTasksByPriority(),
      this.getTasksByPhase(),
    ]);

    return {
      byPriority: byPriority.reduce((acc, item) => {
        acc[`priority_${item.priority}`] = item.count;
        return acc;
      }, {} as Record<string, number>),
      byPhase,
    };
  }
}
