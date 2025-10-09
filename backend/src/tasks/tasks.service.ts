import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WorkflowsService } from '../workflows/workflows.service';
import { AiService } from '../ai/ai.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UserRole } from '../types/prisma';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly workflowsService: WorkflowsService,
    private readonly aiService: AiService,
  ) {}

  async create(createTaskDto: CreateTaskDto, creatorId: string) {
    try {
      let taskType = 'GENERAL';
      let workflow;
      
      // 1. Determine workflow - either provided or AI-detected
      if (createTaskDto.workflowId) {
        workflow = await this.prisma.workflow.findUnique({
          where: { id: createTaskDto.workflowId },
          include: { phases: { orderBy: { order: 'asc' } } },
        });
        if (!workflow) {
          throw new BadRequestException('Workflow not found');
        }
        taskType = workflow.taskType;
      } else {
        // AI task type detection
        const aiDetection = await this.aiService.detectTaskType(createTaskDto.title);
        taskType = aiDetection.task_type;
        
        workflow = await this.workflowsService.getDefaultWorkflow(taskType);
      }

      // 2. Generate AI content if missing
      let description = createTaskDto.description;
      let goals = createTaskDto.goals;
      let priority = createTaskDto.priority;

      if (!description || !goals || !priority) {
        const aiContent = await this.aiService.generateContent(createTaskDto.title);
        description = description || aiContent.description;
        goals = goals || aiContent.goals;
        priority = priority || aiContent.priority;
      }

      // 3. Create the task in the starting phase
      const startPhase = workflow.phases[0];
      const task = await this.prisma.task.create({
        data: {
          title: createTaskDto.title,
          description,
          goals,
          taskType,
          priority,
          workflowId: workflow.id,
          currentPhaseId: startPhase.id,
          dueDate: createTaskDto.dueDate ? new Date(createTaskDto.dueDate) : null,
          createdById: creatorId,
          assignedToId: createTaskDto.assignedToId,
        },
        include: {
          workflow: { include: { phases: { orderBy: { order: 'asc' } } } },
          currentPhase: true,
          createdBy: { select: { id: true, name: true, email: true, position: true } },
          assignedTo: { select: { id: true, name: true, email: true, position: true } },
        },
      });

      // 4. Generate AI subtasks if requested
      if (createTaskDto.generateSubtasks) {
        const aiSubtasks = await this.aiService.generateSubtasks({
          title: createTaskDto.title,
          description,
          taskType,
          workflowPhases: workflow.phases.map(p => p.name),
        });

        for (const [index, subtask] of aiSubtasks.subtasks.entries()) {
          // Find matching phase for subtask
          const subtaskPhase = workflow.phases.find(p => 
            subtask.phaseName && p.name.toLowerCase().includes(subtask.phaseName.toLowerCase())
          ) || startPhase;

          // Auto-assign if requested and role suggested
          let suggestedAssignee = null;
          if (createTaskDto.autoAssign && subtask.suggestedRole) {
            suggestedAssignee = await this.prisma.user.findFirst({
              where: {
                position: { contains: subtask.suggestedRole },
                status: 'ACTIVE',
              },
            });
          }

          await this.prisma.subtask.create({
            data: {
              taskId: task.id,
              title: subtask.title,
              description: subtask.description,
              order: index,
              phaseId: subtaskPhase.id,
              suggestedRole: subtask.suggestedRole,
              assignedToId: suggestedAssignee?.id,
              estimatedHours: subtask.estimatedHours,
            },
          });

          // Notify assigned user
          if (suggestedAssignee) {
            await this.notificationsService.createNotification({
              userId: suggestedAssignee.id,
              type: 'SUBTASK_ASSIGNED',
              title: 'New Subtask Assigned',
              message: `You've been assigned to: ${subtask.title} in task "${task.title}"`,
              taskId: task.id,
              actionUrl: `/tasks/${task.id}`,
            });
          }
        }
      }

      // 5. Handle task assignments
      if (createTaskDto.assignedUserIds && createTaskDto.assignedUserIds.length > 0) {
        for (const userId of createTaskDto.assignedUserIds) {
          await this.prisma.taskAssignment.create({
            data: {
              taskId: task.id,
              userId,
              assignedById: creatorId,
            },
          });

          await this.notificationsService.createNotification({
            userId,
            type: 'TASK_ASSIGNED',
            title: 'New Task Assigned',
            message: `You've been assigned to task: ${task.title}`,
            taskId: task.id,
            phaseId: startPhase.id,
            actionUrl: `/tasks/${task.id}`,
          });
        }
      } else if (createTaskDto.assignedToId) {
        await this.prisma.taskAssignment.create({
          data: {
            taskId: task.id,
            userId: createTaskDto.assignedToId,
            assignedById: creatorId,
          },
        });

        await this.notificationsService.createNotification({
          userId: createTaskDto.assignedToId,
          type: 'TASK_ASSIGNED',
          title: 'New Task Assigned',
          message: `You've been assigned to task: ${task.title}`,
          taskId: task.id,
          phaseId: startPhase.id,
          actionUrl: `/tasks/${task.id}`,
        });
      }

      // Return complete task data
      return this.findOne(task.id, creatorId, UserRole.SUPER_ADMIN);
    } catch (error) {
      console.error('Error creating task:', error);
      throw error;
    }
  }

  async moveTaskToPhase(taskId: string, toPhaseId: string, userId: string, comment?: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        workflow: { include: { phases: { orderBy: { order: 'asc' } } } },
        assignedTo: true,
        assignments: { include: { user: true } },
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const toPhase = await this.prisma.phase.findUnique({ where: { id: toPhaseId } });
    if (!toPhase) {
      throw new NotFoundException('Target phase not found');
    }

    // Validate transition
    const isValidTransition = await this.workflowsService.validatePhaseTransition(
      task.currentPhaseId,
      toPhaseId
    );

    // Get current phase details
    const currentPhase = task.workflow.phases.find(p => p.id === task.currentPhaseId);
    
    if (!isValidTransition) {
      throw new BadRequestException(
        `Cannot move task from "${currentPhase?.name || 'Unknown'}" to "${toPhase.name}"`
      );
    }

    // Update task phase
    await this.prisma.task.update({
      where: { id: taskId },
      data: { 
        currentPhaseId: toPhaseId,
        completedAt: toPhase.isEndPhase ? new Date() : null,
      },
    });

    // Record phase history
    await this.prisma.phaseHistory.create({
      data: {
        taskId,
        fromPhaseId: task.currentPhaseId,
        toPhaseId,
        movedById: userId,
        comment,
      },
    });

    // Notify stakeholders
    const usersToNotify = [
      task.assignedTo,
      ...task.assignments.map(a => a.user),
    ].filter((user, index, self) => 
      user && self.findIndex(u => u?.id === user.id) === index && user.id !== userId
    );

    for (const user of usersToNotify) {
      await this.notificationsService.createNotification({
        userId: user.id,
        type: 'TASK_PHASE_CHANGED',
        title: 'Task Phase Updated',
        message: `Task "${task.title}" moved from "${currentPhase?.name || 'Unknown'}" to "${toPhase.name}"`,
        taskId: task.id,
        phaseId: toPhaseId,
        actionUrl: `/tasks/${task.id}`,
      });
    }

    return this.findOne(taskId, userId, UserRole.SUPER_ADMIN);
  }

  async updateTaskAssignment(taskId: string, newAssigneeId: string, userId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { assignedTo: true },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const oldAssignee = task.assignedTo;

    // Update main assignee
    await this.prisma.task.update({
      where: { id: taskId },
      data: { assignedToId: newAssigneeId },
    });

    // Update or create assignment record
    await this.prisma.taskAssignment.upsert({
      where: {
        taskId_userId: {
          taskId,
          userId: newAssigneeId,
        },
      },
      create: {
        taskId,
        userId: newAssigneeId,
        assignedById: userId,
      },
      update: {
        assignedById: userId,
      },
    });

    // Notify new assignee
    await this.notificationsService.createNotification({
      userId: newAssigneeId,
      type: 'TASK_ASSIGNED',
      title: 'Task Assigned to You',
      message: `You've been assigned to task: ${task.title}`,
      taskId: task.id,
      phaseId: task.currentPhaseId,
      actionUrl: `/tasks/${task.id}`,
    });

    // Notify old assignee if different
    if (oldAssignee && oldAssignee.id !== newAssigneeId) {
      await this.notificationsService.createNotification({
        userId: oldAssignee.id,
        type: 'TASK_REASSIGNED',
        title: 'Task Reassigned',
        message: `Task "${task.title}" has been reassigned`,
        taskId: task.id,
        actionUrl: `/tasks/${task.id}`,
      });
    }

    return this.findOne(taskId, userId, UserRole.SUPER_ADMIN);
  }

  async findAll(
    userId?: string,
    userRole?: UserRole,
    phase?: any, // TODO: Replace with phase filtering by workflow phases
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

    // TODO: Implement workflow-based update restrictions
    // Phase-based restrictions have been moved to workflow phase permissions
    // Use moveTaskToPhase() method for phase transitions with proper validation

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

      // TODO: Update analytics based on workflow phase changes
      // Phase change analytics will be handled by moveTaskToPhase() method

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
    // TODO: Update to use workflow phases instead of TaskPhase enum
    // Return empty data for now until workflow integration is complete
    return {};
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

    // Analytics model removed - just update user's lastActiveAt
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastActiveAt: new Date() },
    }).catch(() => {});
  }

  private async handlePhaseChange(task: any, oldPhase: any) {
    // TODO: Update to use workflow phases instead of TaskPhase enum
    // Placeholder method until workflow integration is complete
    console.log('Phase change detected:', { taskId: task.id, oldPhase });

    // Analytics model removed - just update lastActiveAt
    if (task.assignedToId) {
      await this.prisma.user.update({
        where: { id: task.assignedToId },
        data: { lastActiveAt: new Date() },
      }).catch(() => {});
    }
  }

  private async updateAnalyticsForUser(userId: string, action: 'assigned' | 'completed' | 'interaction') {
    // Analytics model removed - just update user's lastActiveAt
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { lastActiveAt: new Date() },
      });
    } catch (error) {
      console.error('Failed to update user lastActiveAt:', error);
    }
  }

  private async notifyPhaseChange(task: any, oldPhase: any, updatedBy: string) {
    // TODO: Update to use workflow phases instead of TaskPhase enum
    // Simplified notification for workflow integration
    const message = `Task "${task.title}" phase has been updated`;
    const title = 'Task Phase Updated';

    // Notify assigned users about phase change
    if (task.assignedToId && task.assignedToId !== updatedBy) {
      await this.notificationsService.createNotification({
        userId: task.assignedToId,
        taskId: task.id,
        type: 'TASK_PHASE_CHANGED',
      title,
      message,
        actionUrl: `/tasks/${task.id}`,
      });
    }
  }
}
