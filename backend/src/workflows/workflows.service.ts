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
            allowedRoles: JSON.stringify(phase.allowedRoles),
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

    // Parse JSON fields
    return workflows.map(workflow => ({
      ...workflow,
      phases: workflow.phases.map(phase => ({
        ...phase,
        allowedRoles: phase.allowedRoles, // Already an array in PostgreSQL
      })),
    }));
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

    // Return workflow with native arrays (PostgreSQL)
    return {
      ...workflow,
      phases: workflow.phases.map(phase => ({
        ...phase,
        allowedRoles: phase.allowedRoles, // Already an array in PostgreSQL
        transitionsFrom: phase.transitionsFrom.map(t => ({
          ...t,
          notifyRoles: t.notifyRoles, // Already an array in PostgreSQL
        })),
      })),
    };
  }

  async getDefaultWorkflow(taskType: string) {
    const workflow = await this.prisma.workflow.findFirst({
      where: { taskType, isDefault: true, isActive: true },
      include: { phases: { orderBy: { order: 'asc' } } },
    });

    if (!workflow) {
      throw new NotFoundException(`No default workflow found for task type: ${taskType}`);
    }

    // Parse JSON fields
    return {
      ...workflow,
      phases: workflow.phases.map(phase => ({
        ...phase,
        allowedRoles: phase.allowedRoles, // Already an array in PostgreSQL
      })),
    };
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
}

