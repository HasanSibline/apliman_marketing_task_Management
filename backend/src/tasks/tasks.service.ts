import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { Prisma } from '@prisma/client';
import { TaskPhase, UserRole } from '../types/prisma';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(createTaskDto: CreateTaskDto, creatorId: string) {
    try {
      const { assignedUserIds, ...taskData } = createTaskDto;
      
      const task = await this.prisma.task.create({
        data: {
          ...taskData,
          dueDate: createTaskDto.dueDate ? new Date(createTaskDto.dueDate) : null,
          createdById: creatorId,
        } as any,
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

      // Create multiple assignments if assignedUserIds provided
      if (assignedUserIds && assignedUserIds.length > 0) {
        const assignmentData = assignedUserIds.map(userId => ({
          taskId: task.id,
          userId,
          assignedBy: creatorId,
        }));

        await (this.prisma as any).taskAssignment.createMany({
          data: assignmentData,
        });

        // Update analytics for all assigned users
        for (const userId of assignedUserIds) {
          await this.updateUserAnalytics(userId, 'assigned');
          await this.updateAnalyticsForUser(userId, 'assigned');
        }

        // Send notifications to all assigned users
        for (const userId of assignedUserIds) {
          await this.notificationsService.createNotification({
            userId,
            taskId: task.id,
            type: 'task_assigned',
            title: 'New Task Assigned',
            message: `You have been assigned to task: "${task.title}"`,
          });
        }
      } else if (task.assignedToId) {
        // Handle single assignment for backward compatibility
        await this.updateUserAnalytics(task.assignedToId, 'assigned');
        await this.updateAnalyticsForUser(task.assignedToId, 'assigned');
        
        await this.notificationsService.createNotification({
          userId: task.assignedToId,
          taskId: task.id,
          type: 'task_assigned',
          title: 'New Task Assigned',
          message: `You have been assigned to task: "${task.title}"`,
        });
      }

      // Notify admins about new task creation (if created by employee)
      if (creatorId) {
        const creator = await this.prisma.user.findUnique({
          where: { id: creatorId },
          select: { role: true, name: true },
        });

        if (creator?.role === UserRole.EMPLOYEE) {
          // Get all admins to notify them
          const admins = await this.prisma.user.findMany({
            where: {
              role: { in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] },
            },
            select: { id: true },
          });

          // Create notifications for all admins
          for (const admin of admins) {
            await this.notificationsService.createNotification({
              userId: admin.id,
              taskId: task.id,
              type: 'task_created',
              title: 'New Task Requires Approval',
              message: `${creator.name} created a new task: "${task.title}" that requires approval.`,
            });
          }
        }
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
    search?: string,
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
    if (search) {
      const searchConditions = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { goals: { contains: search, mode: 'insensitive' } },
      ];

      if (where.OR) {
        // If there's already an OR clause (for role-based filtering), combine them with AND
        where.AND = [
          { OR: where.OR },
          { OR: searchConditions }
        ];
        delete where.OR;
      } else {
        where.OR = searchConditions;
      }
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
          subtasks: {
            include: {
              assignedTo: {
                select: { id: true, name: true, email: true, position: true }
              },
              createdBy: {
                select: { id: true, name: true, email: true, position: true }
              }
            },
            orderBy: { createdAt: 'asc' }
          },
          _count: {
            select: {
              files: true,
              comments: true,
              subtasks: true,
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
        subtasks: {
          include: {
            assignedTo: {
              select: { id: true, name: true, email: true, position: true }
            },
            createdBy: {
              select: { id: true, name: true, email: true, position: true }
            }
          },
          orderBy: { createdAt: 'asc' }
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
      // Employees cannot approve (assign) or reject tasks
      if (updateTaskDto.phase === 'ASSIGNED' && existingTask.phase === 'PENDING_APPROVAL') {
        throw new ForbiddenException('Employees cannot approve tasks');
      }
      if (updateTaskDto.phase === 'REJECTED') {
        throw new ForbiddenException('Employees cannot reject tasks');
      }
      
      // Employees cannot archive tasks
      if (updateTaskDto.phase === 'ARCHIVED') {
        throw new ForbiddenException('Employees cannot archive tasks');
      }
      
      // Employees can only update phase and only to allowed phases
      const allowedFields = ['phase'];
      const allowedPhases = ['IN_PROGRESS', 'COMPLETED'];
      
      if (updateTaskDto.phase && !allowedPhases.includes(updateTaskDto.phase)) {
        throw new ForbiddenException(`Employees can only move tasks to: ${allowedPhases.join(', ')}`);
      }
      
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
        } as any,
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
        
        // Update analytics for completion
        if (updateTaskDto.phase === TaskPhase.COMPLETED && existingTask.phase !== TaskPhase.COMPLETED) {
          if (updatedTask.assignedToId) {
            await this.updateAnalyticsForUser(updatedTask.assignedToId, 'completed');
          }
          // Update analytics for multiple assignments
          // Note: assignments relationship will be available after Prisma client regeneration
          // if (updatedTask.assignments && updatedTask.assignments.length > 0) {
          //   for (const assignment of updatedTask.assignments) {
          //     await this.updateAnalyticsForUser(assignment.userId, 'completed');
          //   }
          // }
        }
        
        // Send notifications for phase changes
        await this.notifyPhaseChange(updatedTask, existingTask.phase as TaskPhase, userId);
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
          where: { phase: phase as any },
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

  private async updateAnalyticsForUser(userId: string, action: 'assigned' | 'completed' | 'interaction') {
    try {
      // Ensure analytics record exists
      let analytics = await this.prisma.analytics.findUnique({
        where: { userId },
      });

      if (!analytics) {
        analytics = await this.prisma.analytics.create({
          data: {
            userId,
            tasksAssigned: 0,
            tasksCompleted: 0,
            interactions: 0,
            lastActive: new Date(),
          },
        });
      }

      // Update analytics based on action
      const updateData: any = {
        lastActive: new Date(),
      };

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

      await this.prisma.analytics.update({
        where: { userId },
        data: updateData,
      });
    } catch (error) {
      console.error('Failed to update analytics:', error);
    }
  }

  private async notifyPhaseChange(task: any, oldPhase: TaskPhase, updatedBy: string) {
    const phaseMessages = {
      [TaskPhase.PENDING_APPROVAL]: 'Task is pending approval',
      ['REJECTED']: 'Task has been rejected',
      [TaskPhase.ASSIGNED]: 'Task has been approved and assigned',
      [TaskPhase.IN_PROGRESS]: 'Task is now in progress',
      [TaskPhase.COMPLETED]: 'Task has been completed',
      [TaskPhase.ARCHIVED]: 'Task has been archived',
    };

    const phaseTitles = {
      [TaskPhase.PENDING_APPROVAL]: 'Task Pending Approval',
      ['REJECTED']: 'Task Rejected',
      [TaskPhase.ASSIGNED]: 'Task Approved & Assigned',
      [TaskPhase.IN_PROGRESS]: 'Task In Progress',
      [TaskPhase.COMPLETED]: 'Task Completed',
      [TaskPhase.ARCHIVED]: 'Task Archived',
    };

    const newPhase = task.phase as TaskPhase;
    const title = phaseTitles[newPhase] || 'Task Updated';
    const message = phaseMessages[newPhase] || `Task "${task.title}" has been updated`;

    // Notify all assigned users
    await this.notificationsService.notifyTaskAssignees(
      task.id,
      'task_phase_changed',
      title,
      message,
      updatedBy
    );

    // Notify task creator
    await this.notificationsService.notifyTaskCreator(
      task.id,
      'task_phase_changed',
      title,
      message,
      updatedBy
    );
  }

  // Subtask methods
  async addSubtask(taskId: string, data: { title: string; description?: string; assignedToId?: string; dueDate?: string }, createdById: string) {
    // Check if task exists and user has access
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { createdBy: true, assignedTo: true }
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Check permissions - task creator, assignee, or admin can add subtasks
    const user = await this.prisma.user.findUnique({ where: { id: createdById } });
    const canAddSubtask = 
      task.createdById === createdById ||
      task.assignedToId === createdById ||
      user?.role === UserRole.SUPER_ADMIN ||
      user?.role === UserRole.ADMIN;

    if (!canAddSubtask) {
      throw new ForbiddenException('You do not have permission to add subtasks to this task');
    }

    const subtask = await (this.prisma as any).subtask.create({
      data: {
        title: data.title,
        description: data.description,
        assignedToId: data.assignedToId,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        priority: task.priority, // Inherit parent task priority
        taskId,
        createdById,
      },
      include: {
        assignedTo: {
          select: { id: true, name: true, email: true, position: true }
        },
        createdBy: {
          select: { id: true, name: true, email: true, position: true }
        }
      }
    });

    // Send notification if subtask is assigned to someone
    if (data.assignedToId && data.assignedToId !== createdById) {
      await this.notificationsService.createNotification({
        userId: data.assignedToId,
        taskId: taskId,
        type: 'subtask_assigned',
        title: 'New Subtask Assigned',
        message: `You have been assigned a new subtask: "${data.title}"`,
      });
    }

    return subtask;
  }

  async updateSubtask(taskId: string, subtaskId: string, data: { title?: string; description?: string; completed?: boolean; assignedToId?: string; dueDate?: string }, userId: string) {
    // Check if subtask exists
    const subtask = await (this.prisma as any).subtask.findUnique({
      where: { id: subtaskId },
      include: { 
        task: { include: { createdBy: true, assignedTo: true } },
        assignedTo: true,
        createdBy: true 
      }
    });

    if (!subtask || subtask.taskId !== taskId) {
      throw new NotFoundException('Subtask not found');
    }

    // Check permissions
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const canUpdateSubtask = 
      subtask.task.createdById === userId ||
      subtask.task.assignedToId === userId ||
      subtask.assignedToId === userId ||
      subtask.createdById === userId ||
      user?.role === UserRole.SUPER_ADMIN ||
      user?.role === UserRole.ADMIN;

    if (!canUpdateSubtask) {
      throw new ForbiddenException('You do not have permission to update this subtask');
    }

    const updatedSubtask = await (this.prisma as any).subtask.update({
      where: { id: subtaskId },
      data: {
        ...(data.title && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.completed !== undefined && { completed: data.completed }),
        ...(data.assignedToId !== undefined && { assignedToId: data.assignedToId }),
        ...(data.dueDate !== undefined && { dueDate: data.dueDate ? new Date(data.dueDate) : null }),
      },
      include: {
        assignedTo: {
          select: { id: true, name: true, email: true, position: true }
        },
        createdBy: {
          select: { id: true, name: true, email: true, position: true }
        }
      }
    });

    // Send notification if subtask was completed
    if (data.completed === true && !subtask.completed) {
      await this.notificationsService.createNotification({
        userId: subtask.task.createdById,
        taskId: taskId,
        type: 'subtask_completed',
        title: 'Subtask Completed',
        message: `Subtask "${updatedSubtask.title}" has been marked as completed`,
      });
    }

    return updatedSubtask;
  }

  async deleteSubtask(taskId: string, subtaskId: string, userId: string) {
    // Check if subtask exists
    const subtask = await (this.prisma as any).subtask.findUnique({
      where: { id: subtaskId },
      include: { 
        task: { include: { createdBy: true, assignedTo: true } },
        assignedTo: true,
        createdBy: true 
      }
    });

    if (!subtask || subtask.taskId !== taskId) {
      throw new NotFoundException('Subtask not found');
    }

    // Check permissions - only admins, task creator, or subtask creator can delete
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const canDeleteSubtask = 
      subtask.task.createdById === userId ||
      subtask.createdById === userId ||
      user?.role === UserRole.SUPER_ADMIN ||
      user?.role === UserRole.ADMIN;

    if (!canDeleteSubtask) {
      throw new ForbiddenException('You do not have permission to delete this subtask');
    }

    await (this.prisma as any).subtask.delete({
      where: { id: subtaskId }
    });

    return { message: 'Subtask deleted successfully' };
  }
}
