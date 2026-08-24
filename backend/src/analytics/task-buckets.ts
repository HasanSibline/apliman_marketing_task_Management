/**
 * The three numbers under the dashboard total, as one rule.
 *
 * Completed, In progress and Pending are drawn as a stacked bar and as slices of a
 * pie, so the only shape they can honestly take is a partition: every task in exactly
 * one bucket, the three adding up to the total shown beside them. They were not one.
 * Three separate queries each asked a different question, and the answers overlapped
 * in one place and left a hole in another:
 *
 *  - Completed matched a phase NAMED "Completed", "Published" or "Done" OR flagged
 *    `isEndPhase`. In progress matched `isStartPhase: false AND isEndPhase: false`. A
 *    phase called "Done" sitting in the middle of a workflow satisfied both, so its
 *    tasks were counted twice and the bar was taller than the total.
 *  - Nothing matched a task with no phase at all. `Task.currentPhaseId` is nullable,
 *    so those tasks were counted in the total and in none of the three, and the bar
 *    was shorter than the total.
 *
 * The name matching is gone. It was guessing at something the schema already records:
 * `workflows.service.ts` sets `isStartPhase` on the first phase and `isEndPhase` on
 * the last every time a workflow is created or its phases are reordered, so the flags
 * are always right and the names never had to be consulted. As a guess it also failed
 * in both directions: it is a case-sensitive substring test, so it missed a tenant who
 * writes "done" or names their phases in another language, and it fired on any
 * mid-workflow phase whose name happens to contain the word, such as "Design Done" or
 * "Copy Completed". Reading a tenant's free text to infer what they already declared
 * with a flag cannot be made correct, so it is not kept in any form.
 *
 * PRECEDENCE, most specific first:
 *
 *  1. Finished wins over everything. A workflow with a single phase has that phase
 *     flagged both start and end, and the rest of the app (`taskStage`) reads an end
 *     phase as finished, so end has to beat start here or the same task would read
 *     Completed in the activity list and Pending in the chart above it.
 *  2. Then in progress, then pending. Pending is the fallback, which is why a task
 *     with no phase lands there: it has not entered a workflow, so nobody has started
 *     it. That is also what `taskStage` says about it. It is a deliberate choice, not
 *     a leftover, and it means such a task is now visible in a bucket instead of
 *     silently missing from all three.
 *
 * WHAT COUNTS AS FINISHED is `completedAt`, the `phase` enum, or an end phase, which
 * is exactly what `taskStage` reads. Phase flags alone are not enough: the stage
 * control (`tasks.service.setStage`) marks a task complete by writing `completedAt`
 * and `phase: 'COMPLETED'` and deliberately does NOT move `currentPhaseId`, so a task
 * a user just ticked complete stays parked in a middle phase. Counting on the phase
 * flag alone would have shown it as In progress while the recent-activity table
 * directly below called it Completed.
 *
 * WHAT COUNTS AS STARTED is the other way round, because the `phase` enum is not
 * maintained when a task moves across a workflow. `tasks.service.moveTaskToPhase`
 * writes `currentPhaseId` and `completedAt` and leaves `phase` at whatever it was, so
 * a task three phases into its workflow usually still reads `phase: 'TODO'`. Position
 * in the workflow therefore has to count as progress in its own right, and the enum
 * is only consulted for a task that has not moved off its start phase or has no phase.
 *
 * Pure, with the phase lists and the task passed in, because the whole defect was in
 * the arithmetic of which set a row belongs to and that is only honestly testable
 * without a database.
 */

/** The buckets, in the order the dashboard stacks them. */
export type TaskBucket = 'completed' | 'inProgress' | 'pending';

export const TASK_BUCKETS: TaskBucket[] = ['completed', 'inProgress', 'pending'];

/**
 * `Task.phase` values that mean the work is over.
 *
 * The same two `taskStage` treats as COMPLETED. ARCHIVED is included because an
 * archived task is finished work, not work waiting to start.
 */
export const COMPLETED_PHASE_VALUES = ['COMPLETED', 'ARCHIVED'];

/** The `Task.phase` value written when someone marks a task started. */
export const IN_PROGRESS_PHASE_VALUE = 'IN_PROGRESS';

/** What the partition needs to know about a workflow phase. */
export interface BucketPhase {
  id: string;
  isStartPhase?: boolean | null;
  isEndPhase?: boolean | null;
}

/**
 * Every phase id in the scope, split three ways.
 *
 * Disjoint and exhaustive by construction, which is the property the counts rely on:
 * a task points at exactly one phase, so it can be in at most one list.
 */
export interface PhasePartition {
  /** Terminal phases. A task here is finished. */
  end: string[];
  /** Neither first nor last. A task here has started and has not finished. */
  middle: string[];
  /** First phase of a workflow, and not also its last. */
  start: string[];
}

export function partitionPhaseIds(phases: BucketPhase[]): PhasePartition {
  const partition: PhasePartition = { end: [], middle: [], start: [] };

  for (const phase of phases) {
    // Same precedence as taskBucket below, and it matters for a one-phase workflow
    // where both flags are set on the same row.
    if (phase.isEndPhase) partition.end.push(phase.id);
    else if (phase.isStartPhase) partition.start.push(phase.id);
    else partition.middle.push(phase.id);
  }

  return partition;
}

/** The fields the rule reads off a task already in memory. */
export interface BucketTask {
  completedAt?: Date | string | null;
  phase?: string | null;
  currentPhase?: { isStartPhase?: boolean | null; isEndPhase?: boolean | null } | null;
}

/**
 * Which bucket one task belongs to.
 *
 * The in-memory twin of `bucketWhere` below. Both express the precedence documented
 * at the top of this file, and the spec checks that they agree on every shape of task
 * so the two cannot drift apart the way the three original queries did.
 */
