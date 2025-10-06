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
      inProgressTasks,
      pendingTasks,
      overdueTasks,
      tasksByPhase,
      recentTasks,
      topPerformers,
      tasksCompletedThisWeek,
      weekOverWeekChange,
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
      this.prisma.task.count({
        where: { phase: TaskPhase.IN_PROGRESS },
      }),
      this.prisma.task.count({
        where: { phase: TaskPhase.PENDING_APPROVAL },
      }),
      this.prisma.task.count({
        where: {
          dueDate: { lt: new Date() },
          phase: { not: 'COMPLETED' },
        },
      }),
      this.getTasksByPhase(),
      this.getRecentTasks(),
      this.getTopPerformers(),
      this.getTasksCompletedThisWeek(),
      this.getWeekOverWeekChange(),
    ]);

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
      tasksCompletedThisWeek,
      weekOverWeekChange,
      tasksByPhase,
      recentTasks,
      topPerformers,
    };
  }

  async getUserAnalytics(userId: string) {
    console.log('Getting analytics for user ID:', userId);
    
    // First verify the user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        position: true,
        role: true,
      },
    });

    if (!user) {
      console.error(`User with ID ${userId} not found in database`);
      // Return a default analytics object instead of throwing an error
      return {
        id: 'temp',
        userId,
        tasksAssigned: 0,
        tasksCompleted: 0,
        tasksInProgress: 0,
        interactions: 0,
        totalTimeSpent: 0,
        lastActive: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        user: {
          id: userId,
          name: 'Unknown User',
          email: 'unknown@example.com',
          position: 'Unknown',
          role: 'EMPLOYEE',
        },
        assignedTasks: [],
        completedTasks: 0,
        overdueTasks: 0,
        inProgressTasks: 0,
        pendingTasks: 0,
        productivityScore: 0,
        taskQuality: 0,
        timeTracked: 0,
        totalAssigned: 0,
        onTimeCompleted: 0,
      };
    }

    // Ensure analytics record exists for user
    let analytics = await this.prisma.analytics.findUnique({
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
      // Create analytics record if it doesn't exist
      try {
        analytics = await this.prisma.analytics.create({
          data: {
            userId,
            tasksAssigned: 0,
            tasksCompleted: 0,
            interactions: 0,
            lastActive: new Date(),
          },
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
      } catch (error) {
        // If creation fails, return a default analytics object
        console.error('Failed to create analytics record:', error);
        analytics = {
          id: 'temp',
          userId,
          tasksAssigned: 0,
          tasksCompleted: 0,
          tasksInProgress: 0,
          interactions: 0,
          totalTimeSpent: 0,
          lastActive: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          user,
        };
      }
    }

    // Get real-time task statistics
    const [assignedTasks, completedTasks, overdueTasks, inProgressTasks, pendingTasks] = await Promise.all([
      this.prisma.task.findMany({
        where: { assignedToId: userId },
        select: {
          id: true,
          title: true,
          phase: true,
          priority: true,
          dueDate: true,
          createdAt: true,
          updatedAt: true,
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
          phase: { not: 'COMPLETED' },
        },
      }),
      this.prisma.task.count({
        where: {
          assignedToId: userId,
          phase: TaskPhase.IN_PROGRESS,
        },
      }),
      this.prisma.task.count({
        where: {
          assignedToId: userId,
          phase: TaskPhase.PENDING_APPROVAL,
        },
      }),
    ]);

    // Calculate productivity score (0-100)
    const totalAssigned = assignedTasks.length;
    const productivityScore = totalAssigned > 0 ? Math.round((completedTasks / totalAssigned) * 100) : 0;

    // Calculate task quality (based on completion rate and timeliness)
    const onTimeCompleted = await this.prisma.task.count({
      where: {
        assignedToId: userId,
        phase: TaskPhase.COMPLETED,
        dueDate: { gte: new Date() }, // Completed before or on due date
      },
    });
    const taskQuality = completedTasks > 0 ? Math.round((onTimeCompleted / completedTasks) * 100) : 0;

    // Calculate time tracked (placeholder - would need time tracking implementation)
    const timeTracked = 0; // Hours tracked

    // Generate productivity history (last 7 days)
    const productivityHistory = await this.generateProductivityHistory(userId);

    return {
      ...analytics,
      assignedTasks,
      completedTasks,
      overdueTasks,
      inProgressTasks,
      pendingTasks,
      productivityScore,
      taskQuality,
      timeTracked,
      totalAssigned,
      onTimeCompleted,
      productivityHistory,
    };
  }

  async getTeamAnalytics() {
    // Get all active team members
    const teamMembers = await this.prisma.user.findMany({
      where: { 
        status: 'ACTIVE',
        role: { in: [UserRole.ADMIN, UserRole.EMPLOYEE] }
      },
      select: {
        id: true,
        name: true,
        email: true,
        position: true,
        role: true,
        status: true,
        createdAt: true,
        lastActiveAt: true,
      },
    });

    // Get real-time team statistics
    const [
      totalTasks,
      completedTasks,
      inProgressTasks,
      overdueTasks,
      teamPerformance,
    ] = await Promise.all([
      this.prisma.task.count(),
      this.prisma.task.count({ where: { phase: TaskPhase.COMPLETED } }),
      this.prisma.task.count({ where: { phase: TaskPhase.IN_PROGRESS } }),
      this.prisma.task.count({
        where: {
          dueDate: { lt: new Date() },
          phase: { not: 'COMPLETED' },
        },
      }),
      this.calculateTeamPerformance(teamMembers),
    ]);

    const summary = {
      totalTeamMembers: teamMembers.length,
      totalTasks,
      completedTasks,
      inProgressTasks,
      overdueTasks,
      teamPerformance: Math.round(teamPerformance),
      averageCompletionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      tasksCompletedThisWeek: await this.getTasksCompletedThisWeek(),
    };

    return {
      summary,
      teamMembers: await Promise.all(teamMembers.map(async (member) => {
        try {
          const userAnalytics = await this.getUserAnalytics(member.id);
          return {
            ...member,
            analytics: userAnalytics,
          };
        } catch (error) {
          console.error(`Failed to get analytics for team member ${member.id}:`, error);
          return {
            ...member,
            analytics: null,
          };
        }
      })),
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

  async getUserDashboardStats(userId: string) {
    const [
      userTasks,
      userCompletedTasks,
      userInProgressTasks,
      userPendingTasks,
      userOverdueTasks,
      userTasksByPhase,
      userRecentTasks,
      userTasksCompletedThisWeek,
      userWeekOverWeekChange,
    ] = await Promise.all([
      this.prisma.task.count({
        where: { 
          OR: [
            { assignedToId: userId },
            { createdById: userId }
          ]
        },
      }),
      this.prisma.task.count({
        where: { 
          phase: TaskPhase.COMPLETED,
          OR: [
            { assignedToId: userId },
            { createdById: userId }
          ]
        },
      }),
      this.prisma.task.count({
        where: { 
          phase: TaskPhase.IN_PROGRESS,
          OR: [
            { assignedToId: userId },
            { createdById: userId }
          ]
        },
      }),
      this.prisma.task.count({
        where: { 
          phase: TaskPhase.PENDING_APPROVAL,
          OR: [
            { assignedToId: userId },
            { createdById: userId }
          ]
        },
      }),
      this.prisma.task.count({
        where: {
          dueDate: { lt: new Date() },
          phase: { not: 'COMPLETED' },
          OR: [
            { assignedToId: userId },
            { createdById: userId }
          ]
        },
      }),
      this.getUserTasksByPhase(userId),
      this.getUserRecentTasks(userId),
      this.getUserTasksCompletedThisWeek(userId),
      this.getUserWeekOverWeekChange(userId),
    ]);

    const completionRate = userTasks > 0 ? Math.round((userCompletedTasks / userTasks) * 100) : 0;

    return {
      totalTasks: userTasks,
      completedTasks: userCompletedTasks,
      inProgressTasks: userInProgressTasks,
      pendingTasks: userPendingTasks,
      overdueTasks: userOverdueTasks,
      completionRate,
      tasksCompletedThisWeek: userTasksCompletedThisWeek,
      weekOverWeekChange: userWeekOverWeekChange,
      tasksByPhase: userTasksByPhase,
      recentTasks: userRecentTasks,
    };
  }

  async getUserTaskAnalytics(userId: string) {
    const [
      tasksByPhase,
      tasksByPriority,
      averageCompletionTime,
      overdueTasks,
      recentlyCompleted,
      completionRate,
      tasksCompletedThisWeek,
      weekOverWeekChange,
    ] = await Promise.all([
      this.getUserTasksByPhase(userId),
      this.getUserTasksByPriority(userId),
      this.getUserAverageCompletionTime(userId),
      this.getUserOverdueTasks(userId),
      this.getUserRecentlyCompletedTasks(userId),
      this.getUserCompletionRate(userId),
      this.getUserTasksCompletedThisWeek(userId),
      this.getUserWeekOverWeekChange(userId),
    ]);

    return {
      tasksByPhase,
      tasksByPriority,
      averageCompletionTime,
      overdueTasks,
      recentlyCompleted,
      completionRate,
      tasksCompletedThisWeek,
      weekOverWeekChange,
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
          where: { phase: phase as any },
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
        acc[`Priority ${item.priority}`] = item.count;
        return acc;
      }, {} as Record<string, number>),
      byPhase: Object.entries(byPhase).reduce((acc, [phase, count]) => {
        acc[phase.replace('_', ' ')] = count;
        return acc;
      }, {} as Record<string, number>),
    };
  }

  private async calculateTeamPerformance(teamMembers: any[]) {
    if (teamMembers.length === 0) return 0;

    const performanceScores = await Promise.all(
      teamMembers.map(async (member) => {
        try {
          const userAnalytics = await this.getUserAnalytics(member.id);
          return userAnalytics?.productivityScore || 0;
        } catch (error) {
          console.error(`Failed to get analytics for user ${member.id}:`, error);
          return 0;
        }
      })
    );

    return performanceScores.reduce((sum, score) => sum + score, 0) / performanceScores.length;
  }

  async initializeAnalyticsForAllUsers() {
    try {
      // Get all users who don't have analytics records
      const usersWithoutAnalytics = await this.prisma.user.findMany({
        where: {
          analytics: null,
        },
        select: {
          id: true,
        },
      });

      // Create analytics records for all users
      const analyticsData = usersWithoutAnalytics.map(user => ({
        userId: user.id,
        tasksAssigned: 0,
        tasksCompleted: 0,
        interactions: 0,
        lastActive: new Date(),
      }));

      if (analyticsData.length > 0) {
        await this.prisma.analytics.createMany({
          data: analyticsData,
        });
        console.log(`Created analytics records for ${analyticsData.length} users`);
      }

      return { success: true, count: analyticsData.length };
    } catch (error) {
      console.error('Failed to initialize analytics for all users:', error);
      return { success: false, error: error.message };
    }
  }

  async debugUsers() {
    try {
      const users = await this.prisma.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      });
      console.log('All users in database:', users);
      return users;
    } catch (error) {
      console.error('Failed to get users:', error);
      return [];
    }
  }

  private async generateProductivityHistory(userId: string) {
    const history = [];
    const today = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      
      // Get tasks completed on this day
      const tasksCompleted = await this.prisma.task.count({
        where: {
          assignedToId: userId,
          phase: 'COMPLETED',
          updatedAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
      });
      
      // Get tasks assigned on this day
      const tasksAssigned = await this.prisma.task.count({
        where: {
          assignedToId: userId,
          createdAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
      });
      
      const productivityScore = tasksAssigned > 0 ? Math.round((tasksCompleted / tasksAssigned) * 100) : 0;
      
      history.push({
        date: date.toISOString().split('T')[0],
        score: productivityScore,
        tasksCompleted,
        tasksAssigned,
      });
    }
    
    return history;
  }

  // User-specific helper methods
  private async getUserTasksByPhase(userId: string) {
    const taskCounts = await this.prisma.task.groupBy({
      by: ['phase'],
      where: {
        OR: [
          { assignedToId: userId },
          { createdById: userId }
        ]
      },
      _count: true,
    });

    const phaseMap = {
      [TaskPhase.PENDING_APPROVAL]: 0,
      [TaskPhase.APPROVED]: 0,
      [TaskPhase.REJECTED]: 0,
      [TaskPhase.ASSIGNED]: 0,
      [TaskPhase.IN_PROGRESS]: 0,
      [TaskPhase.COMPLETED]: 0,
      [TaskPhase.ARCHIVED]: 0,
    };

    taskCounts.forEach(({ phase, _count }) => {
      phaseMap[phase] = _count;
    });

    return phaseMap;
  }

  private async getUserTasksByPriority(userId: string) {
    return this.prisma.task.groupBy({
      by: ['priority'],
      where: {
        OR: [
          { assignedToId: userId },
          { createdById: userId }
        ]
      },
      _count: true,
      orderBy: { priority: 'asc' },
    }).then(results => 
      results.map(({ priority, _count }) => ({
        priority,
        count: _count,
      }))
    );
  }

  private async getUserRecentTasks(userId: string) {
    return this.prisma.task.findMany({
      where: {
        OR: [
          { assignedToId: userId },
          { createdById: userId }
        ]
      },
      include: {
        assignedTo: {
          select: { name: true, email: true },
        },
        createdBy: {
          select: { name: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  }

  private async getUserTasksCompletedThisWeek(userId: string) {
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    return this.prisma.task.count({
      where: {
        phase: TaskPhase.COMPLETED,
        updatedAt: { gte: startOfWeek },
        OR: [
          { assignedToId: userId },
          { createdById: userId }
        ]
      },
    });
  }

  private async getUserWeekOverWeekChange(userId: string) {
    const now = new Date();
    const startOfThisWeek = new Date(now);
    startOfThisWeek.setDate(now.getDate() - now.getDay());
    startOfThisWeek.setHours(0, 0, 0, 0);

    const startOfLastWeek = new Date(startOfThisWeek);
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

    const [thisWeekTasks, lastWeekTasks] = await Promise.all([
      this.prisma.task.count({
        where: {
          phase: TaskPhase.COMPLETED,
          updatedAt: { gte: startOfThisWeek },
          OR: [
            { assignedToId: userId },
            { createdById: userId }
          ]
        },
      }),
      this.prisma.task.count({
        where: {
          phase: TaskPhase.COMPLETED,
          updatedAt: {
            gte: startOfLastWeek,
            lt: startOfThisWeek,
          },
          OR: [
            { assignedToId: userId },
            { createdById: userId }
          ]
        },
      }),
    ]);

    if (lastWeekTasks === 0) return thisWeekTasks > 0 ? 1 : 0;
    return (thisWeekTasks - lastWeekTasks) / lastWeekTasks;
  }

  private async getUserAverageCompletionTime(userId: string) {
    // This is a simplified calculation - you might want to track actual time spent
    const completedTasks = await this.prisma.task.findMany({
      where: {
        phase: TaskPhase.COMPLETED,
        OR: [
          { assignedToId: userId },
          { createdById: userId }
        ]
      },
      select: {
        createdAt: true,
        updatedAt: true,
      },
    });

    if (completedTasks.length === 0) return 0;

    const totalTime = completedTasks.reduce((sum, task) => {
      const timeDiff = task.updatedAt.getTime() - task.createdAt.getTime();
      return sum + timeDiff;
    }, 0);

    return Math.round(totalTime / completedTasks.length / (1000 * 60 * 60 * 24)); // Convert to days
  }

  private async getUserOverdueTasks(userId: string) {
    return this.prisma.task.findMany({
      where: {
        dueDate: { lt: new Date() },
        phase: { not: 'COMPLETED' },
        OR: [
          { assignedToId: userId },
          { createdById: userId }
        ]
      },
      include: {
        assignedTo: {
          select: { name: true, email: true },
        },
        createdBy: {
          select: { name: true, email: true },
        },
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  private async getUserRecentlyCompletedTasks(userId: string) {
    return this.prisma.task.findMany({
      where: {
        phase: TaskPhase.COMPLETED,
        OR: [
          { assignedToId: userId },
          { createdById: userId }
        ]
      },
      include: {
        assignedTo: {
          select: { name: true, email: true },
        },
        createdBy: {
          select: { name: true, email: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });
  }

  private async getUserCompletionRate(userId: string) {
    const [totalTasks, completedTasks] = await Promise.all([
      this.prisma.task.count({
        where: {
          OR: [
            { assignedToId: userId },
            { createdById: userId }
          ]
        }
      }),
      this.prisma.task.count({
        where: {
          phase: TaskPhase.COMPLETED,
          OR: [
            { assignedToId: userId },
            { createdById: userId }
          ]
        }
      }),
    ]);

    return totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  }
}
