import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuarterDto } from './dto/create-quarter.dto';
import { CloseQuarterDto } from './dto/close-quarter.dto';
import { NotificationsService } from '../notifications/notifications.service';
import {
    didObjectiveLand,
    objectivePercent,
    quarterReadiness,
    QuarterReadiness,
    quarterEnding,
    QuarterEnding,
    nextQuarterSlot,
    advanceQuarterSlot,
} from '../okr/okr-math';
import { realTasksOnly, EXCLUDE_SUBTASKS } from '../tasks/task-filters';
import { taskStage, phasesForStage } from '../tasks/task-stage';

/** Who plans cycles, as opposed to working inside the current one. */
const PLANNER_ROLES = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'ADMIN'];

@Injectable()
export class QuartersService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly notifications: NotificationsService,
    ) { }

    /**
     * Planners see every cycle: past ones to report on, future ones to write.
     * Everyone else sees the one they are working in, and only once it is ready.
     */
    private isPlanner(userRole?: string): boolean {
        return PLANNER_ROLES.includes(userRole ?? '');
    }

    /** Enough of a quarter's objectives to judge whether it is fit to be seen. */
    private readonly readinessInclude = {
        objectives: { select: { title: true, keyResults: { select: { id: true } } } },
    };

    private withReadiness<
        T extends {
            objectives: { title: string; keyResults: unknown[] }[];
            status: string;
            endDate: Date;
            closedAt?: Date | null;
        },
    >(quarter: T): Omit<T, 'objectives'> & { readiness: QuarterReadiness; ending: QuarterEnding } {
        const { objectives, ...rest } = quarter;
        return {
            ...rest,
            readiness: quarterReadiness(objectives),
            ending: quarterEnding(quarter),
        };
    }

    /**
     * @param selectable when true, returns only quarters you can still schedule work
     *   into: the active one and anything upcoming. Closed quarters are history, and
     *   offering them in a picker invites filing new work into a finished cycle.
     *
     * A quarter starts as soon as the one before it closes, which means it can be
     * running before anyone has written its objectives. Only planners see it in that
     * state; to everyone else the cycle begins when there is a plan to show. This is
     * the single place that decides, so a quarter cannot be hidden from a list and
     * still turn up in a dropdown.
     */
    async findAll(companyId: string, userRole?: string, selectable = false) {
        const planner = this.isPlanner(userRole);

        // Reading the plan is where a missing successor gets noticed and fixed. Only
        // a planner's read repairs, so the work happens for the person who would act
        // on it rather than on an employee's dashboard load.
        if (planner) await this.openSuccessorIfNoneIsWaiting(companyId);

        const where: any = { companyId };

        if (!planner) {
            where.status = 'ACTIVE';
        } else if (selectable) {
            where.status = { in: ['ACTIVE', 'UPCOMING'] };
        }

        const quarters = await this.prisma.quarter.findMany({
            where,
            include: this.readinessInclude,
            // Selectable lists read forwards, since the next quarter is what you want
            // near the top. History reads backwards, newest first.
            orderBy: selectable
                ? [{ year: 'asc' }, { startDate: 'asc' }]
                : [{ year: 'desc' }, { name: 'desc' }],
        });

        return quarters
            .map((q) => this.withReadiness(q))
            .filter((q) => planner || q.readiness.ready);
    }

    async findActive(companyId: string, userRole?: string) {
        const quarter = await this.prisma.quarter.findFirst({
            where: { companyId, status: 'ACTIVE' },
            include: {
                _count: {
                    select: { tasks: { where: EXCLUDE_SUBTASKS } }
                },
                objectives: {
                    include: {
                        keyResults: true
                    }
                }
            }
        });

        if (!quarter) return null;

        // A cycle that has started but has nothing planned in it is not shown to the
        // people working in it. The dashboard has to agree with Strategy, or the
        // quarter is hidden in one place and announced in the other.
        if (!this.isPlanner(userRole) && !quarterReadiness(quarter.objectives).ready) return null;

        // The same three things taskStage reads, expressed as a query. Counting only
        // completedAt here made the dashboard disagree with the cycle page about the
        // same quarter, because a task finished by reaching a workflow end phase does
        // not always carry a date.
        const completedTasksCount = await this.prisma.task.count({
            where: realTasksOnly({
                quarterId: quarter.id,
                companyId,
                OR: [
                    { completedAt: { not: null } },
                    { phase: { in: phasesForStage('COMPLETED') as any } },
                    { currentPhase: { isEndPhase: true } },
                ],
            })
        });

        // Calculate progress
        const objectives = quarter.objectives.map(obj => ({ ...obj, progress: objectivePercent(obj.keyResults) }));

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
                    where: EXCLUDE_SUBTASKS,
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

        // The same rule the lists use. Fetching a quarter by id must not be a way
        // around a gate that only the list applies.
        if (!this.isPlanner(userRole)) {
            if (quarter.status !== 'ACTIVE') {
                throw new NotFoundException('Only the current cycle is available.');
            }
            if (!quarterReadiness(quarter.objectives).ready) {
                throw new NotFoundException('This cycle is still being planned.');
            }
        }

        // Calculate stats for frontend accuracy
        const totalTasks = quarter.tasks.length;
        // taskStage, not a fourth hand-written reading of "finished". This one had
        // already lost ARCHIVED, so a cycle whose work had been archived reported
        // fewer completed tasks here than on the analytics page for the same cycle.
        const completedTasks = quarter.tasks.filter(t => taskStage(t as any) === 'COMPLETED').length;
        const objectivesCount = quarter.objectives.length;

        // Calculate progress for each objective
        const objectivesWithProgress = quarter.objectives.map(obj => ({ ...obj, progress: objectivePercent(obj.keyResults) }));

        return {
            ...quarter,
            totalTasks,
            completedTasks,
            objectivesCount,
            objectives: objectivesWithProgress
        };
    }

    /**
     * Starting a cycle while another runs used to close the other one with an
     * updateMany, which skipped the carry-over decision and released every unfinished
     * task in silence. A quarter now only ever closes through close(), where someone
     * says what happens to that work.
     */
    private async refuseIfAnotherIsRunning(companyId: string, exceptId?: string) {
        const running = await this.prisma.quarter.findFirst({
            where: { companyId, status: 'ACTIVE', ...(exceptId ? { id: { not: exceptId } } : {}) },
            select: { name: true, year: true },
        });
        if (running) {
            throw new BadRequestException(
                `${running.name} ${running.year} is still running. Close it first, so you can decide what happens to its unfinished tasks.`,
            );
        }
    }

    async create(dto: CreateQuarterDto, companyId: string) {
        if (dto.status === 'ACTIVE') {
            await this.refuseIfAnotherIsRunning(companyId);
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

        if (dto.status === 'ACTIVE') {
            await this.refuseIfAnotherIsRunning(companyId, id);
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

        // Closing is the real end of a cycle, whatever the calendar said. Recording
        // it is what lets the record show a quarter finished early rather than
        // pretending it ran its planned span.
        const closedAt = new Date();
        await this.prisma.quarter.update({
            where: { id },
            data: { status: 'CLOSED', closedAt },
        });

        // Work out where the company goes next before touching any task, so carried
        // work can land in the successor even when that successor did not exist a
        // moment ago.
        const successor = await this.resolveSuccessor(companyId, { ...quarter, closedAt });

        const rolloverIds = dto.rolloverTaskIds ?? [];

        // Where carried work lands. An explicit "leave them unscheduled" is honoured
        // as the deliberate choice it is; otherwise a chosen quarter wins, and failing
        // that the successor, so the default is that work follows the company forward
        // rather than falling out of every cycle.
        const rolloverTargetId = dto.leaveUnscheduled
            ? null
            : dto.nextQuarterId ?? successor?.id ?? null;

        // Capture who is affected BEFORE the updates, while the links still exist.
        // Closing a quarter used to move and orphan people's work in silence: the
        // assignee found out by noticing their task had left the quarter.
        // Deliberately unfiltered. These reads decide what the updates below touch, so
        // they have to reach every row pointing at this quarter, subtask mirror rows
        // included. One left behind would keep pointing at a closed cycle.
        const [rollingOver, beingReleased, rolloverTarget] = await Promise.all([
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
            rolloverTargetId
                ? this.prisma.quarter.findUnique({
                      where: { id: rolloverTargetId },
                      select: { name: true, year: true },
                  })
                : Promise.resolve(null),
        ]);

        // Roll over selected tasks
        if (rolloverIds.length > 0) {
            await this.prisma.task.updateMany({
                where: { id: { in: rolloverIds }, companyId },
                data: {
                    quarterId: rolloverTargetId,
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

        // A quarter the planners had already prepared takes over immediately, so the
        // calendar never stalls between cycles. One the app had to invent does not:
        // nobody has agreed to its dates or written a single objective, so it waits
        // for Start cycle. Either way the team sees nothing until there is a plan.
        let started = false;
        if (successor && !successor.wasCreated) {
            // The quarter just closed cannot be running, so anything still ACTIVE is
            // an inconsistency. Starting a second one on top would compound it.
            const stillRunning = await this.prisma.quarter.findFirst({
                where: { companyId, status: 'ACTIVE' },
                select: { id: true },
            });
            if (!stillRunning) {
                await this.prisma.quarter.update({
                    where: { id: successor.id },
                    data: { status: 'ACTIVE' },
                });
                started = true;
            }
        }

        await this.notifyAffectedAssignees(rollingOver, beingReleased, quarter, rolloverTarget);

        if (successor) {
            const readiness = await this.readinessOf(successor.id);
            await this.notifyCompanyAdmins(
                companyId,
                started ? 'QUARTER_STARTED' : 'QUARTER_READY_TO_START',
                started
                    ? `${successor.name} ${successor.year} has started`
                    : `${successor.name} ${successor.year} is ready to start`,
                started
                    ? readiness.ready
                        ? `${quarter.name} ${quarter.year} is closed and the new cycle is live.`
                        : `${quarter.name} ${quarter.year} is closed. The new cycle is running but stays hidden from the team until every objective has a key result.`
                    : `${quarter.name} ${quarter.year} is closed and ${successor.name} ${successor.year} was created for you. Open Strategy, plan it, and press Start cycle.`,
            );
        }

        return {
            success: true,
            message: started
                ? `Quarter closed. ${successor!.name} ${successor!.year} has started.`
                : successor
                  ? `Quarter closed. ${successor.name} ${successor.year} was created and is waiting for you to start it.`
                  : 'Quarter closed.',
            rolledOver: rollingOver.length,
            released: beingReleased.length,
            nextQuarter: successor
                ? {
                      id: successor.id,
                      name: successor.name,
                      year: successor.year,
                      started,
                      wasCreated: successor.wasCreated,
                  }
                : null,
        };
    }

    /**
     * A company that has quarters should always have one to work in.
     *
     * Closing creates the successor, but only for quarters closed once that existed.
     * Anything closed before it stays stuck forever, and no amount of correct code
     * going forward repairs a company that is already in that state. Production
     * applies schema with `db push`, so migration SQL never runs there and a data
     * repair has to live in code that heals on read. This is that repair.
     *
     * Deliberately does nothing for a company with no quarters at all: never having
     * planned a cycle is a choice, and inventing one would be the app deciding the
     * company wants a feature. That case gets an empty state and a button instead.
     */
    private async openSuccessorIfNoneIsWaiting(companyId: string): Promise<void> {
        try {
            const [open, last] = await Promise.all([
                this.prisma.quarter.findFirst({
                    where: { companyId, status: { in: ['ACTIVE', 'UPCOMING'] } },
                    select: { id: true },
                }),
                this.prisma.quarter.findFirst({
                    where: { companyId },
                    // By year first, because that is how the app groups quarters and
                    // nothing forces a quarter's dates to agree with its year.
                    orderBy: [{ year: 'desc' }, { endDate: 'desc' }],
                    select: {
                        id: true, name: true, year: true,
                        startDate: true, endDate: true, closedAt: true,
                    },
                }),
            ]);

            if (open || !last) return;

            await this.resolveSuccessor(companyId, last);
        } catch {
            // Two planners loading Strategy at once both try to create the same
            // quarter, and the unique index on name and year rejects the loser. That
            // is the constraint doing its job, not a failure worth surfacing: reading
            // the plan must never fail because a repair alongside it did.
        }
    }

    /**
     * Remove a quarter that was never used.
     *
     * Only one that is still upcoming and holds nothing: no objectives, no tasks. A
     * cycle that ran is a record of what the company did and deleting it would erase
     * that, while one with work in it would take the work down with it. What this is
     * for is a quarter created in error, which the app itself has been capable of
     * producing, so the way back cannot depend on someone reaching the database.
     */
    async remove(id: string, companyId: string) {
        const quarter = await this.prisma.quarter.findFirst({
            where: { id, companyId },
            select: {
                id: true, name: true, year: true, status: true,
                // Counted raw, subtask mirror rows included, unlike every reporting
                // count in this file. The question here is whether deleting would
                // break a foreign key, and a mirror row breaks it exactly as hard as
                // a real task. Excluding them would let the delete through and fail.
                _count: { select: { objectives: true, tasks: true } },
            },
        });
        if (!quarter) throw new NotFoundException('Quarter not found');

        if (quarter.status !== 'UPCOMING') {
            throw new BadRequestException(
                `${quarter.name} ${quarter.year} has already been used, so its record is kept. Only a quarter that never started can be removed.`,
            );
        }

        const { objectives, tasks } = quarter._count;
        if (objectives > 0 || tasks > 0) {
            const holds = [
                objectives > 0 ? `${objectives} objective${objectives === 1 ? '' : 's'}` : null,
                tasks > 0 ? `${tasks} task${tasks === 1 ? '' : 's'}` : null,
            ].filter(Boolean).join(' and ');
            throw new BadRequestException(
                `${quarter.name} ${quarter.year} holds ${holds}. Move or delete them first, so nothing goes with it unnoticed.`,
            );
        }

        await this.prisma.quarter.delete({ where: { id } });
        return { success: true, message: `${quarter.name} ${quarter.year} removed.` };
    }

    /**
     * Open the next quarter on demand.
     *
     * Closing normally creates the successor itself, so this is the way out of the
     * states where that did not happen: the company's very first quarter, and any
     * quarter closed before handover existed. Without it a company whose last
     * quarter is closed has no route back to a running cycle from Strategy at all.
     *
     * Dates are derived rather than asked for. The quarter that follows the last one
     * is not a judgement call, and a form would only invite an overlap.
     */
    async createNextQuarter(companyId: string) {
        const open = await this.prisma.quarter.findFirst({
            where: { companyId, status: { in: ['ACTIVE', 'UPCOMING'] } },
            select: { name: true, year: true, status: true },
        });
        if (open) {
            throw new BadRequestException(
                open.status === 'ACTIVE'
                    ? `${open.name} ${open.year} is still running. Close it before opening another.`
                    : `${open.name} ${open.year} is already waiting to start.`,
            );
        }

        const last = await this.prisma.quarter.findFirst({
            where: { companyId },
            orderBy: [{ year: 'desc' }, { endDate: 'desc' }],
            select: {
                id: true, name: true, year: true,
                startDate: true, endDate: true, closedAt: true,
            },
        });

        if (!last) {
            // Nothing has ever existed here, so begin with the calendar quarter the
            // company is actually in rather than an arbitrary Q1.
            const now = new Date();
            const year = now.getUTCFullYear();
            const index = Math.floor(now.getUTCMonth() / 3);
            return this.prisma.quarter.create({
                data: {
                    companyId,
                    name: `Q${index + 1}`,
                    year,
                    startDate: new Date(Date.UTC(year, index * 3, 1)),
                    endDate: new Date(Date.UTC(year, index * 3 + 3, 0, 23, 59, 59)),
                    status: 'UPCOMING',
                },
            });
        }

        const created = await this.resolveSuccessor(companyId, last);
        return this.prisma.quarter.findUnique({ where: { id: created!.id } });
    }

    /**
     * The quarter that follows the one just closed.
     *
     * Prefers what the planners already laid out, taking the earliest upcoming cycle
     * that begins no earlier than the one ending. Scoping by date matters: an upcoming
     * quarter left behind in an older year would otherwise be picked as "next" and the
     * company would appear to travel backwards.
     *
     * With nothing prepared it creates the calendar quarter that follows, which rolls
     * into the next year on its own when the fourth closes.
     */
    private async resolveSuccessor(
        companyId: string,
        closed: {
            id: string;
            name: string;
            year: number;
            startDate: Date;
            endDate: Date;
            closedAt?: Date | null;
        },
    ): Promise<{ id: string; name: string; year: number; wasCreated: boolean } | null> {
        // What the planners already laid out wins. Scoped by date so a stale upcoming
        // quarter left behind in an older year is not mistaken for what comes next.
        const existing = await this.prisma.quarter.findFirst({
            where: {
                companyId,
                status: 'UPCOMING',
                id: { not: closed.id },
                // Never travel backwards into a year already behind us. Compared by
                // year rather than by date, since the two can disagree.
                year: { gte: closed.year },
            },
            orderBy: [{ year: 'asc' }, { startDate: 'asc' }],
            select: { id: true, name: true, year: true },
        });
        if (existing) return { ...existing, wasCreated: false };

        // Nothing prepared, so one is derived. It begins the day after the cycle
        // actually ended rather than the day after it was scheduled to: a quarter
        // closed six weeks early should not leave six weeks of nothing behind it.
        let slot = nextQuarterSlot({
            name: closed.name,
            year: closed.year,
            endDate: closed.closedAt ?? closed.endDate,
        });

        // A derived name can collide with a cycle already in the books. Step past it
        // rather than reopen history; the bound stops a strange dataset looping.
        for (let attempt = 0; attempt < 8; attempt++) {
            const clash = await this.prisma.quarter.findFirst({
                where: { companyId, name: slot.name, year: slot.year },
                select: { id: true, name: true, year: true, status: true },
            });

            if (!clash) {
                const created = await this.prisma.quarter.create({
                    data: {
                        companyId,
                        name: slot.name,
                        year: slot.year,
                        startDate: slot.startDate,
                        endDate: slot.endDate,
                        status: 'UPCOMING',
                    },
                    select: { id: true, name: true, year: true },
                });
                return { ...created, wasCreated: true };
            }

            if (clash.status === 'UPCOMING') {
                return { id: clash.id, name: clash.name, year: clash.year, wasCreated: false };
            }

            slot = advanceQuarterSlot(slot);
        }

        return null;
    }

    /** Readiness of one quarter, read fresh. */
    private async readinessOf(quarterId: string): Promise<QuarterReadiness> {
        const objectives = await this.prisma.objective.findMany({
            where: { quarterId },
            select: { title: true, keyResults: { select: { id: true } } },
        });
        return quarterReadiness(objectives);
    }

    async getAnalytics(id: string, companyId: string) {
        const quarter = await this.prisma.quarter.findFirst({
            where: { id, companyId },
            include: {
                tasks: {
                    where: EXCLUDE_SUBTASKS,
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

        // One bucket per task, so completed + inProgress + pending is exactly total
        // and the three can be stacked in a chart. They could not before: `pending`
        // was a strict subset of `inProgress`, and a task carrying a completion date
        // but left in the IN_PROGRESS phase was counted in two buckets at once, so
        // the parts added up to more than the whole.
        //
        // taskStage decides which bucket, rather than a fresh set of conditions here.
        // Completion wins over the phase column, because a task carrying a completion
        // date is finished whatever phase it was left sitting in, and because the
        // legacy approval phases describe nothing anyone still does. `pending` is its
        // To do stage: work in this cycle that nobody has started.
        const stages = tasks.map((t: any) => taskStage(t));
        const completed = stages.filter((s) => s === 'COMPLETED').length;
        const inProgress = stages.filter((s) => s === 'IN_PROGRESS').length;
        const pending = stages.filter((s) => s === 'TODO').length;

        // Not part of that partition, and deliberately so: rolled over is where a task
        // came from, not what state it is in, and it is reported as a share of the
        // whole cycle. A rolled-over task is also counted in whichever stage it is in.
        const rolledOver = tasks.filter((t: any) => t.isRolledOver).length;

        const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
        const rolloverRate = total > 0 ? Math.round((rolledOver / total) * 100) : 0;

        // Objectives health
        const objectives = quarter.objectives.map(obj => ({ ...obj, progress: objectivePercent(obj.keyResults) }));

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
                tasks: { where: EXCLUDE_SUBTASKS, select: { phase: true, isRolledOver: true, completedAt: true, currentPhase: { select: { isEndPhase: true } } } },
                objectives: { include: { keyResults: true } },
            },
            orderBy: { name: 'asc' },
        });

        const data = quarters.map(q => {
            const total = q.tasks.length;
            const completed = q.tasks.filter((t: any) => taskStage(t) === 'COMPLETED').length;
            const rolledOver = q.tasks.filter((t: any) => t.isRolledOver).length;
            const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
            const rolloverRate = total > 0 ? Math.round((rolledOver / total) * 100) : 0;

            const objProgress = q.objectives.map(obj => objectivePercent(obj.keyResults));
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
            admins.map((a) => ({ userId: a.id, type, title, message, actionUrl: '/strategy' })),
        );
    }

}