export function taskBucket(task: BucketTask): TaskBucket {
  if (task.completedAt) return 'completed';
  if (task.phase && COMPLETED_PHASE_VALUES.includes(task.phase)) return 'completed';
  if (task.currentPhase?.isEndPhase) return 'completed';

  // Past the first phase of its workflow, so work has begun whatever the enum says.
  if (task.currentPhase && !task.currentPhase.isStartPhase) return 'inProgress';

  // Still at the start phase, or in no workflow at all: only an explicit enum says
  // anyone has picked it up.
  if (task.phase === IN_PROGRESS_PHASE_VALUE) return 'inProgress';

  return 'pending';
}

/** A Prisma `Task` where-clause fragment. */
type TaskWhere = Record<string, any>;

/** Finished, by any of the three signals. */
function completedWhere(partition: PhasePartition): TaskWhere {
  return {
    OR: [
      { completedAt: { not: null } },
      { phase: { in: COMPLETED_PHASE_VALUES } },
      { currentPhaseId: { in: partition.end } },
    ],
  };
}

/**
 * Not finished, stated positively.
 *
 * "Not sitting in an end phase" is spelled out as "sitting in a start or middle phase,
 * or in no phase" rather than as `currentPhaseId: { notIn: end }`. Prisma's negating
 * filters drop rows where the column is NULL, so `notIn` on a nullable column would
 * throw away every phaseless task, which is the exact hole this module exists to
 * close. `phase` is a non-nullable enum with a default, so negating that one is safe.
 */
export function notCompletedWhere(partition: PhasePartition): TaskWhere {
  return {
    completedAt: null,
    phase: { notIn: COMPLETED_PHASE_VALUES },
    OR: [
      { currentPhaseId: { in: [...partition.start, ...partition.middle] } },
      { currentPhaseId: null },
    ],
  };
}

/** Started, by workflow position or by the enum. */
function startedWhere(partition: PhasePartition): TaskWhere {
  return {
    OR: [
      { currentPhaseId: { in: partition.middle } },
      { phase: IN_PROGRESS_PHASE_VALUE },
    ],
  };
}

/**
 * The where-clause fragment that selects one bucket.
 *
 * Nest it under `AND` in the caller's clause rather than spreading it, because these
 * fragments use top-level `OR` and would collide with a caller that has one too.
 */
export function bucketWhere(bucket: TaskBucket, partition: PhasePartition): TaskWhere {
  switch (bucket) {
    case 'completed':
      return completedWhere(partition);
    case 'inProgress':
      return { AND: [notCompletedWhere(partition), startedWhere(partition)] };
    default:
      return {
        AND: [
          notCompletedWhere(partition),
          // The complement of startedWhere within "not completed": at the start phase
          // or at no phase, and not explicitly marked started.
          {
            OR: [
              { currentPhaseId: { in: partition.start } },
              { currentPhaseId: null },
            ],
          },
          { phase: { not: IN_PROGRESS_PHASE_VALUE } },
        ],
      };
  }
}

export interface BucketCounts {
  completed: number;
  inProgress: number;
  pending: number;
}

export interface ReconciledCounts extends BucketCounts {
  /**
   * Tasks the total counted that no bucket claimed, positive, or tasks claimed more
   * than once, negative. Zero whenever the partition holds, which is the point. It is
   * returned rather than swallowed so the caller can log a real drift instead of
   * quietly rendering a chart that does not add up.
   */
  unaccounted: number;
}

function nonNegative(n: number): number {
  return n > 0 ? n : 0;
}

/**
 * The three counts, made to add up to the total displayed next to them.
 *
 * Two separate places used to derive Pending as `total - completed - inProgress`, one
 * clamped at zero and one not, so the same expression rendered a negative count in the
 * stats block and a hidden slice in the chart beside it. There is one clamp now and
 * one place that decides.
 *
 * Any remainder is given to Pending because Pending is the fallback bucket: an
 * unclaimed task is one nothing has been able to say anything about, and "not started"
 * is the least the app can claim about it. With a real partition the remainder is
 * always zero and this changes nothing.
 */
export function reconcileBuckets(total: number, counts: BucketCounts): ReconciledCounts {
  const completed = nonNegative(counts.completed);
  const inProgress = nonNegative(counts.inProgress);
  const pending = nonNegative(counts.pending);
  const unaccounted = total - completed - inProgress - pending;

  return {
    completed,
    inProgress,
    pending: nonNegative(pending + unaccounted),
    unaccounted,
  };
}

/**
 * Percentage of `total` that `part` represents, rounded, never above 100 or below 0.
 *
 * A rate is rendered straight into a progress bar and into copy like "you have
 * completed N of M", so a value outside 0..100 draws a bar past its own track.
 */
export function completionRate(part: number, total: number): number {
  if (total <= 0) return 0;
  const pct = Math.round((part / total) * 100);
  return Math.min(100, nonNegative(pct));
}

/**
 * Mean completion rate across people, ignoring anyone with nothing assigned.
 *
 * Someone holding no tasks has no completion rate. Scoring them 0% and averaging them
 * in asserted they had failed at work they were never given, so hiring a person, or
 * having one admin account that never gets assigned anything, dragged the team's
 * headline number down. A team where nobody has any work has no rate at all, and 0 is
 * the only number available to say so.
 */
export function averageCompletionRate(members: { assignedTasks: number; completionRate: number }[]): number {
  const withWork = members.filter((m) => m.assignedTasks > 0);
  if (withWork.length === 0) return 0;
  return Math.round(withWork.reduce((sum, m) => sum + m.completionRate, 0) / withWork.length);
}
