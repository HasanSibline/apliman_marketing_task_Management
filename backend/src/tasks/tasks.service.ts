import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { Prisma } from '@prisma/client';
import { TaskPhase, UserRole } from '../types/prisma';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createTaskDto: CreateTaskDto, creatorId: string) {
    try {
      const task = await this.prisma.task.create({
        data: {
          ...createTaskDto,
          dueDate: createTaskDto.dueDate ? new Date(createTaskDto.dueDate) : null,
          createdById: creatorId,
        },
        include: {
          assignedTo: {
            select: {
              id: true,
              name: true,
              email: true,
              position: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
              position: true,
            },
          },
          _count: {
            select: {
              files: true,
              comments: true,
            },
          },
        },
      });

      // Update analytics for assigned user
      if (task.assignedToId) {
        await this.updateUserAnalytics(task.assignedToId, 'assigned');
      }

      return task;
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error) {
        if (error.code === 'P2003') {
          throw new BadRequestException('Invalid assignedToId provided');
        }
      }
      throw error;
    }
  }

  async findAll(
    userId?: string,
    userRole?: UserRole,
    phase?: TaskPhase,
    assignedToId?: string,
    createdById?: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const skip = (page - 1) * limit;
    const where: any = {};

    // Role-based filtering
    if (userRole === UserRole.EMPLOYEE) {
      // Employees can only see tasks assigned to them or created by them
      where.OR = [
        { assignedToId: userId },
        { createdById: userId },
      ];
    }
    // Super Admins and Admins can see all tasks (no additional filtering needed)

    // Additional filters
    if (phase) {
      where.phase = phase;
    }
    if (assignedToId) {
      where.assignedToId = assignedToId;
    }
    if (createdById) {
      where.createdById = createdById;
    }

    const [tasks, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        include: {
          assignedTo: {
            select: {
              id: true,
              name: true,
              email: true,
              position: true,
              status: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
              position: true,
            },
          },
          _count: {
            select: {
              files: true,
              comments: true,
            },
          },
        },
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'desc' },
        ],
        skip,
        take: limit,
      }),
      this.prisma.task.count({ where }),
    ]);

    return {
      tasks,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, userId?: string, userRole?: UserRole) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true,
            position: true,
            status: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
            position: true,
          },
        },
        files: {
          orderBy: { uploadedAt: 'desc' },
        },
        comments: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                position: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Role-based access control
    if (userRole === UserRole.EMPLOYEE) {
      if (task.assignedToId !== userId && task.createdById !== userId) {
        throw new ForbiddenException('You do not have access to this task');
      }
    }

    return task;
  }

  async update(id: string, updateTaskDto: UpdateTaskDto, userId: string, userRole: UserRole) {
    const existingTask = await this.findOne(id, userId, userRole);

    // Role-based update restrictions
    if (userRole === UserRole.EMPLOYEE) {
      // Employees can only update phase and add comments to their assigned tasks
      const allowedFields = ['phase'];
      const filteredUpdate = Object.keys(updateTaskDto)
        .filter(key => allowedFields.includes(key))
        .reduce((obj, key) => {
          obj[key] = updateTaskDto[key];
          return obj;
        }, {});
      
      if (Object.keys(filteredUpdate).length === 0) {
        throw new ForbiddenException('Employees can only update task phase');
      }
      
      updateTaskDto = filteredUpdate;
    }

    try {
      const updatedTask = await this.prisma.task.update({
        where: { id },
        data: {
          ...updateTaskDto,
          dueDate: updateTaskDto.dueDate ? new Date(updateTaskDto.dueDate) : undefined,
        },
        include: {
          assignedTo: {
            select: {
              id: true,
              name: true,
              email: true,
              position: true,
              status: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
              position: true,
            },
          },
          _count: {
            select: {
              files: true,
              comments: true,
            },
          },
        },
      });

      // Update analytics based on phase changes
      if (updateTaskDto.phase) {
        await this.handlePhaseChange(updatedTask, existingTask.phase as TaskPhase);
      }

      return updatedTask;
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error) {
        if (error.code === 'P2025') {
          throw new NotFoundException('Task not found');
        }
      }
      throw error;
    }
  }

  async remove(id: string, userId: string, userRole: UserRole) {
    const task = await this.findOne(id, userId, userRole);

    // Only admins and super admins can delete tasks
    if (userRole === UserRole.EMPLOYEE) {
      throw new ForbiddenException('Employees cannot delete tasks');
    }

    try {
      await this.prisma.task.delete({
        where: { id },
      });

      return { message: 'Task deleted successfully' };
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error) {
        if (error.code === 'P2025') {
          throw new NotFoundException('Task not found');
        }
      }
      throw error;
    }
  }

  async addComment(taskId: string, createCommentDto: CreateCommentDto, userId: string, userRole: UserRole) {
    // Verify user has access to the task
    await this.findOne(taskId, userId, userRole);

    const comment = await this.prisma.taskComment.create({
      data: {
        taskId,
        userId,
        comment: createCommentDto.comment,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            position: true,
          },
        },
      },
    });

    // Update user interactions
    await this.updateUserAnalytics(userId, 'interaction');

    return comment;
  }

  async getTasksByPhase() {
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
      acc[phase] = count;
      return acc;
    }, {});
  }

  private async updateUserAnalytics(userId: string, action: 'assigned' | 'completed' | 'interaction') {
    const updateData: any = {};

    switch (action) {
      case 'assigned':
        updateData.tasksAssigned = { increment: 1 };
        break;
      case 'completed':
        updateData.tasksCompleted = { increment: 1 };
        break;
      case 'interaction':
        updateData.interactions = { increment: 1 };
        break;
    }

    updateData.lastActive = new Date();

    await this.prisma.analytics.upsert({
      where: { userId },
      update: updateData,
      create: {
        userId,
        ...Object.keys(updateData).reduce((acc, key) => {
          if (key === 'lastActive') {
            acc[key] = updateData[key];
          } else {
            acc[key] = 1;
          }
          return acc;
        }, {}),
      },
    });
  }

  private async handlePhaseChange(task: any, oldPhase: TaskPhase) {
    if (task.phase === TaskPhase.COMPLETED && oldPhase !== TaskPhase.COMPLETED) {
      // Task completed
      if (task.assignedToId) {
        await this.updateUserAnalytics(task.assignedToId, 'completed');
      }
    }

    if (task.phase === TaskPhase.IN_PROGRESS && oldPhase !== TaskPhase.IN_PROGRESS) {
      // Task started
      if (task.assignedToId) {
        await this.prisma.analytics.upsert({
          where: { userId: task.assignedToId },
          update: {
            tasksInProgress: { increment: 1 },
            lastActive: new Date(),
          },
          create: {
            userId: task.assignedToId,
            tasksInProgress: 1,
            lastActive: new Date(),
          },
        });
      }
    }

    if (oldPhase === TaskPhase.IN_PROGRESS && task.phase !== TaskPhase.IN_PROGRESS) {
      // Task no longer in progress
      if (task.assignedToId) {
        await this.prisma.analytics.update({
          where: { userId: task.assignedToId },
          data: {
            tasksInProgress: { decrement: 1 },
            lastActive: new Date(),
          },
        });
      }
    }
  }
}
