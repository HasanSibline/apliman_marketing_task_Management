/**
 * The OKR calculations, as pure functions.
 *
 * These were previously inline inside services that also do database work, which
 * meant the arithmetic could not be tested without a database and the same formula
 * drifted into three near-copies. Everything here takes plain values and returns
 * plain values, so the rules that decide whether a company hit its goals can be
 * verified exhaustively.
 *
 * The services own the I/O; this file owns the meaning.
 */

/** Minimal shape of a task for progress purposes. */
export interface TaskProgressInput {
  /** True when the task has reached a terminal phase or carries a completion date. */
  isComplete: boolean;
  /** Completion flags of its subtasks, empty when it has none. */
  subtasks: { isCompleted: boolean }[];
}

export interface KeyResultRange {
  startValue: number;
  targetValue: number;
  currentValue: number;
}

/**
 * How much one task contributes, between 0 and 1.
 *
 * Completion is checked first on purpose. Checking subtasks first meant a finished
 * task with one stray unticked subtask contributed a fraction, which capped its key
 * result below target permanently.
 */
export function taskFraction(task: TaskProgressInput): number {
  if (task.isComplete) return 1;
  if (task.subtasks.length > 0) {
    const done = task.subtasks.filter((s) => s.isCompleted).length;
    return done / task.subtasks.length;
  }
  return 0;
}

/**
 * The value a key result should hold, given the work linked to it.
 *
 * With no linked tasks the key result sits at its starting value: progress is
 * evidence from work, and with no work there is no evidence. It must not keep a
 * number left behind by tasks since removed.
 */
export function keyResultValue(kr: KeyResultRange, tasks: TaskProgressInput[]): number {
  if (tasks.length === 0) return kr.startValue;
  const mean = tasks.reduce((sum, t) => sum + taskFraction(t), 0) / tasks.length;
  return kr.startValue + (kr.targetValue - kr.startValue) * mean;
}

/**
 * How far a key result has come, from 0 to 1.
 *
 * A zero-width range (start equal to target) cannot be expressed as a ratio, so it
 * is treated as met once the current value reaches the target.
 */
export function keyResultProgress(kr: KeyResultRange): number {
  const range = kr.targetValue - kr.startValue;
  if (range === 0) return kr.currentValue >= kr.targetValue ? 1 : 0;
  return clamp01((kr.currentValue - kr.startValue) / range);
}

/** An objective's progress is the mean of its key results. No key results means none. */
export function objectiveProgress(keyResults: KeyResultRange[]): number {
  if (keyResults.length === 0) return 0;
  return keyResults.reduce((sum, kr) => sum + keyResultProgress(kr), 0) / keyResults.length;
}

/** A key result counts as met at 99.9%, which absorbs floating point drift. */
export function isKeyResultMet(kr: KeyResultRange): boolean {
  return keyResultProgress(kr) >= 0.999;
}

/** An objective landed only if every key result did, and it has at least one. */
export function didObjectiveLand(keyResults: KeyResultRange[]): boolean {
  return keyResults.length > 0 && keyResults.every(isKeyResultMet);
}

export type DerivedObjectiveStatus = 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK' | 'COMPLETED';

/**
 * Judge an objective against the clock.
 *
 * Raw progress says nothing on its own: 40% is healthy in week two and alarming in
 * the final week. Pace is progress divided by the fraction of the quarter elapsed,
 * so 1.0 is exactly on schedule.
 *
 * @param progress 0 to 1
 * @param elapsed  0 to 1, how much of the quarter has passed
 * @param quarterClosed the quarter is over, so there is no time left to recover
 */
export function deriveObjectiveStatus(
  progress: number,
  elapsed: number,
  quarterClosed = false,
): DerivedObjectiveStatus {
  if (progress >= 0.999) return 'COMPLETED';
  if (quarterClosed) return 'OFF_TRACK';

  // Nothing is behind in the opening days, and dividing by a near-zero elapsed
  // fraction would report every objective as off track on day one.
  if (elapsed <= 0.1) return 'ON_TRACK';

  const pace = progress / elapsed;
  if (pace >= 0.8) return 'ON_TRACK';
  if (pace >= 0.5) return 'AT_RISK';
  return 'OFF_TRACK';
}

/** Fraction of a quarter that has elapsed, clamped to 0..1. */
export function elapsedFraction(start: Date, end: Date, now: Date): number {
  const span = Math.max(end.getTime() - start.getTime(), 1);
  return clamp01((now.getTime() - start.getTime()) / span);
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(Math.max(n, 0), 1);
}
