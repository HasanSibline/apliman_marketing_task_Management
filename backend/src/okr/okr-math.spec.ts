import {
  taskFraction,
  keyResultValue,
  keyResultProgress,
  keyResultPercent,
  objectivePercent,
  isKeyResultMet,
  didObjectiveLand,
  objectiveProgress,
  deriveObjectiveStatus,
  elapsedFraction,
  yearVerdict,
  quarterReadiness,
  nextQuarterSlot,
  advanceQuarterSlot,
  quarterEnding,
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

  it('treats a zero-width range as met only at the target, in either direction', () => {
    expect(keyResultProgress({ startValue: 5, targetValue: 5, currentValue: 4 })).toBe(0);
    expect(keyResultProgress({ startValue: 5, targetValue: 5, currentValue: 5 })).toBe(1);
    // "Hold escalations at zero" that has climbed to five is not complete. Reading a
    // zero-width range as met at or above the target scored exactly that as done.
    expect(keyResultProgress({ startValue: 0, targetValue: 0, currentValue: 5 })).toBe(0);
    expect(keyResultProgress({ startValue: 0, targetValue: 0, currentValue: 0 })).toBe(1);
  });

  it('measures from the start, not as a share of the target', () => {
    // The formula this replaced ignored startValue, so a key result that had not
    // been touched yet announced 80% of its work already done.
    expect(keyResultProgress({ startValue: 80, targetValue: 100, currentValue: 80 })).toBe(0);
    expect(keyResultProgress({ startValue: 80, targetValue: 100, currentValue: 90 })).toBe(0.5);
    expect(keyResultProgress({ startValue: 80, targetValue: 100, currentValue: 100 })).toBe(1);
  });

  describe('a decreasing goal, where the target sits below the start', () => {
    const reducing = { startValue: 100, targetValue: 20 };

    it('rises as the number falls', () => {
      expect(keyResultProgress({ ...reducing, currentValue: 100 })).toBe(0);
      expect(keyResultProgress({ ...reducing, currentValue: 60 })).toBe(0.5);
      expect(keyResultProgress({ ...reducing, currentValue: 20 })).toBe(1);
    });

    it('clamps a value past the target and one that went the wrong way', () => {
      expect(keyResultProgress({ ...reducing, currentValue: 5 })).toBe(1);
      expect(keyResultProgress({ ...reducing, currentValue: 140 })).toBe(0);
    });

    it('can express "reduce to zero", which a target-share formula cannot', () => {
      // Guarding on targetValue > 0 pinned this at 0% however much work was done.
      const toZero = { startValue: 40, targetValue: 0 };
      expect(keyResultProgress({ ...toZero, currentValue: 40 })).toBe(0);
      expect(keyResultProgress({ ...toZero, currentValue: 10 })).toBe(0.75);
      expect(keyResultProgress({ ...toZero, currentValue: 0 })).toBe(1);
      expect(isKeyResultMet({ ...toZero, currentValue: 0 })).toBe(true);
    });

    it('never reports a negative fraction, which would drag an objective below zero', () => {
      // The formula this replaced clamped the top but not the bottom, so one key
      // result sliding backwards pulled its objective's average under 0%.
      const objective = [
        { startValue: 0, targetValue: 100, currentValue: -500 },
        { startValue: 0, targetValue: 100, currentValue: 100 },
      ];
      expect(objectiveProgress(objective)).toBe(0.5);
    });
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

describe('the percentage helpers every screen goes through', () => {
  it('rounds a fraction to a whole percentage', () => {
    expect(keyResultPercent({ startValue: 0, targetValue: 3, currentValue: 1 })).toBe(33);
    expect(keyResultPercent({ startValue: 0, targetValue: 3, currentValue: 2 })).toBe(67);
    expect(objectivePercent([{ startValue: 0, targetValue: 3, currentValue: 1 }])).toBe(33);
  });

  it('never leaves a percentage outside 0..100', () => {
    expect(keyResultPercent({ startValue: 0, targetValue: 100, currentValue: 400 })).toBe(100);
    expect(keyResultPercent({ startValue: 0, targetValue: 100, currentValue: -400 })).toBe(0);
    expect(objectivePercent([{ startValue: 0, targetValue: 100, currentValue: -400 }])).toBe(0);
  });

  it('reports no key results as zero rather than as not a number', () => {
    expect(objectivePercent([])).toBe(0);
  });

  it('rounds the average once, not each key result before averaging', () => {
    // Rounding per key result and then averaging drifts: 33 + 33 + 33 over 3 is 33,
    // where the honest answer is the mean of the fractions.
    const krs = [
      { startValue: 0, targetValue: 3, currentValue: 1 },
      { startValue: 0, targetValue: 3, currentValue: 2 },
    ];
    expect(objectivePercent(krs)).toBe(50);
  });

  // The bug that started this: Strategy and the year report disagreed about the same
  // objective because each carried its own copy of the arithmetic.
  it('agrees with the fraction it is derived from', () => {
    const krs = [
      { startValue: 80, targetValue: 100, currentValue: 85 },
      { startValue: 100, targetValue: 0, currentValue: 30 },
    ];
    expect(objectivePercent(krs)).toBe(Math.round(objectiveProgress(krs) * 100));
    expect(objectivePercent(krs)).toBe(48);
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

describe('yearVerdict', () => {
  it('does not call a year with no objectives a failure', () => {
    // Setting no target is not the same as missing one.
    expect(yearVerdict(0, 0)).toBe('no-goals');
  });

  it('splits on the share of objectives that landed', () => {
    expect(yearVerdict(10, 10)).toBe('achieved');
    expect(yearVerdict(10, 8)).toBe('achieved');
    expect(yearVerdict(10, 7)).toBe('partial');
    expect(yearVerdict(10, 5)).toBe('partial');
    expect(yearVerdict(10, 4)).toBe('missed');
    expect(yearVerdict(10, 0)).toBe('missed');
  });

  it('handles a single objective without rounding into the wrong bucket', () => {
    expect(yearVerdict(1, 1)).toBe('achieved');
    expect(yearVerdict(1, 0)).toBe('missed');
  });

  it('lands exactly on the thresholds', () => {
    expect(yearVerdict(5, 4)).toBe('achieved'); // 80%
    expect(yearVerdict(4, 2)).toBe('partial');  // 50%
    expect(yearVerdict(3, 1)).toBe('missed');   // 33%
  });
});

describe('quarterReadiness', () => {
  const kr = [{}];

  it('is not ready with no objectives at all', () => {
    const r = quarterReadiness([]);
    expect(r.ready).toBe(false);
    expect(r.reason).toBe('no-objectives');
  });

  it('is ready when every objective can be measured', () => {
    expect(
      quarterReadiness([
        { title: 'Grow pipeline', keyResults: kr },
        { title: 'Cut churn', keyResults: [{}, {}] },
      ]).ready,
    ).toBe(true);
  });

  it('names the objectives that have no key result', () => {
    const r = quarterReadiness([
      { title: 'Grow pipeline', keyResults: kr },
      { title: 'Cut churn', keyResults: [] },
      { title: 'Launch v2', keyResults: [] },
    ]);
    expect(r.ready).toBe(false);
    expect(r.reason).toBe('objectives-without-key-results');
    // Named, so the banner can say which one to fix rather than "something".
    expect(r.titles).toEqual(['Cut churn', 'Launch v2']);
  });

  it('treats one unmeasurable objective as enough to hold the quarter back', () => {
    // It would sit at zero all cycle and drag the average down with it.
    expect(quarterReadiness([{ title: 'Vague ambition', keyResults: [] }]).ready).toBe(false);
  });
});

describe('nextQuarterSlot', () => {
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  it('lands exactly on the calendar for calendar-aligned quarters', () => {
    const next = nextQuarterSlot({ name: 'Q1', year: 2026, endDate: new Date('2026-03-31T23:59:59Z') });
    expect(next.name).toBe('Q2');
    expect(next.year).toBe(2026);
    expect(iso(next.startDate)).toBe('2026-04-01');
    expect(iso(next.endDate)).toBe('2026-06-30');
  });

  it('rolls Q4 into Q1 of the following year', () => {
    const next = nextQuarterSlot({ name: 'Q4', year: 2026, endDate: new Date('2026-12-31T23:59:59Z') });
    expect(next.name).toBe('Q1');
    expect(next.year).toBe(2027);
    expect(iso(next.startDate)).toBe('2027-01-01');
    expect(iso(next.endDate)).toBe('2027-03-31');
  });

  it('follows the sequence even when the previous quarter had unusual dates', () => {
    // The case that exposed this: a Q1 dated across two days in August. Naming from
    // the calendar gave "Q3" starting in July, before the quarter it succeeds.
    const next = nextQuarterSlot({ name: 'Q1', year: 2028, endDate: new Date('2028-08-11T23:59:59Z') });
    expect(next.name).toBe('Q2');
    expect(next.year).toBe(2028);
    expect(iso(next.startDate)).toBe('2028-08-12');
    expect(next.startDate.getTime()).toBeGreaterThan(new Date('2028-08-11T23:59:59Z').getTime());
  });

  it('never begins before the quarter it follows', () => {
    const ends = ['2026-01-15', '2026-05-02', '2026-08-11', '2026-11-30', '2026-12-31'];
    for (const end of ends) {
      const prevEnd = new Date(`${end}T23:59:59Z`);
      const next = nextQuarterSlot({ name: 'Q2', year: 2026, endDate: prevEnd });
      expect(next.startDate.getTime()).toBeGreaterThan(prevEnd.getTime());
      expect(next.endDate.getTime()).toBeGreaterThan(next.startDate.getTime());
    }
  });

  it('falls back to the calendar when the name carries no sequence', () => {
    const next = nextQuarterSlot({ name: 'Spring push', year: 2026, endDate: new Date('2026-03-31T23:59:59Z') });
    expect(next.name).toBe('Q2');
    expect(next.year).toBe(2026);
  });

  it('steps forward a whole quarter when a slot is already taken', () => {
    const first = nextQuarterSlot({ name: 'Q1', year: 2026, endDate: new Date('2026-03-31T23:59:59Z') });
    const second = advanceQuarterSlot(first);
    expect(second.name).toBe('Q3');
    expect(iso(second.startDate)).toBe('2026-07-01');
    expect(iso(second.endDate)).toBe('2026-09-30');

    const third = advanceQuarterSlot(second);
    expect(third.name).toBe('Q4');
    const fourth = advanceQuarterSlot(third);
    expect(fourth.name).toBe('Q1');
    expect(fourth.year).toBe(2027);
  });
});

describe('quarterEnding', () => {
  const planned = new Date('2026-03-31T23:59:59Z');

  it('reports a running quarter as open, not as on time', () => {
    expect(quarterEnding({ status: 'ACTIVE', endDate: planned, closedAt: null }).state).toBe('open');
  });

  it('reports a cycle finished ahead of the calendar as early, with the gap', () => {
    const r = quarterEnding({ status: 'CLOSED', endDate: planned, closedAt: new Date('2026-02-20T10:00:00Z') });
    expect(r.state).toBe('early');
    expect(r.days).toBe(39);
  });

  it('reports one that overran as late', () => {
    const r = quarterEnding({ status: 'CLOSED', endDate: planned, closedAt: new Date('2026-04-15T10:00:00Z') });
    expect(r.state).toBe('late');
    expect(r.days).toBe(14);
  });

  it('treats closing within a day of the plan as on time', () => {
    expect(
      quarterEnding({ status: 'CLOSED', endDate: planned, closedAt: new Date('2026-04-01T09:00:00Z') }).state,
    ).toBe('on-time');
  });

  it('does not claim a quarter closed before this was recorded ran late', () => {
    // No closedAt means no evidence. Inventing one would assert something untrue.
    const r = quarterEnding({ status: 'CLOSED', endDate: planned, closedAt: null });
    expect(r.state).toBe('on-time');
    expect(r.days).toBe(0);
  });

  it('counts the year on from the quarter before, not from the dates typed into it', () => {
    // The bug this caught: a quarter labelled 2028 but dated in 2026. Reading the
    // year off the derived start date moved the company to 2027, which is neither
    // the year it was in nor the year it was going to.
    const next = nextQuarterSlot({ name: 'Q1', year: 2028, endDate: new Date('2026-08-11T23:59:59Z') });
    expect(next.name).toBe('Q2');
    expect(next.year).toBe(2028);
  });

  it('rolls the year on the sequence wrapping, whatever the dates say', () => {
    const next = nextQuarterSlot({ name: 'Q4', year: 2028, endDate: new Date('2026-08-11T23:59:59Z') });
    expect(next.name).toBe('Q1');
    expect(next.year).toBe(2029);
  });
});
