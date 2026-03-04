import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuarterDto } from './dto/create-quarter.dto';
import { CloseQuarterDto } from './dto/close-quarter.dto';

@Injectable()
export class QuartersService {
    constructor(private readonly prisma: PrismaService) { }

    async findAll(companyId: string) {
        const quarters = await this.prisma.quarter.findMany({
            where: { companyId },
            include: {
                _count: { select: { tasks: true, objectives: true } },
                objectives: {
                    include: { keyResults: true },
                },
            },
            orderBy: [{ year: 'desc' }, { name: 'asc' }],
        });

        return quarters.map(q => {
            const totalTasks = q._count.tasks;
            const completedTasks = 0; // will be calc'd from task data in analytics
            return {
                ...q,
                totalTasks,
                completedTasks,
                objectivesCount: q._count.objectives,
            };
        });
    }

    async findOne(id: string, companyId: string) {
        const quarter = await this.prisma.quarter.findFirst({
            where: { id, companyId },
            include: {
                tasks: {
                    include: {
                        assignedTo: { select: { id: true, name: true } },
                        createdBy: { select: { id: true, name: true } },
                    },
                    orderBy: { createdAt: 'desc' },
                },
                objectives: {
                    include: { keyResults: true },
                },
            },
        });
        if (!quarter) throw new NotFoundException('Quarter not found');
        return quarter;
    }

    async create(dto: CreateQuarterDto, companyId: string) {
        // If setting as ACTIVE, deactivate others
        if (dto.status === 'ACTIVE') {
            await this.prisma.quarter.updateMany({
                where: { companyId, status: 'ACTIVE' },
                data: { status: 'CLOSED' },
            });
        }
        return this.prisma.quarter.create({
            data: {
                companyId,
                name: dto.name,
                year: dto.year,
                startDate: new Date(dto.startDate),
                endDate: new Date(dto.endDate),
                status: (dto.status as any) ?? 'UPCOMING',
            },
        });
    }

    async close(id: string, companyId: string, dto: CloseQuarterDto) {
        const quarter = await this.prisma.quarter.findFirst({ where: { id, companyId } });
        if (!quarter) throw new NotFoundException('Quarter not found');
        if (quarter.status === 'CLOSED') throw new BadRequestException('Quarter is already closed');

        // Close the quarter
        await this.prisma.quarter.update({
            where: { id },
            data: { status: 'CLOSED' },
        });

        // Roll over selected tasks
        if (dto.rolloverTaskIds?.length > 0) {
            const targetQuarterId = dto.nextQuarterId ?? null;
            await this.prisma.task.updateMany({
                where: { id: { in: dto.rolloverTaskIds }, companyId },
                data: {
                    quarterId: targetQuarterId,
                    isRolledOver: true,
                    rolledOverFrom: id,
                },
            });
        }

        // Unassign remaining incomplete tasks from this quarter
        await this.prisma.task.updateMany({
            where: {
                quarterId: id,
                companyId,
                id: { notIn: dto.rolloverTaskIds ?? [] },
                phase: { notIn: ['COMPLETED', 'ARCHIVED'] },
            },
            data: { quarterId: null },
        });

        return { success: true, message: 'Quarter closed successfully' };
    }

    async getAnalytics(id: string, companyId: string) {
        const quarter = await this.prisma.quarter.findFirst({
            where: { id, companyId },
            include: {
                tasks: {
                    select: { phase: true, isRolledOver: true, createdAt: true, completedAt: true },
                },
                objectives: {
                    include: { keyResults: true },
                },
            },
        });
        if (!quarter) throw new NotFoundException('Quarter not found');

        const tasks = quarter.tasks;
        const total = tasks.length;
        const completed = tasks.filter(t => t.phase === 'COMPLETED').length;
        const rolledOver = tasks.filter(t => t.isRolledOver).length;
        const inProgress = tasks.filter(t => t.phase === 'IN_PROGRESS').length;
        const pending = tasks.filter(t => ['PENDING_APPROVAL', 'APPROVED', 'ASSIGNED'].includes(t.phase)).length;
        const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
        const rolloverRate = total > 0 ? Math.round((rolledOver / total) * 100) : 0;

        // Objectives health
        const objectives = quarter.objectives.map(obj => {
            const krs = obj.keyResults;
            const progress = krs.length > 0
                ? Math.round(krs.reduce((sum, kr) => {
                    const pct = kr.targetValue > 0 ? (kr.currentValue / kr.targetValue) * 100 : 0;
                    return sum + Math.min(pct, 100);
                }, 0) / krs.length)
                : 0;
            return { ...obj, progress };
        });

        const avgObjectiveProgress = objectives.length > 0
            ? Math.round(objectives.reduce((s, o) => s + (o as any).progress, 0) / objectives.length)
            : 0;

        return {
            quarter: { id: quarter.id, name: quarter.name, year: quarter.year, status: quarter.status },
            tasks: { total, completed, rolledOver, inProgress, pending },
            completionRate,
            rolloverRate,
            avgObjectiveProgress,
            objectives,
        };
    }

    async getYearlyAnalytics(year: number, companyId: string) {
        const quarters = await this.prisma.quarter.findMany({
            where: { companyId, year },
            include: {
                tasks: { select: { phase: true, isRolledOver: true } },
                objectives: { include: { keyResults: true } },
            },
            orderBy: { name: 'asc' },
        });

        const data = quarters.map(q => {
            const total = q.tasks.length;
            const completed = q.tasks.filter(t => t.phase === 'COMPLETED').length;
            const rolledOver = q.tasks.filter(t => t.isRolledOver).length;
            const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
            const rolloverRate = total > 0 ? Math.round((rolledOver / total) * 100) : 0;

            const objProgress = q.objectives.map(obj => {
                const krs = obj.keyResults;
                return krs.length > 0
                    ? Math.round(krs.reduce((s, kr) => s + Math.min(kr.targetValue > 0 ? (kr.currentValue / kr.targetValue) * 100 : 0, 100), 0) / krs.length)
                    : 0;
            });
            const avgObjProgress = objProgress.length > 0 ? Math.round(objProgress.reduce((a, b) => a + b, 0) / objProgress.length) : 0;

            return {
                quarter: q.name,
                year: q.year,
                status: q.status,
                total,
                completed,
                rolledOver,
                completionRate,
                rolloverRate,
                objectivesCount: q.objectives.length,
                avgObjectiveProgress: avgObjProgress,
            };
        });

        const totalYear = data.reduce((s, q) => s + q.total, 0);
        const completedYear = data.reduce((s, q) => s + q.completed, 0);
        const overallCompletionRate = totalYear > 0 ? Math.round((completedYear / totalYear) * 100) : 0;

        return { year, quarters: data, summary: { totalTasks: totalYear, completedTasks: completedYear, overallCompletionRate } };
    }
}
