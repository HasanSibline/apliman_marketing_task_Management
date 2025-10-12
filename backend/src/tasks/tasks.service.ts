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

      // 4. Create subtasks (either pre-generated from frontend or generate via AI)
      let subtasksToCreate: Array<any> = [];

      if (createTaskDto.aiSubtasks && createTaskDto.aiSubtasks.length > 0) {
        // Use pre-generated subtasks that user may have edited in the modal
        subtasksToCreate = createTaskDto.aiSubtasks;
      } else if (createTaskDto.generateSubtasks) {
        // Fetch available users for AI assignment suggestions
        const availableUsers = await this.prisma.user.findMany({
          where: {
            status: 'ACTIVE',
          },
            select: {
              id: true,
              name: true,
              position: true,
            role: true,
          },
        });

        // Generate subtasks via AI with real user data
        const aiSubtasks = await this.aiService.generateSubtasks({
          title: createTaskDto.title,
          description,
          taskType,
          workflowPhases: workflow.phases.map(p => p.name),
          availableUsers,
        });
        subtasksToCreate = aiSubtasks.subtasks;
      }

      // Process subtasks - Create individual tasks for assigned subtasks
      if (subtasksToCreate.length > 0) {
        for (const [index, subtask] of subtasksToCreate.entries()) {
          // Find matching phase for subtask
          const subtaskPhase = workflow.phases.find(p => 
            subtask.phaseName && p.name.toLowerCase().includes(subtask.phaseName.toLowerCase())
          ) || startPhase;

          // Auto-assign if requested and role/user suggested
          let suggestedAssignee = null;
          if (createTaskDto.autoAssign) {
            if (subtask.suggestedUserId) {
              // Use specific user ID if provided by AI
              suggestedAssignee = await this.prisma.user.findUnique({
                where: {
                  id: subtask.suggestedUserId,
                  status: 'ACTIVE',
                },
              });
            } else if (subtask.suggestedRole) {
              // Fallback to role-based assignment
              suggestedAssignee = await this.prisma.user.findFirst({
                where: {
                  position: { contains: subtask.suggestedRole },
                  status: 'ACTIVE',
                },
              });
            }
          }

          // Create subtask record
          const createdSubtask = await this.prisma.subtask.create({
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

          // ALWAYS create individual task if there's an assignee (regardless of autoAssign flag)
          if (suggestedAssignee) {
            const individualTask = await this.prisma.task.create({
              data: {
                title: `${subtask.title} (from: ${task.title})`,
                description: subtask.description || `Subtask from main task: ${task.title}`,
                goals: `Complete subtask: ${subtask.title}`,
                priority: task.priority,
                taskType: 'SUBTASK',
                workflowId: workflow.id,
                currentPhaseId: subtaskPhase.id,
                assignedToId: suggestedAssignee.id,
                createdById: creatorId,
                dueDate: task.dueDate, // Inherit due date from parent
                parentTaskId: task.id, // Link to parent task
                subtaskId: createdSubtask.id, // Link to subtask record
              },
              include: {
                assignedTo: { select: { id: true, name: true, email: true, position: true } },
                createdBy: { select: { id: true, name: true, email: true, position: true } },
        },
      });

            // Create task assignment record for individual task
            await this.prisma.taskAssignment.create({
              data: {
                taskId: individualTask.id,
                userId: suggestedAssignee.id,
                assignedById: creatorId,
              },
            });

            // Notify assigned user about individual task
            await this.notificationsService.createNotification({
              userId: suggestedAssignee.id,
              type: 'TASK_ASSIGNED',
              title: 'New Task Assigned',
              message: `You've been assigned a new task: "${individualTask.title}"`,
              taskId: individualTask.id,
              actionUrl: `/tasks/${individualTask.id}`,
            });
          } else {
            // Notify about unassigned subtask
            await this.notificationsService.createNotification({
              userId: creatorId,
              type: 'SUBTASK_CREATED',
              title: 'Subtask Created',
              message: `Subtask "${subtask.title}" was created but needs assignment`,
          taskId: task.id,
              subtaskId: createdSubtask.id,
              actionUrl: `/tasks/${task.id}`,
            });
          }
        }
      }

      // 5. Handle main task placement when subtasks are auto-created
      // If subtasks were created and assigned to others, mark main task as coordination task
      const hasAssignedSubtasks = subtasksToCreate.some(subtask => 
        createTaskDto.autoAssign && (subtask.suggestedUserId || subtask.suggestedRole)
      );
      
      if (hasAssignedSubtasks) {
        // Update main task to reflect its coordination role
        await this.prisma.task.update({
          where: { id: task.id },
          data: {
            taskType: 'COORDINATION',
            description: task.description + '\n\n📋 This is a coordination task with individual subtasks assigned to team members.',
            goals: task.goals + '\n\n• Coordinate and monitor subtask completion\n• Ensure quality and timeline adherence\n• Facilitate communication between team members',
          },
        });
      }

      // 6. Handle task assignments for main task
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

    // Check if target phase requires approval
    if (toPhase.requiresApproval) {
      // Check if there's already a pending approval
      const existingApproval = await this.prisma.phaseApproval.findFirst({
        where: {
          taskId,
          phaseId: toPhaseId,
          status: 'PENDING',
        },
      });

      if (existingApproval) {
        throw new BadRequestException('An approval request for this phase is already pending');
      }

      // Create approval request
      await this.prisma.phaseApproval.create({
        data: {
          taskId,
          phaseId: toPhaseId,
          requestedById: userId,
        },
      });

      // Notify admins about approval request
      const admins = await this.prisma.user.findMany({
        where: {
          role: { in: ['SUPER_ADMIN', 'ADMIN'] },
        },
        select: { id: true },
      });

      for (const admin of admins) {
        await this.notificationsService.createNotification({
          userId: admin.id,
          type: 'TASK_PHASE_CHANGED',
          title: 'Approval Required',
          message: `Task "${task.title}" needs approval to move to "${toPhase.name}"`,
          taskId: task.id,
          phaseId: toPhaseId,
          actionUrl: `/approvals`,
        });
      }

      return {
        ...task,
        pendingApproval: true,
        approvalPhase: toPhase.name,
      };
    }

    // No approval needed - move directly
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

    const movedBy = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });

    // Special handling if task is completed
    if (toPhase.isEndPhase) {
      // Notify task creator
      if (task.createdById && task.createdById !== userId) {
        await this.notificationsService.createNotification({
          userId: task.createdById,
          type: 'TASK_COMPLETED',
          title: 'Task Completed',
          message: `${movedBy?.name || 'Someone'} completed task "${task.title}"`,
          taskId: task.id,
          actionUrl: `/tasks/${task.id}`,
        });
      }

      // Notify admins
          const admins = await this.prisma.user.findMany({
            where: {
          role: { in: ['SUPER_ADMIN', 'ADMIN'] },
          id: { not: userId },
            },
            select: { id: true },
          });

          for (const admin of admins) {
            await this.notificationsService.createNotification({
              userId: admin.id,
          type: 'TASK_COMPLETED',
          title: 'Task Completed',
          message: `Task "${task.title}" was completed by ${movedBy?.name || 'someone'}`,
              taskId: task.id,
          actionUrl: `/tasks/${task.id}`,
        });
      }

      // Also notify assignees about completion
      for (const user of usersToNotify) {
        await this.notificationsService.createNotification({
          userId: user.id,
          type: 'TASK_COMPLETED',
          title: 'Task Completed',
          message: `Task "${task.title}" has been completed`,
          taskId: task.id,
          actionUrl: `/tasks/${task.id}`,
        });
      }
    } else {
      // Regular phase change notifications
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
    }

    return this.findOne(taskId, userId, UserRole.SUPER_ADMIN);
  }

  async toggleSubtaskComplete(taskId: string, subtaskId: string, userId: string) {
    // Find the subtask
    const subtask = await this.prisma.subtask.findUnique({
      where: { id: subtaskId },
      include: { 
        task: {
          include: {
            assignedTo: true,
            createdBy: true,
          }
        },
        linkedTask: {
          include: {
            assignedTo: true,
          }
        }
      },
    });

    if (!subtask || subtask.taskId !== taskId) {
      throw new NotFoundException('Subtask not found');
    }

    const wasCompleted = subtask.isCompleted;

    // Toggle completion status
    const updated = await this.prisma.subtask.update({
      where: { id: subtaskId },
      data: {
        isCompleted: !subtask.isCompleted,
        completedAt: !subtask.isCompleted ? new Date() : null,
      },
    });

    // Send notifications when subtask is completed
    if (!wasCompleted && updated.isCompleted) {
      const completedBy = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });

      // Notify task creator
      if (subtask.task.createdById && subtask.task.createdById !== userId) {
        await this.notificationsService.createNotification({
          userId: subtask.task.createdById,
          type: 'TASK_COMPLETED',
          title: 'Subtask Completed',
          message: `${completedBy?.name || 'Someone'} completed subtask "${subtask.title}" on task "${subtask.task.title}"`,
          taskId: subtask.task.id,
          actionUrl: `/tasks/${subtask.task.id}`,
        });
      }

      // Notify task assignee if different from creator and completer
      if (subtask.task.assignedToId && 
          subtask.task.assignedToId !== userId && 
          subtask.task.assignedToId !== subtask.task.createdById) {
        await this.notificationsService.createNotification({
          userId: subtask.task.assignedToId,
          type: 'TASK_COMPLETED',
          title: 'Subtask Completed',
          message: `${completedBy?.name || 'Someone'} completed subtask "${subtask.title}"`,
          taskId: subtask.task.id,
          actionUrl: `/tasks/${subtask.task.id}`,
        });
      }

      // Notify all admins
      const admins = await this.prisma.user.findMany({
        where: {
          role: { in: ['SUPER_ADMIN', 'ADMIN'] },
          id: { not: userId }, // Don't notify the person who completed it
        },
        select: { id: true },
      });

      for (const admin of admins) {
        await this.notificationsService.createNotification({
          userId: admin.id,
          type: 'TASK_COMPLETED',
          title: 'Subtask Completed',
          message: `Subtask "${subtask.title}" was completed by ${completedBy?.name || 'someone'}`,
          taskId: subtask.task.id,
          actionUrl: `/tasks/${subtask.task.id}`,
        });
      }
    }

    // Recalculate parent task progress (for future use)
    const allSubtasks = await this.prisma.subtask.findMany({
      where: { taskId },
    });
    const completedCount = allSubtasks.filter(s => s.isCompleted).length;
    const progressPercentage = allSubtasks.length > 0 ? Math.round((completedCount / allSubtasks.length) * 100) : 0;

    // Note: Progress is calculated dynamically from subtasks, not stored
    console.log(`Task ${taskId} progress: ${progressPercentage}%`);

    return updated;
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
          workflow: {
            select: {
              id: true,
              name: true,
              taskType: true,
              color: true,
              phases: true,
            },
          },
          currentPhase: {
            select: {
              id: true,
              name: true,
              color: true,
              order: true,
            },
          },
          subtasks: {
            include: {
              assignedTo: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  position: true,
                },
              },
              phase: {
                select: {
                  id: true,
                  name: true,
                  color: true,
                },
              },
            },
            orderBy: {
              order: 'asc',
            },
          },
          assignments: {
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
        workflow: {
          select: {
            id: true,
            name: true,
            taskType: true,
            color: true,
            phases: true,
          },
        },
        currentPhase: {
          select: {
            id: true,
            name: true,
            color: true,
            order: true,
          },
        },
        subtasks: {
          include: {
            assignedTo: {
              select: {
                id: true,
                name: true,
                email: true,
                position: true,
              },
            },
            phase: {
              select: {
                id: true,
                name: true,
                color: true,
              },
            },
          },
          orderBy: {
            order: 'asc',
          },
        },
        assignments: {
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
            images: {
              select: {
                id: true,
                mimeType: true,
                size: true,
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
    const task = await this.findOne(taskId, userId, userRole);

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

    // Notify mentioned users
    if (createCommentDto.mentionedUserIds && createCommentDto.mentionedUserIds.length > 0) {
      const commenter = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });

      for (const mentionedUserId of createCommentDto.mentionedUserIds) {
        // Don't notify the commenter if they mentioned themselves
        if (mentionedUserId !== userId) {
          await this.notificationsService.createNotification({
            userId: mentionedUserId,
            type: 'COMMENT_MENTION',
            title: 'You were mentioned in a comment',
            message: `${commenter?.name || 'Someone'} mentioned you in a comment on "${task.title}"`,
            taskId: task.id,
            commentId: comment.id,
            actionUrl: `/tasks/${task.id}`,
          });
        }
      }
    }

    // Update user interactions
    await this.updateUserAnalytics(userId, 'interaction');

    return comment;
  }

  async addCommentWithImages(
    taskId: string,
    comment: string,
    mentionedUserIds: string[],
    images: Express.Multer.File[],
    userId: string,
    userRole: UserRole
  ) {
    // Verify user has access to the task
    const task = await this.findOne(taskId, userId, userRole);

    // Create comment first
    const createdComment = await this.prisma.taskComment.create({
      data: {
        taskId,
        userId,
        comment,
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

    // Store images as base64 in database
    const imageRecords = [];
    if (images && images.length > 0) {
      for (const image of images) {
        // Convert buffer to base64
        const base64Data = image.buffer.toString('base64');
        
        // Create image record
        const imageRecord = await this.prisma.commentImage.create({
          data: {
            commentId: createdComment.id,
            data: base64Data,
            mimeType: image.mimetype,
            size: image.size,
          },
        });
        
        imageRecords.push({
          id: imageRecord.id,
          mimeType: imageRecord.mimeType,
          size: imageRecord.size,
        });
      }
    }

    // Notify mentioned users
    if (mentionedUserIds && mentionedUserIds.length > 0) {
      const commenter = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });

      for (const mentionedUserId of mentionedUserIds) {
        if (mentionedUserId !== userId) {
          await this.notificationsService.createNotification({
            userId: mentionedUserId,
            type: 'COMMENT_MENTION',
            title: 'You were mentioned in a comment',
            message: `${commenter?.name || 'Someone'} mentioned you in a comment on "${task.title}"`,
            taskId: task.id,
            commentId: createdComment.id,
            actionUrl: `/tasks/${task.id}`,
          });
        }
      }
    }

    // Update user interactions
    await this.updateUserAnalytics(userId, 'interaction');

    return {
      ...createdComment,
      images: imageRecords,
    };
  }

  async getCommentImage(imageId: string) {
    const image = await this.prisma.commentImage.findUnique({
      where: { id: imageId },
      select: {
        data: true,
        mimeType: true,
      },
    });

    if (!image) {
      throw new NotFoundException('Image not found');
    }

    return image;
  }

  async getPendingApprovals(userId: string, userRole: UserRole) {
    // Only admins can see approvals
    if (userRole !== UserRole.SUPER_ADMIN && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can view approvals');
    }

    const approvals = await this.prisma.phaseApproval.findMany({
      where: {
        status: 'PENDING',
      },
      include: {
        task: {
          include: {
            workflow: true,
            currentPhase: true,
            assignedTo: true,
            createdBy: true,
          },
        },
        phase: true,
        requestedBy: true,
      },
      orderBy: {
        requestedAt: 'desc',
      },
    });

    return approvals;
  }

  async approvePhaseChange(approvalId: string, userId: string, userRole: UserRole, comment?: string) {
    // Only admins can approve
    if (userRole !== UserRole.SUPER_ADMIN && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can approve phase changes');
    }

    const approval = await this.prisma.phaseApproval.findUnique({
      where: { id: approvalId },
      include: {
        task: {
          include: {
            workflow: { include: { phases: true } },
          },
        },
        phase: true,
        requestedBy: true,
      },
    });

    if (!approval) {
      throw new NotFoundException('Approval request not found');
    }

    if (approval.status !== 'PENDING') {
      throw new BadRequestException('This approval has already been processed');
    }

    // Update approval status
    await this.prisma.phaseApproval.update({
      where: { id: approvalId },
      data: {
        status: 'APPROVED',
        reviewedById: userId,
        reviewedAt: new Date(),
        reviewComment: comment,
      },
    });

    // Move task to the approved phase
    await this.prisma.task.update({
      where: { id: approval.taskId },
      data: {
        currentPhaseId: approval.phaseId,
        completedAt: approval.phase.isEndPhase ? new Date() : null,
      },
    });

    // Record phase history
    await this.prisma.phaseHistory.create({
      data: {
        taskId: approval.taskId,
        fromPhaseId: approval.task.currentPhaseId,
        toPhaseId: approval.phaseId,
        movedById: userId,
        comment: comment || 'Approved by admin',
      },
    });

    // Notify requester
    await this.notificationsService.createNotification({
      userId: approval.requestedById,
      type: 'TASK_PHASE_CHANGED',
      title: 'Phase Change Approved',
      message: `Your request to move "${approval.task.title}" to "${approval.phase.name}" has been approved`,
      taskId: approval.taskId,
      phaseId: approval.phaseId,
      actionUrl: `/tasks/${approval.taskId}`,
    });

    // Notify task assignee if different
    if (approval.task.assignedToId && approval.task.assignedToId !== approval.requestedById) {
      await this.notificationsService.createNotification({
        userId: approval.task.assignedToId,
        type: 'TASK_PHASE_CHANGED',
        title: 'Task Phase Updated',
        message: `Task "${approval.task.title}" has been moved to "${approval.phase.name}"`,
        taskId: approval.taskId,
        phaseId: approval.phaseId,
        actionUrl: `/tasks/${approval.taskId}`,
      });
    }

    return this.findOne(approval.taskId, userId, userRole);
  }

  async rejectPhaseChange(approvalId: string, userId: string, userRole: UserRole, comment?: string) {
    // Only admins can reject
    if (userRole !== UserRole.SUPER_ADMIN && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can reject phase changes');
    }

    const approval = await this.prisma.phaseApproval.findUnique({
      where: { id: approvalId },
      include: {
        task: true,
        phase: true,
        requestedBy: true,
      },
    });

    if (!approval) {
      throw new NotFoundException('Approval request not found');
    }

    if (approval.status !== 'PENDING') {
      throw new BadRequestException('This approval has already been processed');
    }

    // Update approval status
    await this.prisma.phaseApproval.update({
      where: { id: approvalId },
      data: {
        status: 'REJECTED',
        reviewedById: userId,
        reviewedAt: new Date(),
        reviewComment: comment,
      },
    });

    // Notify requester
    await this.notificationsService.createNotification({
      userId: approval.requestedById,
      type: 'TASK_PHASE_CHANGED',
      title: 'Phase Change Rejected',
      message: `Your request to move "${approval.task.title}" to "${approval.phase.name}" has been rejected${comment ? `: ${comment}` : ''}`,
      taskId: approval.taskId,
      actionUrl: `/tasks/${approval.taskId}`,
    });

    return { message: 'Phase change rejected', approval };
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
