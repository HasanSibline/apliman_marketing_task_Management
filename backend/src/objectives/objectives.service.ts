import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';
import { CreateObjectiveDto } from './dto/create-objective.dto';
import { CreateKeyResultDto, UpdateKeyResultDto } from './dto/key-result.dto';
import { taskFraction } from '../okr/okr-math';

function calcProgress(keyResults: any[]): number {
    if (!keyResults?.length) return 0;
    const total = keyResults.reduce((sum, kr) => {
        const pct = kr.targetValue > 0 ? (kr.currentValue / kr.targetValue) * 100 : 0;
        return sum + Math.min(pct, 100);
    }, 0);
    return Math.round(total / keyResults.length);
}

@Injectable()
export class ObjectivesService {
    constructor(
        private readonly prisma: PrismaService,
        @Inject(forwardRef(() => TasksService))
        private readonly tasksService: TasksService,
    ) { }

    private withProgress(obj: any) {
        const progress = calcProgress(obj.keyResults ?? []);
        return { ...obj, progress };
    }

    async findAll(companyId: string, userRole: string, quarterId?: string) {
        const where: any = { companyId };
        if (quarterId) where.quarterId = quarterId;

        if (userRole === 'EMPLOYEE') {
            where.OR = [
                { quarter: null },
                { quarter: { status: { not: 'UPCOMING' } } }
            ];
        }

        const objectives = await this.prisma.objective.findMany({
            where,
            include: {
                keyResults: true,
                quarter: { select: { id: true, name: true, year: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        return objectives.map(o => this.withProgress(o));
    }

    async findOne(id: string, companyId: string, userRole?: string) {
        const where: any = { id, companyId };
        
        if (userRole === 'EMPLOYEE') {
            where.OR = [
                { quarter: null },
                { quarter: { status: { not: 'UPCOMING' } } }
            ];
        }

        const obj = await this.prisma.objective.findFirst({
            where,
            include: {
                keyResults: true,
                quarter: { select: { id: true, name: true, year: true } },
                tasks: {
                    include: {
                        assignedTo: { select: { id: true, name: true, position: true } },
                        currentPhase: { select: { id: true, name: true, color: true } }
                    }
                }
            },
        });
        if (!obj) throw new NotFoundException('Objective not found');
        return this.withProgress(obj);
    }

    async create(dto: CreateObjectiveDto, companyId: string) {
        return this.prisma.objective.create({
            data: {
                companyId,
                title: dto.title,
                description: dto.description,
                quarterId: dto.quarterId ?? null,
                ownerId: dto.ownerId ?? null,
                status: (dto.status as any) ?? 'ON_TRACK',
            },
            include: { keyResults: true },
        });
    }

    async update(id: string, companyId: string, dto: Partial<CreateObjectiveDto>) {
        await this.findOne(id, companyId);
        return this.prisma.objective.update({
            where: { id },
            data: { ...dto } as any,
            include: { keyResults: true },
        });
    }

    async remove(id: string, companyId: string) {
        await this.findOne(id, companyId);
        return this.prisma.objective.delete({ where: { id } });
    }

    // Key Results
    async addKeyResult(objectiveId: string, companyId: string, dto: CreateKeyResultDto) {
        await this.findOne(objectiveId, companyId);
        return this.prisma.keyResult.create({
            data: {
                objectiveId,
                title: dto.title,
                unit: dto.unit ?? 'number',
                startValue: dto.startValue,
                targetValue: dto.targetValue,
                currentValue: dto.currentValue ?? dto.startValue,
            },
        });
    }

    async updateKeyResult(krId: string, companyId: string, dto: UpdateKeyResultDto) {
        // Verify ownership via objective
        const kr = await this.prisma.keyResult.findUnique({
            where: { id: krId },
            include: { objective: { select: { companyId: true } } },
        });
        if (!kr || kr.objective.companyId !== companyId) throw new NotFoundException('Key result not found');

        // currentValue is derived from the linked tasks and their subtasks, never set
        // by hand. Accepting it here let a typed-in number survive until the next task
        // change silently overwrote it, which is why progress appeared to move on its
        // own. You define what the key result measures; the work decides where it is.
        const { currentValue, ...editable } = dto as any;

        const updated = await this.prisma.keyResult.update({
            where: { id: krId },
            data: editable,
        });

        // Changing the start or target rescales progress, so recompute against them.
        if ('startValue' in editable || 'targetValue' in editable) {
            await this.tasksService.recalculateKeyResult(krId);
            return this.prisma.keyResult.findUnique({ where: { id: krId } });
        }

        return updated;
    }

    async removeKeyResult(krId: string, companyId: string) {
        const kr = await this.prisma.keyResult.findUnique({
            where: { id: krId },
            include: { objective: { select: { companyId: true } } },
        });
        if (!kr || kr.objective.companyId !== companyId) throw new NotFoundException('Key result not found');
        return this.prisma.keyResult.delete({ where: { id: krId } });
    }

    async linkTask(objectiveId: string, companyId: string, taskId: string, keyResultId?: string) {
        await this.findOne(objectiveId, companyId);
        
        if (keyResultId) {
            const kr = await this.prisma.keyResult.findUnique({
                where: { id: keyResultId, objectiveId }
            });
            if (!kr) throw new NotFoundException('Key result not found in this objective');
        }

        // Note the previous key result before overwriting it: moving a task between
        // key results has to recompute both, or the one it left keeps counting it.
        const previous = await this.prisma.task.findUnique({
            where: { id: taskId },
            select: { keyResultId: true },
        });

        const task = await this.prisma.task.update({
            where: { id: taskId },
            data: {
                objectiveId,
                keyResultId: keyResultId || null
            },
        });

        const affected = new Set<string>();
        if (previous?.keyResultId) affected.add(previous.keyResultId);
        if (keyResultId) affected.add(keyResultId);
        for (const krId of affected) {
            await this.tasksService.recalculateKeyResult(krId);
        }

        return task;
    }

    async unlinkTask(objectiveId: string, companyId: string, taskId: string) {
        await this.findOne(objectiveId, companyId);
        
        // Find existing to know if we need to recalculate a key result
        const existingTask = await this.prisma.task.findUnique({ where: { id: taskId }, select: { keyResultId: true }});
        
        const task = await this.prisma.task.update({
            where: { id: taskId, objectiveId },
            data: { objectiveId: null, keyResultId: null },
        });

        // The key result it left has one fewer task counting toward it.
        if (existingTask?.keyResultId) {
            await this.tasksService.recalculateKeyResult(existingTask.keyResultId);
        }
        
        return task;
    }

    /**
     * The tasks a key result is calculated from, with the contribution each one makes.
     *
     * A key result reads 62 of 100 and, until now, there was no way to ask why. This
     * returns the same fractions the rollup uses, so the page can show the arithmetic
     * rather than asking anyone to trust it.
     */
    async getKeyResultTasks(keyResultId: string, companyId: string) {
        const kr = await this.prisma.keyResult.findFirst({
            where: { id: keyResultId, objective: { companyId } },
            select: { id: true, title: true, startValue: true, targetValue: true, currentValue: true },
        });
        if (!kr) throw new NotFoundException('Key result not found');

        const tasks = await this.prisma.task.findMany({
            where: { keyResultId, companyId },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                title: true,
                taskNumber: true,
                phase: true,
                completedAt: true,
                dueDate: true,
                assignedTo: { select: { id: true, name: true, avatar: true } },
                currentPhase: { select: { name: true, color: true, isEndPhase: true } },
                subtasks: { select: { isCompleted: true } },
            },
        });

        return {
            keyResult: kr,
            tasks: tasks.map((t) => {
                const isComplete =
                    t.completedAt !== null ||
                    t.phase === 'COMPLETED' ||
                    t.phase === 'ARCHIVED' ||
                    t.currentPhase?.isEndPhase === true;
                const fraction = taskFraction({ isComplete, subtasks: t.subtasks });
                return {
                    id: t.id,
                    title: t.title,
                    taskNumber: t.taskNumber,
                    phaseName: t.currentPhase?.name ?? t.phase,
                    phaseColor: t.currentPhase?.color ?? null,
                    assignee: t.assignedTo?.name ?? null,
                    dueDate: t.dueDate,
                    isComplete,
                    subtasksTotal: t.subtasks.length,
                    subtasksDone: t.subtasks.filter((st) => st.isCompleted).length,
                    // What this task adds to the key result, as a percentage of one task.
                    contribution: Math.round(fraction * 100),
                };
            }),
        };
    }

}
