import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';

@Injectable()
export class WorkflowsService {
  constructor(private prisma: PrismaService) {}

  async createWorkflow(dto: CreateWorkflowDto, userId: string) {
    // If setting as default, unset other defaults for this task type
    if (dto.isDefault) {
      await this.prisma.workflow.updateMany({
        where: { taskType: dto.taskType, isDefault: true },
        data: { isDefault: false },
      });
    }

    // Create workflow with phases
    const workflow = await this.prisma.workflow.create({
      data: {
        name: dto.name,
        description: dto.description,
        taskType: dto.taskType,
        isDefault: dto.isDefault || false,
        color: dto.color || '#3B82F6',
        createdById: userId,
        phases: {
          create: dto.phases.map((phase, index) => ({
            name: phase.name,
            description: phase.description,
            order: index,
            color: phase.color || '#6B7280',
            allowedRoles: phase.allowedRoles, // Native array for PostgreSQL
            autoAssignRole: phase.autoAssignRole,
            requiresApproval: phase.requiresApproval || false,
            isStartPhase: index === 0,
            isEndPhase: index === dto.phases.length - 1,
          })),
        },
      },
      include: {
        phases: { orderBy: { order: 'asc' } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    // Create transitions between consecutive phases
    const phases = workflow.phases;
    for (let i = 0; i < phases.length - 1; i++) {
      await this.prisma.transition.create({
        data: {
          fromPhaseId: phases[i].id,
          toPhaseId: phases[i + 1].id,
          name: `Move to ${phases[i + 1].name}`,
          notifyRoles: [],
        },
      });
    }

    return this.getWorkflowById(workflow.id);
  }

  async getWorkflows(taskType?: string) {
    const workflows = await this.prisma.workflow.findMany({
      where: taskType ? { taskType, isActive: true } : { isActive: true },
      include: {
        phases: { orderBy: { order: 'asc' } },
        _count: { select: { tasks: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Return workflows as-is (PostgreSQL arrays don't need parsing)
    return workflows;
  }

  async getWorkflowById(id: string) {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id },
      include: {
        phases: {
          orderBy: { order: 'asc' },
          include: {
            transitionsFrom: { 
              include: { 
                toPhase: true 
              } 
            },
          },
        },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    // Return workflow as-is (PostgreSQL arrays don't need parsing)
    return workflow;
  }

  async getDefaultWorkflow(taskType: string) {
    const workflow = await this.prisma.workflow.findFirst({
      where: { taskType, isDefault: true, isActive: true },
      include: { phases: { orderBy: { order: 'asc' } } },
    });

    if (!workflow) {
      throw new NotFoundException(`No default workflow found for task type: ${taskType}`);
    }

    // Return workflow as-is (PostgreSQL arrays don't need parsing)
    return workflow;
  }

  async validatePhaseTransition(fromPhaseId: string, toPhaseId: string): Promise<boolean> {
    const transition = await this.prisma.transition.findUnique({
      where: {
        fromPhaseId_toPhaseId: {
          fromPhaseId,
          toPhaseId,
        },
      },
    });

    return !!transition;
  }

  async updateWorkflow(id: string, dto: Partial<CreateWorkflowDto>) {
    const workflow = await this.prisma.workflow.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        color: dto.color,
        isDefault: dto.isDefault,
      },
      include: { phases: { orderBy: { order: 'asc' } } },
    });

    // Parse JSON fields
    return {
      ...workflow,
      phases: workflow.phases.map(phase => ({
        ...phase,
        allowedRoles: phase.allowedRoles, // Already an array in PostgreSQL
      })),
    };
  }

  async deleteWorkflow(id: string) {
    const taskCount = await this.prisma.task.count({ where: { workflowId: id } });
    if (taskCount > 0) {
      throw new BadRequestException('Cannot delete workflow in use by tasks');
    }

    return this.prisma.workflow.delete({ where: { id } });
  }

  async seedDefaultWorkflows(userId: string) {
    // Check if workflows already exist
    const existingWorkflows = await this.prisma.workflow.count();
    if (existingWorkflows > 0) {
      return { 
        message: 'Workflows already exist',
        count: existingWorkflows 
      };
    }

    // Create Social Media Workflow
    const socialMediaWorkflow = await this.prisma.workflow.create({
      data: {
        name: 'Social Media Workflow',
        description: 'Standard workflow for social media content creation',
        taskType: 'SOCIAL_MEDIA_POST',
        isDefault: true,
        color: '#3B82F6',
        createdById: userId,
        phases: {
          create: [
            {
              name: 'Research & Strategy',
              description: 'Define objectives and strategy',
              order: 0,
              color: '#9333EA',
              allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'],
              isStartPhase: true,
            },
            {
              name: 'Content Creation',
              description: 'Write copy and create visuals',
              order: 1,
              color: '#2563EB',
              allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'],
            },
            {
              name: 'Review & Approval',
              description: 'Quality check and approval',
              order: 2,
              color: '#F59E0B',
              allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
              requiresApproval: true,
            },
            {
              name: 'Published',
              description: 'Content published',
              order: 3,
              color: '#10B981',
              allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
              isEndPhase: true,
            },
          ],
        },
      },
    });

    // Create Video Production Workflow
    const videoWorkflow = await this.prisma.workflow.create({
      data: {
        name: 'Video Production Workflow',
        description: 'Workflow for video content production',
        taskType: 'VIDEO_CONTENT',
        isDefault: true,
        color: '#EC4899',
        createdById: userId,
        phases: {
          create: [
            {
              name: 'Pre-Production',
              description: 'Script, storyboard, and planning',
              order: 0,
              color: '#8B5CF6',
              allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'],
              isStartPhase: true,
            },
            {
              name: 'Production',
              description: 'Filming and recording',
              order: 1,
              color: '#3B82F6',
              allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'],
            },
            {
              name: 'Post-Production',
              description: 'Editing and effects',
              order: 2,
              color: '#F59E0B',
              allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'],
            },
            {
              name: 'Review',
              description: 'Final review and approval',
              order: 3,
              color: '#EF4444',
              allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
              requiresApproval: true,
            },
            {
              name: 'Published',
              description: 'Video published',
              order: 4,
              color: '#10B981',
              allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
              isEndPhase: true,
            },
          ],
        },
      },
    });

    // Create General Marketing Workflow
    const generalWorkflow = await this.prisma.workflow.create({
      data: {
        name: 'General Marketing Workflow',
        description: 'General workflow for marketing tasks',
        taskType: 'GENERAL',
        isDefault: true,
        color: '#6366F1',
        createdById: userId,
        phases: {
          create: [
            {
              name: 'To Do',
              description: 'Tasks to be started',
              order: 0,
              color: '#9CA3AF',
              allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'],
              isStartPhase: true,
            },
            {
              name: 'In Progress',
              description: 'Tasks being worked on',
              order: 1,
              color: '#3B82F6',
              allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'],
            },
            {
              name: 'Review',
              description: 'Tasks under review',
              order: 2,
              color: '#F59E0B',
              allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
            },
            {
              name: 'Completed',
              description: 'Completed tasks',
              order: 3,
              color: '#10B981',
              allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
              isEndPhase: true,
            },
          ],
        },
      },
    });

    // Create transitions for each workflow
    const workflows = [socialMediaWorkflow, videoWorkflow, generalWorkflow];
    
    for (const workflow of workflows) {
      const phases = await this.prisma.phase.findMany({
        where: { workflowId: workflow.id },
        orderBy: { order: 'asc' },
      });

      for (let i = 0; i < phases.length - 1; i++) {
        await this.prisma.transition.create({
          data: {
            fromPhaseId: phases[i].id,
            toPhaseId: phases[i + 1].id,
            name: `Move to ${phases[i + 1].name}`,
            notifyRoles: [],
          },
        });
      }
    }

    return {
      message: 'Default workflows seeded successfully',
      workflows: [
        { name: socialMediaWorkflow.name, id: socialMediaWorkflow.id },
        { name: videoWorkflow.name, id: videoWorkflow.id },
        { name: generalWorkflow.name, id: generalWorkflow.id },
      ],
    };
  }

  /**
   * Validate if a user has permission to access a phase
   * Checks both user-based (new) and role-based (legacy) permissions
   */
  async validateUserPhaseAccess(userId: string, phaseId: string): Promise<boolean> {
    const phase = await this.prisma.phase.findUnique({
      where: { id: phaseId },
      select: { 
        allowedUsers: true,
        allowedRoles: true 
      },
    });

    if (!phase) {
      return false;
    }

    // Check user-based permissions first (new system)
    if (phase.allowedUsers && phase.allowedUsers.length > 0) {
      return phase.allowedUsers.includes(userId);
    }

    // Fallback to role-based permissions (legacy support)
    if (phase.allowedRoles && phase.allowedRoles.length > 0) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      return user ? phase.allowedRoles.includes(user.role) : false;
    }

    // If no permissions set, allow access
    return true;
  }

  /**
   * Update phase to use user-based permissions
   */
  async updatePhasePermissions(phaseId: string, allowedUserIds: string[]) {
    return this.prisma.phase.update({
      where: { id: phaseId },
      data: { allowedUsers: allowedUserIds },
    });
  }

  /**
   * Update transition to use user-based notifications
   */
  async updateTransitionNotifications(transitionId: string, notifyUserIds: string[]) {
    return this.prisma.transition.update({
      where: { id: transitionId },
      data: { notifyUsers: notifyUserIds },
    });
  }
}

