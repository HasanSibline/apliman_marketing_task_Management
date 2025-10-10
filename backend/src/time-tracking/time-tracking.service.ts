import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TimeTrackingService {
  constructor(private prisma: PrismaService) {}

  async startTimeEntry(userId: string, taskId?: string, subtaskId?: string, description?: string) {
    // Stop any active entries for this user
    await this.prisma.timeEntry.updateMany({
      where: { userId, isActive: true },
      data: { 
        isActive: false,
        endTime: new Date(),
        duration: { increment: Math.floor((new Date().getTime() - new Date().getTime()) / 1000) }
      }
    });

    // Create new active entry
    return this.prisma.timeEntry.create({
      data: {
        userId,
        taskId,
        subtaskId,
        description,
        startTime: new Date(),
        isActive: true
      },
      include: {
        task: { select: { id: true, title: true } },
        subtask: { select: { id: true, title: true } },
        user: { select: { id: true, name: true } }
      }
    });
  }

  async stopTimeEntry(entryId: string, userId: string) {
    const entry = await this.prisma.timeEntry.findUnique({
      where: { id: entryId },
      include: { task: true, subtask: true }
    });

    if (!entry || entry.userId !== userId) {
      throw new Error('Time entry not found or unauthorized');
    }

    const endTime = new Date();
    const duration = Math.floor((endTime.getTime() - entry.startTime.getTime()) / 1000);

    const updatedEntry = await this.prisma.timeEntry.update({
      where: { id: entryId },
      data: {
        endTime,
        duration,
        isActive: false
      },
      include: {
        task: { select: { id: true, title: true } },
        subtask: { select: { id: true, title: true } },
        user: { select: { id: true, name: true } }
      }
    });

    // Update task/subtask actual hours
    if (entry.taskId) {
      await this.prisma.task.update({
        where: { id: entry.taskId },
        data: { actualHours: { increment: duration / 3600 } }
      });
    }

    if (entry.subtaskId) {
      await this.prisma.subtask.update({
        where: { id: entry.subtaskId },
        data: { actualHours: { increment: duration / 3600 } }
      });
    }

    return updatedEntry;
  }

  async getActiveTimeEntry(userId: string) {
    return this.prisma.timeEntry.findFirst({
      where: { userId, isActive: true },
      include: {
        task: { select: { id: true, title: true } },
        subtask: { select: { id: true, title: true } },
        user: { select: { id: true, name: true } }
      }
    });
  }

  async getTimeEntries(userId: string, taskId?: string, subtaskId?: string) {
    return this.prisma.timeEntry.findMany({
      where: {
        userId,
        ...(taskId && { taskId }),
        ...(subtaskId && { subtaskId })
      },
      include: {
        task: { select: { id: true, title: true } },
        subtask: { select: { id: true, title: true } },
        user: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async updateTimeEntry(entryId: string, userId: string, data: { description?: string; duration?: number }) {
    const entry = await this.prisma.timeEntry.findUnique({
      where: { id: entryId }
    });

    if (!entry || entry.userId !== userId) {
      throw new Error('Time entry not found or unauthorized');
    }

    return this.prisma.timeEntry.update({
      where: { id: entryId },
      data,
      include: {
        task: { select: { id: true, title: true } },
        subtask: { select: { id: true, title: true } },
        user: { select: { id: true, name: true } }
      }
    });
  }

  async deleteTimeEntry(entryId: string, userId: string) {
    const entry = await this.prisma.timeEntry.findUnique({
      where: { id: entryId }
    });

    if (!entry || entry.userId !== userId) {
      throw new Error('Time entry not found or unauthorized');
    }

    return this.prisma.timeEntry.delete({
      where: { id: entryId }
    });
  }
}
