import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';
import { CreateObjectiveDto } from './dto/create-objective.dto';
import { CreateKeyResultDto, UpdateKeyResultDto } from './dto/key-result.dto';

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

    async findAll(companyId: string, quarterId?: string) {
        const objectives = await this.prisma.objective.findMany({
            where: { companyId, ...(quarterId ? { quarterId } : {}) },
            include: {
                keyResults: true,
                quarter: { select: { id: true, name: true, year: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        return objectives.map(o => this.withProgress(o));
    }

    async findOne(id: string, companyId: string) {
        const obj = await this.prisma.objective.findFirst({
            where: { id, companyId },
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
        return this.prisma.keyResult.update({ where: { id: krId }, data: dto as any });
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

        const task = await this.prisma.task.update({
            where: { id: taskId },
            data: { 
                objectiveId,
                keyResultId: keyResultId || null
            },
        });

        // Trigger calculation in case the task is already completed
        if (keyResultId) {
            await this.tasksService.calculateKeyResultProgress(taskId).catch(console.error);
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

        // If it was linked to a key result, we must recalculate since it's unlinked
        if (existingTask?.keyResultId) {
            // Because it no longer has keyResultId, we pass in a mock object with keyResultId or fake calculation logic.
            // Wait, calculateKeyResultProgress expects the task to STILL have keyResultId so it can find the KR.
            // Instead, we recalculate manually for the old krId here.
            this.recalculateKrDirect(existingTask.keyResultId).catch(console.error);
        }
        
        return task;
    }

    private async recalculateKrDirect(krId: string) {
        const totalTasks = await this.prisma.task.count({ where: { keyResultId: krId } });
        const completedTasks = await this.prisma.task.count({
            where: {
                keyResultId: krId,
                OR: [
                    { completedAt: { not: null } },
                    { phase: { in: ['COMPLETED', 'ARCHIVED'] } },
                    { currentPhase: { isEndPhase: true } }
                ]
            }
        });
        
        const kr = await this.prisma.keyResult.findUnique({ where: { id: krId } });
        if (kr) {
            const rawProgress = totalTasks > 0 ? (completedTasks / totalTasks) : 0;
            const range = kr.targetValue - kr.startValue;
            const newCurrentValue = kr.startValue + (range * rawProgress);
            
            await this.prisma.keyResult.update({
                where: { id: krId },
                data: { currentValue: newCurrentValue }
            });
        }
    }
}
