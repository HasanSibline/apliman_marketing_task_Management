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

/**
 * Kept as one flat shape rather than a discriminated union: it is serialised
 * straight to the client, and a stable set of fields is easier to read there than
 * a union whose members appear and vanish.
 */
export interface QuarterReadiness {
  ready: boolean;
  reason: 'no-objectives' | 'objectives-without-key-results' | null;
  /** Objectives that cannot be measured yet, named so the UI can say which. */
  titles: string[];
}

/**
 * Whether a quarter is set up well enough for the company to see it.
 *
 * A quarter starts the moment the previous one closes, so that the calendar never
 * stalls waiting for a click. That leaves a window where it is running but nobody
 * has written the objectives yet, and an empty cycle shown to the whole company
 * reads as "there is no plan" rather than "the plan is being written". So the
 * quarter is hidden from everyone but its planners until it holds something worth
 * seeing, and this decides when that is.
 *
 * An objective with no key result is the case worth catching: it can never move off
 * zero, because progress is only ever evidence from key results. Left in, it drags
 * the quarter's average down all cycle and the year's verdict with it.
 */
export function quarterReadiness(
  objectives: { title: string; keyResults: unknown[] }[],
): QuarterReadiness {
  if (objectives.length === 0) return { ready: false, reason: 'no-objectives', titles: [] };

  const unmeasurable = objectives.filter((o) => o.keyResults.length === 0).map((o) => o.title);
  if (unmeasurable.length > 0) {
    return { ready: false, reason: 'objectives-without-key-results', titles: unmeasurable };
  }

  return { ready: true, reason: null, titles: [] };
}

export interface QuarterEnding {
  /** `open` while it runs; otherwise how its real ending compared to the plan. */
  state: 'open' | 'early' | 'on-time' | 'late';
  /** Whole days between the planned end and the real one. Always positive. */
  days: number;
}

/**
 * How a quarter's real ending compared to the one on the calendar.
 *
 * Dates here are a plan, not a rule. A team that finishes what it set out to do in
 * ten weeks should close and move on, and the record should say so rather than let
 * the cycle look as though it ran its full span. The same in reverse for one that
 * overran.
 *
 * A quarter closed before this was recorded has no honest answer, so it reports
 * on-time rather than inventing one: absence of evidence is not evidence of delay.
 */
export function quarterEnding(quarter: {
  status: string;
  endDate: Date;
  closedAt?: Date | null;
}): QuarterEnding {
  if (quarter.status !== 'CLOSED') return { state: 'open', days: 0 };
  if (!quarter.closedAt) return { state: 'on-time', days: 0 };

  const diffMs = quarter.closedAt.getTime() - quarter.endDate.getTime();
  const days = Math.floor(Math.abs(diffMs) / 86_400_000);

  // Under a day either way is the same day's work, not early or late.
  if (days < 1) return { state: 'on-time', days: 0 };
  return { state: diffMs < 0 ? 'early' : 'late', days };
}

export interface QuarterSlot {
  name: string;
  year: number;
  startDate: Date;
  endDate: Date;
}

/**
 * Where the quarter after this one sits.
 *
 * Two rules, and both matter for a reason found the hard way.
 *
 * The name follows the sequence, Q1 to Q2 to Q3 to Q4 and round to Q1 of the next
 * year. Deriving it from the calendar month instead looks identical for a company on
 * calendar quarters and absurd for anyone else: a Q1 someone dated across two days in
 * August produced a "Q3" running from the first of July, a successor beginning five
 * weeks before the quarter it succeeds.
 *
 * The dates continue from where the last quarter ended, running three months from the
 * day after. For calendar-aligned quarters this lands exactly on the calendar: Q1
 * ending 31 March gives 1 April to 30 June. For anyone else it stays continuous and
 * never overlaps, which matters more than matching a calendar the company is not on.
 */
export function nextQuarterSlot(prev: { name: string; year: number; endDate: Date }): QuarterSlot {
  const startDate = new Date(prev.endDate.getTime() + 86_400_000);
  startDate.setUTCHours(0, 0, 0, 0);

  return {
    ...quarterNameAfter(prev.name, prev.year, startDate),
    startDate,
    endDate: threeMonthsOn(startDate),
  };
}

/**
 * The slot after a given one, for when the name it wants is already taken by a
 * quarter that is over. Used to step past history rather than reopen it.
 */
export function advanceQuarterSlot(slot: QuarterSlot): QuarterSlot {
  const startDate = new Date(
    Date.UTC(slot.startDate.getUTCFullYear(), slot.startDate.getUTCMonth() + 3, slot.startDate.getUTCDate()),
  );

  return {
    ...quarterNameAfter(slot.name, slot.year, startDate),
    startDate,
    endDate: threeMonthsOn(startDate),
  };
}

/** Three months from a start, ending the day before, at the last second. */
function threeMonthsOn(start: Date): Date {
  const end = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, start.getUTCDate(), 23, 59, 59),
  );
  end.setUTCDate(end.getUTCDate() - 1);
  return end;
}

/**
 * The name and year following a quarter called `prevName` in `prevYear`.
 *
 * The year counts on from the quarter before it, and only rolls when the sequence
 * wraps past Q4. Taking it from the derived start date instead looked equivalent and
 * was not: a quarter's `year` is what the app groups by and what its unique key is
 * built from, and nothing forces that to agree with the dates someone typed. Given a
 * quarter labelled 2028 but dated in 2026, the calendar reading moved the company to
 * 2027, which is neither the year it was in nor the year it was going to.
 *
 * A name outside the Q1..Q4 convention carries no sequence to continue, so there the
 * calendar decides: it is the only other thing that could.
 */
function quarterNameAfter(
  prevName: string,
  prevYear: number,
  startDate: Date,
): { name: string; year: number } {
  const match = /^Q([1-4])$/.exec(prevName.trim());
  if (!match) {
    const index = Math.floor(startDate.getUTCMonth() / 3);
    return { name: `Q${index + 1}`, year: startDate.getUTCFullYear() };
  }

  const n = Number(match[1]);
  return n === 4 ? { name: 'Q1', year: prevYear + 1 } : { name: `Q${n + 1}`, year: prevYear };
}

export type YearVerdict = 'achieved' | 'partial' | 'missed' | 'no-goals';

/**
 * How a year is reported.
 *
 * A company with no objectives has not missed anything; it never set a target, and
 * reporting that as a failure would be wrong. Above that the split is by the share
 * of objectives that landed.
 */
export function yearVerdict(objectivesTotal: number, objectivesLanded: number): YearVerdict {
  if (objectivesTotal === 0) return 'no-goals';
  const rate = (objectivesLanded / objectivesTotal) * 100;
  if (rate >= 80) return 'achieved';
  if (rate >= 50) return 'partial';
  return 'missed';
}
