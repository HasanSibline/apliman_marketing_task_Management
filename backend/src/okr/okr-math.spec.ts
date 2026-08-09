import {
  taskFraction,
  keyResultValue,
  keyResultProgress,
  isKeyResultMet,
  didObjectiveLand,
  objectiveProgress,
  deriveObjectiveStatus,
  elapsedFraction,
} from './okr-math';

const done = { isCompleted: true };
const open = { isCompleted: false };

describe('taskFraction', () => {
  it('counts a task with no subtasks as all or nothing', () => {
    expect(taskFraction({ isComplete: true, subtasks: [] })).toBe(1);
    expect(taskFraction({ isComplete: false, subtasks: [] })).toBe(0);
  });

  it('gives partial credit from subtasks while work is in flight', () => {
    expect(taskFraction({ isComplete: false, subtasks: [done, done, done, open] })).toBe(0.75);
    expect(taskFraction({ isComplete: false, subtasks: [open, open] })).toBe(0);
  });

  // This is the regression that let a key result sit below target forever.
  it('counts a completed task in full even when a subtask was left unticked', () => {
    expect(taskFraction({ isComplete: true, subtasks: [done, open, open] })).toBe(1);
  });

  it('never returns a value outside 0..1', () => {
    for (let total = 1; total <= 8; total++) {
      for (let complete = 0; complete <= total; complete++) {
        const subtasks = [
          ...Array(complete).fill(done),
          ...Array(total - complete).fill(open),
        ];
        const f = taskFraction({ isComplete: false, subtasks });
        expect(f).toBeGreaterThanOrEqual(0);
        expect(f).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('keyResultValue', () => {
  const kr = { startValue: 0, targetValue: 100, currentValue: 0 };

  it('sits at the starting value when nothing is linked', () => {
    expect(keyResultValue(kr, [])).toBe(0);
    expect(keyResultValue({ ...kr, startValue: 20 }, [])).toBe(20);
  });

  it('reaches the target when every linked task is complete', () => {
    const tasks = [
      { isComplete: true, subtasks: [] },
      { isComplete: true, subtasks: [] },
    ];
    expect(keyResultValue(kr, tasks)).toBe(100);
  });

  it('averages across tasks rather than summing them', () => {
    const tasks = [
      { isComplete: true, subtasks: [] },
      { isComplete: false, subtasks: [] },
    ];
    expect(keyResultValue(kr, tasks)).toBe(50);
  });

  it('scales into a range that does not start at zero', () => {
    const ranged = { startValue: 40, targetValue: 60, currentValue: 40 };
    const half = [
      { isComplete: true, subtasks: [] },
      { isComplete: false, subtasks: [] },
    ];
    expect(keyResultValue(ranged, half)).toBe(50);
  });

  it('handles a descending range, where the target is below the start', () => {
    // Reducing something: 100 defects down to 20.
    const reducing = { startValue: 100, targetValue: 20, currentValue: 100 };
    const half = [
      { isComplete: true, subtasks: [] },
      { isComplete: false, subtasks: [] },
    ];
    expect(keyResultValue(reducing, half)).toBe(60);
  });

  it('blends whole tasks and partially finished ones', () => {
    const tasks = [
      { isComplete: true, subtasks: [] },
      { isComplete: false, subtasks: [done, open] },
      { isComplete: false, subtasks: [] },
    ];
    // (1 + 0.5 + 0) / 3 = 0.5
    expect(keyResultValue(kr, tasks)).toBeCloseTo(50, 10);
  });
});

describe('keyResultProgress and completion', () => {
  it('reports progress as a fraction of the range', () => {
    expect(keyResultProgress({ startValue: 0, targetValue: 100, currentValue: 25 })).toBe(0.25);
    expect(keyResultProgress({ startValue: 50, targetValue: 100, currentValue: 75 })).toBe(0.5);
  });

  it('clamps overshoot and undershoot', () => {
    expect(keyResultProgress({ startValue: 0, targetValue: 100, currentValue: 150 })).toBe(1);
    expect(keyResultProgress({ startValue: 0, targetValue: 100, currentValue: -20 })).toBe(0);
  });

  it('treats a zero-width range as met only once the target is reached', () => {
    expect(keyResultProgress({ startValue: 5, targetValue: 5, currentValue: 4 })).toBe(0);
    expect(keyResultProgress({ startValue: 5, targetValue: 5, currentValue: 5 })).toBe(1);
  });

  it('treats a hair under target as met, but not a real shortfall', () => {
    // The 0.999 threshold exists so accumulated division does not leave a key result
    // permanently at 99.9998%. It must not be loose enough to pass genuine misses.
    expect(isKeyResultMet({ startValue: 0, targetValue: 1000, currentValue: 999.5 })).toBe(true);
    expect(isKeyResultMet({ startValue: 0, targetValue: 1000, currentValue: 998 })).toBe(false);
  });

  it('reaches exactly 1 for a third-based split, where naive addition would not', () => {
    // Three tasks each contributing 1/3: the sum is 0.9999999999999998, not 1.
    const thirds = [1, 2, 3].map(() => ({ isComplete: true, subtasks: [] }));
    const kr = { startValue: 0, targetValue: 3, currentValue: 0 };
    kr.currentValue = keyResultValue(kr, thirds);
    expect(isKeyResultMet(kr)).toBe(true);
  });
});

describe('didObjectiveLand', () => {
  const met = { startValue: 0, targetValue: 10, currentValue: 10 };
  const missed = { startValue: 0, targetValue: 10, currentValue: 9 };

  it('requires every key result to be met', () => {
    expect(didObjectiveLand([met, met])).toBe(true);
    expect(didObjectiveLand([met, missed])).toBe(false);
  });

  it('does not count an objective with no key results as landed', () => {
    expect(didObjectiveLand([])).toBe(false);
  });
});

describe('objectiveProgress', () => {
  it('averages its key results', () => {
    const progress = objectiveProgress([
      { startValue: 0, targetValue: 100, currentValue: 100 },
      { startValue: 0, targetValue: 100, currentValue: 0 },
    ]);
    expect(progress).toBe(0.5);
  });

  it('is zero with no key results', () => {
    expect(objectiveProgress([])).toBe(0);
  });
});

describe('deriveObjectiveStatus', () => {
  it('completes at target regardless of time remaining', () => {
    expect(deriveObjectiveStatus(1, 0.1)).toBe('COMPLETED');
    expect(deriveObjectiveStatus(1, 0.99)).toBe('COMPLETED');
  });

  it('judges nothing in the opening tenth of a quarter', () => {
    expect(deriveObjectiveStatus(0, 0.05)).toBe('ON_TRACK');
    expect(deriveObjectiveStatus(0, 0.1)).toBe('ON_TRACK');
  });

  it('reads the same progress differently depending on the clock', () => {
    // 40% done is healthy early and alarming late: the point of using pace.
    expect(deriveObjectiveStatus(0.4, 0.4)).toBe('ON_TRACK');
    expect(deriveObjectiveStatus(0.4, 0.6)).toBe('AT_RISK');
    expect(deriveObjectiveStatus(0.4, 0.9)).toBe('OFF_TRACK');
  });

  it('places the thresholds exactly at pace 0.8 and 0.5', () => {
    expect(deriveObjectiveStatus(0.4, 0.5)).toBe('ON_TRACK'); // pace 0.80
    expect(deriveObjectiveStatus(0.399, 0.5)).toBe('AT_RISK'); // just under
    expect(deriveObjectiveStatus(0.25, 0.5)).toBe('AT_RISK'); // pace 0.50
    expect(deriveObjectiveStatus(0.249, 0.5)).toBe('OFF_TRACK'); // just under
  });

  it('marks anything unfinished as off track once the quarter has closed', () => {
    expect(deriveObjectiveStatus(0.95, 1, true)).toBe('OFF_TRACK');
    expect(deriveObjectiveStatus(1, 1, true)).toBe('COMPLETED');
  });
});

describe('elapsedFraction', () => {
  const start = new Date('2026-01-01T00:00:00Z');
  const end = new Date('2026-04-01T00:00:00Z');

  it('measures position through the quarter', () => {
    expect(elapsedFraction(start, end, start)).toBe(0);
    expect(elapsedFraction(start, end, end)).toBe(1);
    expect(elapsedFraction(start, end, new Date('2026-02-14T12:00:00Z'))).toBeCloseTo(0.5, 1);
  });

  it('clamps dates outside the quarter', () => {
    expect(elapsedFraction(start, end, new Date('2025-12-01T00:00:00Z'))).toBe(0);
    expect(elapsedFraction(start, end, new Date('2026-09-01T00:00:00Z'))).toBe(1);
  });

  it('survives a zero-length quarter without dividing by zero', () => {
    const f = elapsedFraction(start, start, start);
    expect(Number.isFinite(f)).toBe(true);
    expect(f).toBeGreaterThanOrEqual(0);
    expect(f).toBeLessThanOrEqual(1);
  });
});

describe('end to end: a quarter of real work', () => {
  it('carries a company from nothing to a landed objective', () => {
    const kr = { startValue: 0, targetValue: 100, currentValue: 0 };

    // Three tasks, nothing started.
    let tasks = [
      { isComplete: false, subtasks: [open, open] },
      { isComplete: false, subtasks: [] },
      { isComplete: false, subtasks: [] },
    ];
    kr.currentValue = keyResultValue(kr, tasks);
    expect(kr.currentValue).toBe(0);
    expect(deriveObjectiveStatus(objectiveProgress([kr]), 0.3)).toBe('OFF_TRACK');

    // One subtask ticked: partial credit appears immediately.
    tasks = [
      { isComplete: false, subtasks: [done, open] },
      { isComplete: false, subtasks: [] },
      { isComplete: false, subtasks: [] },
    ];
    kr.currentValue = keyResultValue(kr, tasks);
    expect(kr.currentValue).toBeCloseTo(16.67, 1);

    // Everything finishes.
    tasks = tasks.map(() => ({ isComplete: true, subtasks: [] }));
    kr.currentValue = keyResultValue(kr, tasks);
    expect(kr.currentValue).toBe(100);
    expect(didObjectiveLand([kr])).toBe(true);
    expect(deriveObjectiveStatus(objectiveProgress([kr]), 0.95)).toBe('COMPLETED');
  });

  it('removing the last linked task returns the key result to its start', () => {
    const kr = { startValue: 10, targetValue: 50, currentValue: 50 };
    expect(keyResultValue(kr, [])).toBe(10);
  });
});
