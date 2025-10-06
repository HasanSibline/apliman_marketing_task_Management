import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateNotificationData {
  userId: string;
  taskId?: string;
  type: 'task_created' | 'task_assigned' | 'task_updated' | 'task_approved' | 'task_rejected' | 'task_completed' | 'task_phase_changed' | 'subtask_assigned' | 'subtask_completed';
  title: string;
  message: string;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createNotification(data: CreateNotificationData) {
    return this.prisma.notification.create({
      data: {
        userId: data.userId,
        taskId: data.taskId,
        type: data.type,
        title: data.title,
        message: data.message,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        task: {
          select: {
            id: true,
            title: true,
            phase: true,
          },
        },
      },
    });
  }

  async createBulkNotifications(notifications: CreateNotificationData[]) {
    return this.prisma.notification.createMany({
      data: notifications,
    });
  }

  async getUserNotifications(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    
    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        include: {
          task: {
            select: {
              id: true,
              title: true,
              phase: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({
        where: { userId },
      }),
    ]);

    return {
      notifications,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async markAsRead(notificationId: string, userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: {
        id: notificationId,
        userId,
      },
      data: {
        read: true,
      },
    });
    
    return { success: result.count > 0, updated: result.count };
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: {
        userId,
        read: false,
      },
      data: {
        read: true,
      },
    });
  }

  async getUnreadCount(userId: string) {
    return this.prisma.notification.count({
      where: {
        userId,
        read: false,
      },
    });
  }

  async deleteNotification(notificationId: string, userId: string) {
    const result = await this.prisma.notification.deleteMany({
      where: {
        id: notificationId,
        userId,
      },
    });
    
    return { success: result.count > 0, deleted: result.count };
  }

  async deleteAllNotifications(userId: string) {
    return this.prisma.notification.deleteMany({
      where: { userId },
    });
  }

  // Helper method to notify task assignees
  async notifyTaskAssignees(taskId: string, type: CreateNotificationData['type'], title: string, message: string, excludeUserId?: string) {
    // Get all users assigned to this task
    const assignments = await this.prisma.taskAssignment.findMany({
      where: { taskId },
      include: {
        user: {
          select: { id: true, name: true },
        },
      },
    });

    // Get the primary assignee (for backward compatibility)
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { assignedToId: true },
    });

    const userIds = new Set<string>();
    
    // Add assignment users
    assignments.forEach(assignment => {
      if (assignment.userId !== excludeUserId) {
        userIds.add(assignment.userId);
      }
    });

    // Add primary assignee if exists
    if (task?.assignedToId && task.assignedToId !== excludeUserId) {
      userIds.add(task.assignedToId);
    }

    // Create notifications for all assignees
    const notifications = Array.from(userIds).map(userId => ({
      userId,
      taskId,
      type,
      title,
      message,
    }));

    if (notifications.length > 0) {
      await this.createBulkNotifications(notifications);
    }

    return notifications.length;
  }

  // Helper method to notify task creator
  async notifyTaskCreator(taskId: string, type: CreateNotificationData['type'], title: string, message: string, excludeUserId?: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { createdById: true },
    });

    if (task?.createdById && task.createdById !== excludeUserId) {
      await this.createNotification({
        userId: task.createdById,
        taskId,
        type,
        title,
        message,
      });
    }
  }
}
