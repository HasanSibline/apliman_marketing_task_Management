import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import * as XLSX from 'xlsx';
import { UserRole } from '../types/prisma';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  // Helper method to get completed tasks
  private async getCompletedTasksCount(whereClause: any = {}) {
    // Get tasks in completion phases
    const completedPhases = await this.prisma.phase.findMany({
      where: {
        OR: [
          { name: { contains: 'Complete' } },
          { name: { contains: 'Published' } },
          { name: { contains: 'Done' } },
          { name: { contains: 'Deployed' } },
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

  // Helper method to get in-progress tasks
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

  // Helper method to get pending tasks
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
    // Check if user can access full analytics
    if (userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { role: true }
      });
      
      if (!user || !['SUPER_ADMIN', 'ADMIN'].includes(user.role)) {
        // Return limited analytics for non-admin users
        return this.getUserAnalytics(userId);
      }
    }

    const [
      totalUsers,
      activeUsers,
      totalTasks,
      totalWorkflows
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { status: 'ACTIVE' } }),
      this.prisma.task.count(),
      this.prisma.workflow.count()
    ]);

    const [completedTasks, inProgressTasks, pendingTasks] = await Promise.all([
      this.getCompletedTasksCount(),
      this.getInProgressTasksCount(),
      this.getPendingTasksCount(),
    ]);

    // Get overdue tasks
    const overdueTasks = await this.prisma.task.count({
      where: {
        dueDate: { lt: new Date() },
        currentPhase: {
          isEndPhase: false
        }
      }
    });

    // Get tasks by workflow
    const tasksByWorkflow = await this.prisma.workflow.findMany({
      include: {
        _count: {
          select: { tasks: true }
        }
      }
    });

    // Get recent tasks
    const recentTasks = await this.prisma.task.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        assignedTo: { select: { name: true } },
        createdBy: { select: { name: true } },
        workflow: { select: { name: true, color: true } },
        currentPhase: { select: { name: true } }
      }
    });

    // Get top performers (users with most completed tasks)
    const topPerformersData = await this.prisma.user.findMany({
      take: 5,
      where: { status: 'ACTIVE' },
      include: {
        _count: {
          select: {
            assignedTasks: {
              where: {
                currentPhase: { isEndPhase: true }
              }
            }
          }
        }
      },
      orderBy: {
        assignedTasks: {
          _count: 'desc'
        }
      }
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
      totalWorkflows,
      completionRate,
      tasksByWorkflow: tasksByWorkflow.map(workflow => ({
        workflowId: workflow.id,
        workflowName: workflow.name,
        taskCount: workflow._count.tasks,
        color: workflow.color
      })),
      recentTasks: recentTasks.map(task => ({
        id: task.id,
        title: task.title,
        assignedTo: task.assignedTo?.name,
        createdBy: task.createdBy?.name,
        workflow: task.workflow?.name,
        workflowColor: task.workflow?.color,
        currentPhase: task.currentPhase?.name,
        createdAt: task.createdAt,
        priority: task.priority
      })),
      topPerformers: topPerformersData.map(user => ({
        id: user.id,
        name: user.name,
        position: user.position,
        completedTasks: user._count.assignedTasks
      }))
    };
  }

  async getUserAnalytics(userId: string) {
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
      totalCreatedTasks
    ] = await Promise.all([
      this.prisma.task.count({
        where: { assignedToId: userId },
      }),
      this.prisma.task.count({
        where: { createdById: userId },
      })
    ]);

    const completedTasks = await this.getCompletedTasksCount({ assignedToId: userId });
    const inProgressTasks = await this.getInProgressTasksCount({ assignedToId: userId });

    // Get recent activity
    const recentTasks = await this.prisma.task.findMany({
      take: 5,
      where: { assignedToId: userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        workflow: { select: { name: true, color: true } },
        currentPhase: { select: { name: true } }
      }
    });

    return {
      user,
      stats: {
        totalAssignedTasks,
        totalCreatedTasks,
      completedTasks,
      inProgressTasks,
        completionRate: totalAssignedTasks > 0 ? Math.round((completedTasks / totalAssignedTasks) * 100) : 0,
      },
      recentTasks: recentTasks.map(task => ({
        id: task.id,
        title: task.title,
        workflow: task.workflow?.name,
        workflowColor: task.workflow?.color,
        currentPhase: task.currentPhase?.name,
        updatedAt: task.updatedAt
      }))
    };
  }

  async getTeamAnalytics() {
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
          this.prisma.task.count({ where: { assignedToId: user.id } }),
          this.getCompletedTasksCount({ assignedToId: user.id })
    ]);

    return {
          ...user,
          assignedTasks,
          completedTasks,
          completionRate: assignedTasks > 0 ? Math.round((completedTasks / assignedTasks) * 100) : 0,
        };
      })
    );

    return {
      teamMembers: teamStats,
      totalMembers: users.length,
      activeMembers: users.filter(u => u.status === 'ACTIVE').length,
    };
  }

  async getWorkflowAnalytics() {
    const workflows = await this.prisma.workflow.findMany({
      include: {
        phases: {
          include: {
            _count: {
              select: { tasks: true }
            }
          }
        },
        _count: {
          select: { tasks: true }
        }
      }
    });

    return workflows.map(workflow => ({
      id: workflow.id,
      name: workflow.name,
      color: workflow.color,
      taskType: workflow.taskType,
      totalTasks: workflow._count.tasks,
      phases: workflow.phases.map(phase => ({
        id: phase.id,
        name: phase.name,
        order: phase.order,
        taskCount: phase._count.tasks,
        isStartPhase: phase.isStartPhase,
        isEndPhase: phase.isEndPhase
      }))
    }));
  }

  async exportAnalytics(format: 'xlsx' | 'csv' = 'xlsx') {
    // Always get full dashboard stats for export (admin only feature)
    const [dashboardStats, teamAnalytics, workflowAnalytics] = await Promise.all([
      this.getDashboardStats(), // No userId passed = full admin stats
      this.getTeamAnalytics(),
      this.getWorkflowAnalytics()
    ]);

    // Type guard to ensure we have the full dashboard stats
    if (!('totalUsers' in dashboardStats)) {
      throw new Error('Export requires admin privileges');
    }

    const workbook = XLSX.utils.book_new();

    // Dashboard Stats Sheet
    const dashboardData = [
      ['Metric', 'Value'],
      ['Total Users', dashboardStats.totalUsers.toString()],
      ['Active Users', dashboardStats.activeUsers.toString()],
      ['Total Tasks', dashboardStats.totalTasks.toString()],
      ['Completed Tasks', dashboardStats.completedTasks.toString()],
      ['In Progress Tasks', dashboardStats.inProgressTasks.toString()],
      ['Pending Tasks', dashboardStats.pendingTasks.toString()],
      ['Overdue Tasks', dashboardStats.overdueTasks.toString()],
      ['Completion Rate', `${dashboardStats.completionRate}%`]
    ];
    const dashboardSheet = XLSX.utils.aoa_to_sheet(dashboardData);
    XLSX.utils.book_append_sheet(workbook, dashboardSheet, 'Dashboard');

    // Team Analytics Sheet
    const teamData = [
      ['Name', 'Position', 'Status', 'Assigned Tasks', 'Completed Tasks', 'Completion Rate']
    ];
    teamAnalytics.teamMembers.forEach(member => {
      teamData.push([
        member.name,
        member.position || '',
        member.status,
        member.assignedTasks.toString(),
        member.completedTasks.toString(),
        `${member.completionRate}%`
      ]);
    });
    const teamSheet = XLSX.utils.aoa_to_sheet(teamData);
    XLSX.utils.book_append_sheet(workbook, teamSheet, 'Team Analytics');

    // Workflow Analytics Sheet
    const workflowData = [
      ['Workflow Name', 'Task Type', 'Total Tasks', 'Phases Count']
    ];
    workflowAnalytics.forEach(workflow => {
      workflowData.push([
        workflow.name,
        workflow.taskType,
        workflow.totalTasks.toString(),
        workflow.phases.length.toString()
      ]);
    });
    const workflowSheet = XLSX.utils.aoa_to_sheet(workflowData);
    XLSX.utils.book_append_sheet(workbook, workflowSheet, 'Workflows');

    if (format === 'xlsx') {
      return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    } else {
      // Return CSV of dashboard stats
      return XLSX.utils.sheet_to_csv(dashboardSheet);
    }
  }
}