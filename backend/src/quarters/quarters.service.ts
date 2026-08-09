import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuarterDto } from './dto/create-quarter.dto';
import { CloseQuarterDto } from './dto/close-quarter.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { didObjectiveLand } from '../okr/okr-math';

@Injectable()
export class QuartersService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly notifications: NotificationsService,
    ) { }

    /**
     * @param selectable when true, returns only quarters you can still schedule work
     *   into: the active one and anything upcoming. Closed quarters are history, and
     *   offering them in a picker invites filing new work into a finished cycle.
     */
    async findAll(companyId: string, userRole?: string, selectable = false) {
        const where: any = { companyId };
        if (userRole === 'EMPLOYEE') {
            where.status = { not: 'UPCOMING' };
        }
        if (selectable) {
            where.status = userRole === 'EMPLOYEE' ? 'ACTIVE' : { in: ['ACTIVE', 'UPCOMING'] };
        }
        return this.prisma.quarter.findMany({
            where,
            // Selectable lists read forwards, since the next quarter is what you want
            // near the top. History reads backwards, newest first.
            orderBy: selectable
                ? [{ year: 'asc' }, { startDate: 'asc' }]
                : [{ year: 'desc' }, { name: 'desc' }],
        });
    }

    async findActive(companyId: string) {
        const quarter = await this.prisma.quarter.findFirst({
            where: { companyId, status: 'ACTIVE' },
            include: {
                _count: {
                    select: { tasks: true }
                },
                objectives: {
                    include: {
                        keyResults: true
                    }
                }
            }
        });

        if (!quarter) return null;

        // Get completed tasks count separately to be accurate
        const completedTasksCount = await this.prisma.task.count({
            where: {
                quarterId: quarter.id,
                companyId,
                completedAt: { not: null }
            }
        });

        // Calculate progress
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

        const avgProgress = objectives.length > 0
            ? Math.round(objectives.reduce((sum, obj) => sum + obj.progress, 0) / objectives.length)
            : 0;

        return {
            ...quarter,
            completedTasksCount,
            totalTasksCount: quarter._count.tasks,
            avgProgress,
            objectives
        };
    }

    async findOne(id: string, companyId: string, userRole?: string) {
        const quarter = await this.prisma.quarter.findFirst({
            where: { id, companyId },
            include: {
                tasks: {
                    include: {
                        assignedTo: { select: { id: true, name: true, position: true } },
                        createdBy: { select: { id: true, name: true } },
                        currentPhase: { select: { id: true, name: true, color: true, isEndPhase: true } },
                    },
                    orderBy: { createdAt: 'desc' },
                },
                objectives: {
                    include: { keyResults: true },
                },
            },
        });
        if (!quarter) throw new NotFoundException('Quarter not found');

        // Strategic Lock Check for findOne
        if (userRole === 'EMPLOYEE' && quarter.status === 'UPCOMING') {
            throw new NotFoundException('Cycle is currently private and under planning.');
        }

        // Calculate stats for frontend accuracy
        const totalTasks = quarter.tasks.length;
        const completedTasks = quarter.tasks.filter(t => 
            t.completedAt !== null || 
            (t as any).phase === 'COMPLETED' || 
            t.currentPhase?.isEndPhase
        ).length;
        const objectivesCount = quarter.objectives.length;

        // Calculate progress for each objective
        const objectivesWithProgress = quarter.objectives.map(obj => {
            const krs = obj.keyResults;
            const progress = krs.length > 0
                ? Math.round(krs.reduce((sum, kr) => {
                    const pct = kr.targetValue > 0 ? (kr.currentValue / kr.targetValue) * 100 : 0;
                    return sum + Math.min(pct, 100);
                }, 0) / krs.length)
                : 0;
            return { ...obj, progress };
        });

        return {
            ...quarter,
            totalTasks,
            completedTasks,
            objectivesCount,
            objectives: objectivesWithProgress
        };
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

    async update(id: string, companyId: string, dto: Partial<CreateQuarterDto>) {
        const quarter = await this.prisma.quarter.findFirst({ where: { id, companyId } });
        if (!quarter) throw new NotFoundException('Quarter not found');

        // If transitioning to ACTIVE, close other active cycles
        if (dto.status === 'ACTIVE') {
            await this.prisma.quarter.updateMany({
                where: { companyId, status: 'ACTIVE', id: { not: id } },
                data: { status: 'CLOSED' },
            });
        }

        return this.prisma.quarter.update({
            where: { id },
            data: {
                ...dto,
                startDate: dto.startDate ? new Date(dto.startDate) : undefined,
                endDate: dto.endDate ? new Date(dto.endDate) : undefined,
            } as any,
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

        const rolloverIds = dto.rolloverTaskIds ?? [];

        // Capture who is affected BEFORE the updates, while the links still exist.
        // Closing a quarter used to move and orphan people's work in silence: the
        // assignee found out by noticing their task had left the quarter.
        const [rollingOver, beingReleased, nextQuarter] = await Promise.all([
            rolloverIds.length > 0
                ? this.prisma.task.findMany({
                      where: { id: { in: rolloverIds }, companyId },
                      select: { id: true, title: true, assignedToId: true },
                  })
                : Promise.resolve([]),
            this.prisma.task.findMany({
                where: {
                    quarterId: id,
                    companyId,
                    id: { notIn: rolloverIds },
                    phase: { notIn: ['COMPLETED', 'ARCHIVED'] },
                },
                select: { id: true, title: true, assignedToId: true },
            }),
            dto.nextQuarterId
                ? this.prisma.quarter.findUnique({
                      where: { id: dto.nextQuarterId },
                      select: { name: true, year: true },
                  })
                : Promise.resolve(null),
        ]);

        // Roll over selected tasks
        if (rolloverIds.length > 0) {
            const targetQuarterId = dto.nextQuarterId ?? null;
            await this.prisma.task.updateMany({
                where: { id: { in: rolloverIds }, companyId },
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
                id: { notIn: rolloverIds },
                phase: { notIn: ['COMPLETED', 'ARCHIVED'] },
            },
            data: { quarterId: null },
        });

        // Objectives kept pointing at a closed quarter with no status change, so an
        // unfinished objective simply stopped meaning anything. Mark the ones that
        // did not land, and complete the ones that did.
        await this.settleObjectivesForClosedQuarter(id);

        // Deliberately does NOT start the next quarter. Closing and starting are two
        // decisions, and an admin presses Start Cycle when the team is ready, which
        // may not be the moment the previous quarter's books are closed. What matters
        // is that the next quarter is visible and startable as soon as this one shuts.
        const nextUp = await this.prisma.quarter.findFirst({
            where: { companyId, status: 'UPCOMING' },
            orderBy: [{ year: 'asc' }, { startDate: 'asc' }],
            select: { id: true, name: true, year: true },
        });

        await this.notifyAffectedAssignees(rollingOver, beingReleased, quarter, nextQuarter);

        // Tell the people who can start the next one that it is waiting, so closing
        // does not simply leave silence.
        if (nextUp) {
            await this.notifyCompanyAdmins(
                companyId,
                'QUARTER_READY_TO_START',
                `${nextUp.name} ${nextUp.year} is ready to start`,
                `${quarter.name} ${quarter.year} is closed. Open Quarters and press Start Cycle when the team is ready.`,
            );
        }

        return {
            success: true,
            message: nextUp
                ? `Quarter closed. ${nextUp.name} ${nextUp.year} is ready, start it when you are.`
                : 'Quarter closed. Create the next quarter when you are ready to plan it.',
            rolledOver: rollingOver.length,
            released: beingReleased.length,
            nextQuarter: nextUp ? { id: nextUp.id, name: nextUp.name, year: nextUp.year } : null,
        };
    }

    async getAnalytics(id: string, companyId: string) {
        const quarter = await this.prisma.quarter.findFirst({
            where: { id, companyId },
            include: {
                tasks: {
                    select: { phase: true, isRolledOver: true, createdAt: true, completedAt: true, currentPhase: { select: { isEndPhase: true } } },
                },
                objectives: {
                    include: { keyResults: true },
                },
            },
        });
        if (!quarter) throw new NotFoundException('Quarter not found');

        const tasks = quarter.tasks;
        const total = tasks.length;
        const completed = tasks.filter((t: any) => Boolean(t.completedAt) || t.phase === 'COMPLETED' || t.phase === 'ARCHIVED' || t.currentPhase?.isEndPhase).length;
        const rolledOver = tasks.filter((t: any) => t.isRolledOver).length;
        const inProgress = tasks.filter((t: any) => t.phase === 'IN_PROGRESS' || (!Boolean(t.completedAt) && t.phase !== 'COMPLETED' && t.phase !== 'ARCHIVED' && !t.currentPhase?.isEndPhase)).length;
        const pending = tasks.filter((t: any) => ['PENDING_APPROVAL', 'APPROVED', 'ASSIGNED'].includes(t.phase)).length;
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
            ? Math.round(objectives.reduce((sum, obj) => sum + (obj as any).progress, 0) / objectives.length)
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
                tasks: { select: { phase: true, isRolledOver: true, completedAt: true, currentPhase: { select: { isEndPhase: true } } } },
                objectives: { include: { keyResults: true } },
            },
            orderBy: { name: 'asc' },
        });

        const data = quarters.map(q => {
            const total = q.tasks.length;
            const completed = q.tasks.filter((t: any) => Boolean(t.completedAt) || t.phase === 'COMPLETED' || t.phase === 'ARCHIVED' || t.currentPhase?.isEndPhase).length;
            const rolledOver = q.tasks.filter((t: any) => t.isRolledOver).length;
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

    /**
     * A task the assignee still owns should never quietly change context. Tells each
     * affected person once, whether their work moved forward or came off the quarter.
     */
    private async notifyAffectedAssignees(
        rolledOver: { id: string; title: string; assignedToId: string | null }[],
        released: { id: string; title: string; assignedToId: string | null }[],
        quarter: { name: string; year: number },
        nextQuarter: { name: string; year: number } | null,
    ) {
        const payloads: any[] = [];

        for (const task of rolledOver) {
            if (!task.assignedToId) continue;
            payloads.push({
                userId: task.assignedToId,
                taskId: task.id,
                type: 'TASK_ROLLED_OVER',
                title: 'Your task moved to the next quarter',
                message: nextQuarter
                    ? `"${task.title}" carried over from ${quarter.name} ${quarter.year} into ${nextQuarter.name} ${nextQuarter.year}.`
                    : `"${task.title}" carried over from ${quarter.name} ${quarter.year} and is not in a quarter yet.`,
                actionUrl: `/tasks/${task.id}`,
            });
        }

        for (const task of released) {
            if (!task.assignedToId) continue;
            payloads.push({
                userId: task.assignedToId,
                taskId: task.id,
                type: 'TASK_RELEASED_FROM_QUARTER',
                title: 'Your task is no longer in a quarter',
                message: `${quarter.name} ${quarter.year} closed and "${task.title}" was not carried over. It is still assigned to you and is now unscheduled.`,
                actionUrl: `/tasks/${task.id}`,
            });
        }

        if (payloads.length > 0) {
            await this.notifications.createBulkNotifications(payloads);
        }
    }

    /** Objectives in a closed quarter are completed if they landed, otherwise off track. */
    private async settleObjectivesForClosedQuarter(quarterId: string) {
        const objectives = await this.prisma.objective.findMany({
            where: { quarterId, status: { notIn: ['CANCELLED', 'COMPLETED'] } },
            select: { id: true, keyResults: { select: { startValue: true, targetValue: true, currentValue: true } } },
        });

        for (const obj of objectives) {
            const met = didObjectiveLand(obj.keyResults);

            await this.prisma.objective.update({
                where: { id: obj.id },
                data: { status: met ? 'COMPLETED' : 'OFF_TRACK' },
            });
        }
    }

    /** The people who can actually start a quarter. */
    private async notifyCompanyAdmins(companyId: string, type: string, title: string, message: string) {
        const admins = await this.prisma.user.findMany({
            where: { companyId, status: 'ACTIVE', role: { in: ['COMPANY_ADMIN', 'ADMIN'] } },
            select: { id: true },
        });
        if (admins.length === 0) return;
        await this.notifications.createBulkNotifications(
            admins.map((a) => ({ userId: a.id, type, title, message, actionUrl: '/quarters' })),
        );
    }

}
