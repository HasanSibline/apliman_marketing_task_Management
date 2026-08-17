import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { canUseWorkflow, usableWorkflows, whyNotUsable } from './workflow-access';

@Injectable()
export class WorkflowsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get user's companyId for filtering
   */
  private async getUserCompanyId(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true, role: true },
    });
    
    if (user?.role === 'SUPER_ADMIN') {
      return null; // Super admin sees all workflows
    }
    
    return user?.companyId || null;
  }

  async createWorkflow(dto: CreateWorkflowDto, userId: string) {
    // Get user's company
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true, role: true },
    });

    if (!user?.companyId && user?.role !== 'SUPER_ADMIN') {
      throw new BadRequestException('User must belong to a company to create workflows');
    }

    // If setting as default, unset other defaults for this task type IN THE SAME COMPANY
    if (dto.isDefault) {
      await this.prisma.workflow.updateMany({
        where: { 
          taskType: dto.taskType, 
          isDefault: true,
          companyId: user.companyId, // Only within the company
        },
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
        departmentId: dto.departmentId || null,
        // Teams only mean something inside a department. Dropped rather than stored
        // when there is no department, so a workflow cannot end up narrowed to teams
        // while claiming to be company-wide.
        teamIds: dto.departmentId ? (dto.teamIds ?? []) : [],
        createdById: userId,
        companyId: user.companyId, // Add company isolation
        phases: {
          create: dto.phases.map((phase, index) => ({
            name: phase.name,
            description: phase.description,
            order: index,
            color: phase.color || '#6B7280',
            // Support both old (roles) and new (user IDs) approach
            allowedRoles: phase.allowedRoles || [],
            allowedUsers: phase.allowedUserIds || [],
            autoAssignRole: phase.autoAssignRole,
            autoAssignUserId: phase.autoAssignUserId,
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

  /**
   * The workflows this person may actually pick.
   *
   * Scoped in two steps: the database narrows by company, and canUseWorkflow narrows by
   * department and team. The second half is deliberately done in memory rather than as
   * a where clause, because the rule has to be identical everywhere it is asked and a
   * clause here would be a second copy of it that could drift from the function the
   * create guard uses.
   *
   * This is what makes the task form show a team only its own workflows, which is the
   * whole point: a picker offering choices that will be refused on submit is worse than
   * a shorter picker.
   */
  async getWorkflows(taskType?: string, userId?: string) {
    const user = userId
      ? await this.prisma.user.findUnique({
          where: { id: userId },
          select: {
            companyId: true,
            role: true,
            departmentId: true,
            teamMemberships: { select: { teamId: true } },
          },
        })
      : null;

    const workflows = await this.prisma.workflow.findMany({
      where: {
        ...(taskType && { taskType }),
        isActive: true,
        ...(user?.companyId && { companyId: user.companyId }),
      },
      include: {
        phases: { orderBy: { order: 'asc' } },
        department: { select: { id: true, name: true } },
        _count: { select: { tasks: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // No identified caller means no basis to scope, so nothing is hidden. The company
    // filter above has already done the part that protects other tenants.
    if (!user) return workflows;

    return usableWorkflows(
      {
        role: user.role,
        departmentId: user.departmentId,
        teamIds: user.teamMemberships.map((m) => m.teamId),
      },
      workflows,
    );
  }

  /**
   * The caller's company, and whether they are allowed to ignore it.
   *
   * Every single-workflow route took an id and nothing else, so a workflow was
   * reachable by anyone who knew its id regardless of which company owned it. In a
   * multi-tenant app that is one guessed identifier away from reading, editing or
   * deleting another customer's configuration.
   *
   * A super admin genuinely operates across companies, so they are the one caller that
   * skips the check. Everyone else is pinned to their own.
   */
  private async assertSameCompany(workflowId: string, userId?: string) {
    if (!userId) throw new NotFoundException('Workflow not found');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true, role: true },
    });
    if (user?.role === 'SUPER_ADMIN') return;

    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { companyId: true },
    });

    // Not found rather than forbidden: telling someone a workflow exists but is not
    // theirs confirms the id, which is the thing worth not confirming.
    if (!workflow || !user?.companyId || workflow.companyId !== user.companyId) {
      throw new NotFoundException('Workflow not found');
    }
  }

  async getWorkflowById(id: string, userId?: string) {
    await this.assertSameCompany(id, userId);

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

  async getDefaultWorkflow(taskType: string, userId?: string) {
    // Get company filter
    let companyId: string | null = null;
    if (userId) {
      companyId = await this.getUserCompanyId(userId);
    }

    const workflow = await this.prisma.workflow.findFirst({
      where: { 
        taskType, 
        isDefault: true, 
        isActive: true,
        ...(companyId && { companyId }), // Filter by company
      },
      include: { phases: { orderBy: { order: 'asc' } } },
    });

    if (!workflow) {
      throw new NotFoundException(`No default workflow found for task type: ${taskType}`);
    }

    // Return workflow as-is (PostgreSQL arrays don't need parsing)
    return workflow;
  }

  async validatePhaseTransition(fromPhaseId: string, toPhaseId: string): Promise<boolean> {
    const [fromPhase, toPhase] = await Promise.all([
      this.prisma.phase.findUnique({ where: { id: fromPhaseId } }),
      this.prisma.phase.findUnique({ where: { id: toPhaseId } }),
    ]);

    if (!fromPhase || !toPhase) return false;

    // Allow transition if both phases belong to the same workflow
    return fromPhase.workflowId === toPhase.workflowId;
  }

  async updateWorkflow(id: string, dto: Partial<CreateWorkflowDto>, userId?: string) {
    await this.assertSameCompany(id, userId);

    // Phases first, so a refused phase change leaves the whole edit untouched rather
    // than applying the name and colour and then failing.
    if (dto.phases) {
      await this.reconcilePhases(id, dto.phases);
    }

    const workflow = await this.prisma.workflow.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        color: dto.color,
        isDefault: dto.isDefault,
        // Undefined leaves a column alone in Prisma while null clears it, and both are
        // wanted here: an edit that does not mention scope must not silently widen a
        // restricted workflow, and one that sends null must be able to remove the
        // restriction.
        ...(dto.departmentId !== undefined ? { departmentId: dto.departmentId || null } : {}),
        ...(dto.teamIds !== undefined
          ? { teamIds: dto.departmentId === null ? [] : dto.teamIds }
          : {}),
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

  /**
   * Bring a workflow's phases in line with the list the editor submitted.
   *
   * Three operations in the order that keeps the workflow valid throughout: existing
   * phases updated, new ones created, missing ones removed last. Removing last means a
   * rename-and-replace never leaves the workflow momentarily with no phases.
   *
   * A phase carrying tasks is never deleted. Task.currentPhaseId is optional, so the
   * database would happily null it and hand back tasks sitting in no phase at all,
   * which reads as neither started nor finished to every check in the app. Refusing,
   * and naming the phase and how many tasks, is the only outcome somebody can act on.
   *
   * Order comes from array position, so dragging a phase in the editor is a reorder
   * here.
   */
  private async reconcilePhases(workflowId: string, incoming: any[]) {
    if (incoming.length < 2) {
      throw new BadRequestException('A workflow needs at least two phases.');
    }

    const existing = await this.prisma.phase.findMany({
      where: { workflowId },
      select: { id: true, name: true, _count: { select: { tasks: true } } },
    });

    const keptIds = new Set(incoming.map((p) => p.id).filter(Boolean));
    const doomed = existing.filter((p) => !keptIds.has(p.id));

    const inUse = doomed.filter((p) => p._count.tasks > 0);
    if (inUse.length > 0) {
      const names = inUse
        .map((p) => `${p.name} (${p._count.tasks} ${p._count.tasks === 1 ? 'task' : 'tasks'})`)
        .join(', ');
      throw new BadRequestException(
        `Move the work out first: ${names} still ${inUse.length === 1 ? 'has tasks in it' : 'have tasks in them'}.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Positions are parked out of range before any are reused. Without this, moving a
      // phase from third to first collides with the phase already holding first, on the
      // unique (workflowId, order) constraint, part-way through the update.
      for (const [i, phase] of existing.entries()) {
        await tx.phase.update({ where: { id: phase.id }, data: { order: -1 - i } });
      }

      for (const [index, phase] of incoming.entries()) {
        const data = {
          name: phase.name,
          description: phase.description ?? null,
          color: phase.color || '#6B7280',
          order: index,
          isStartPhase: index === 0,
          isEndPhase: index === incoming.length - 1,
          allowedUsers: phase.allowedUserIds ?? [],
          requiresApproval: !!phase.requiresApproval,
          autoAssignUserId: phase.autoAssignUserId || null,
        };

        const isExisting = phase.id && existing.some((e) => e.id === phase.id);
        if (isExisting) {
          await tx.phase.update({ where: { id: phase.id }, data });
        } else {
          await tx.phase.create({ data: { ...data, workflowId } });
        }
      }

      if (doomed.length > 0) {
        await tx.phase.deleteMany({ where: { id: { in: doomed.map((p) => p.id) } } });
      }
    });
  }

  async deleteWorkflow(id: string, userId?: string) {
    await this.assertSameCompany(id, userId);

    const taskCount = await this.prisma.task.count({ where: { workflowId: id } });
    if (taskCount > 0) {
      throw new BadRequestException(
        `This workflow is used by ${taskCount} ${taskCount === 1 ? 'task' : 'tasks'}, so it cannot be deleted.`,
      );
    }

    return this.prisma.workflow.delete({ where: { id } });
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

