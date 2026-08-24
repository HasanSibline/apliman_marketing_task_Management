import {
  BucketPhase,
  PhasePartition,
  TASK_BUCKETS,
  TaskBucket,
  averageCompletionRate,
  bucketWhere,
  completionRate,
  notCompletedWhere,
  partitionPhaseIds,
  reconcileBuckets,
  taskBucket,
} from './task-buckets';

const startPhase: BucketPhase = { id: 'start', isStartPhase: true, isEndPhase: false };
const middlePhase: BucketPhase = { id: 'middle', isStartPhase: false, isEndPhase: false };
const endPhase: BucketPhase = { id: 'end', isStartPhase: false, isEndPhase: true };
/** A workflow with one phase has that phase flagged both ways. */
const onlyPhase: BucketPhase = { id: 'only', isStartPhase: true, isEndPhase: true };

const partition = partitionPhaseIds([startPhase, middlePhase, endPhase]);

describe('partitionPhaseIds', () => {
  it('splits phases by their flags', () => {
    expect(partition).toEqual({ end: ['end'], middle: ['middle'], start: ['start'] });
  });

  it('puts a one-phase workflow in end, because finished beats not started', () => {
    expect(partitionPhaseIds([onlyPhase])).toEqual({ end: ['only'], middle: [], start: [] });
  });

  it('treats a phase with no flags at all as a middle phase', () => {
    expect(partitionPhaseIds([{ id: 'x' }])).toEqual({ end: [], middle: ['x'], start: [] });
  });

  it('lists every phase exactly once', () => {
    const phases = [startPhase, middlePhase, endPhase, onlyPhase, { id: 'x' }];
    const p = partitionPhaseIds(phases);
    const all = [...p.end, ...p.middle, ...p.start].sort();
    expect(all).toEqual(phases.map((ph) => ph.id).sort());
  });
});

describe('taskBucket', () => {
  it('reads an end phase as completed', () => {
    expect(taskBucket({ phase: 'TODO', currentPhase: { isEndPhase: true } })).toBe('completed');
  });

  /**
   * setStage writes completedAt and the enum without moving currentPhaseId, so this
   * is the state of every task marked complete from the task detail screen.
   */
  it('reads a task marked complete in a middle phase as completed', () => {
    expect(taskBucket({
      completedAt: new Date(),
      phase: 'COMPLETED',
      currentPhase: { isStartPhase: false, isEndPhase: false },
    })).toBe('completed');
  });

  it('reads an archived task as completed', () => {
    expect(taskBucket({ phase: 'ARCHIVED', currentPhase: { isStartPhase: true } })).toBe('completed');
  });

  it('lets finished beat not started in a one-phase workflow', () => {
    expect(taskBucket({ phase: 'TODO', currentPhase: { isStartPhase: true, isEndPhase: true } }))
      .toBe('completed');
  });

  /** Moving across a workflow does not touch the phase enum, so position has to count. */
  it('reads a middle phase as in progress even while the enum still says TODO', () => {
    expect(taskBucket({ phase: 'TODO', currentPhase: { isStartPhase: false, isEndPhase: false } }))
      .toBe('inProgress');
  });

  it('reads the enum as in progress for a task still at its start phase', () => {
    expect(taskBucket({ phase: 'IN_PROGRESS', currentPhase: { isStartPhase: true } })).toBe('inProgress');
  });

  it('reads a task sitting at its start phase as pending', () => {
    expect(taskBucket({ phase: 'TODO', currentPhase: { isStartPhase: true } })).toBe('pending');
  });

  /** The hole: currentPhaseId is nullable and nothing used to match these rows. */
  it('puts a task with no phase at all in pending rather than nowhere', () => {
    expect(taskBucket({ phase: 'TODO', currentPhase: null })).toBe('pending');
    expect(taskBucket({})).toBe('pending');
  });

  it('does not read a phase named Done as finished when the workflow says otherwise', () => {
    // The old heuristic counted this in Completed AND in In Progress at the same time.
    expect(taskBucket({ phase: 'TODO', currentPhase: { isStartPhase: false, isEndPhase: false } }))
      .toBe('inProgress');
  });

  it('treats the retired approval enum values as not started', () => {
    for (const phase of ['PENDING_APPROVAL', 'APPROVED', 'ASSIGNED', 'REJECTED']) {
      expect(taskBucket({ phase, currentPhase: { isStartPhase: true } })).toBe('pending');
    }
  });
});

/**
 * A tiny evaluator for the subset of Prisma filters these fragments use.
 *
 * `notIn` deliberately drops nulls, which is what Prisma does and is the trap the
 * fragments are written to avoid. Evaluating them the same way Prisma would is the
 * only way a test can prove they avoid it.
 */
interface Row {
  completedAt: Date | null;
  phase: string;
  currentPhaseId: string | null;
}

const asArray = (v: any): any[] => (Array.isArray(v) ? v : [v]);

function matchesField(actual: any, condition: any): boolean {
  if (condition === null) return actual === null;

  if (typeof condition === 'object' && !(condition instanceof Date)) {
    if ('in' in condition) return condition.in.includes(actual);
    if ('notIn' in condition) return actual !== null && !condition.notIn.includes(actual);
    if ('not' in condition) {
      return condition.not === null ? actual !== null : actual !== null && actual !== condition.not;
    }
  }

  return actual === condition;
}

function matches(row: Row, where: any): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'AND') return asArray(value).every((c) => matches(row, c));
    if (key === 'OR') return asArray(value).some((c) => matches(row, c));
    if (key === 'NOT') return !asArray(value).some((c) => matches(row, c));
    return matchesField((row as any)[key] ?? null, value);
  });
}

/** Every shape a task row can take against a three-phase workflow. */
function everyRow(): Row[] {
  const phaseValues = [
    'TODO',
    'IN_PROGRESS',
    'COMPLETED',
    'ARCHIVED',
    'PENDING_APPROVAL',
    'APPROVED',
    'ASSIGNED',
    'REJECTED',
  ];
  const rows: Row[] = [];

  for (const currentPhaseId of ['start', 'middle', 'end', null]) {
    for (const phase of phaseValues) {
      for (const completedAt of [null, new Date('2026-01-01T00:00:00Z')]) {
        rows.push({ currentPhaseId, phase, completedAt });
      }
    }
  }

  return rows;
}

const phaseById: Record<string, BucketPhase> = {
  start: startPhase,
  middle: middlePhase,
  end: endPhase,
};

const rowToTask = (row: Row) => ({
  completedAt: row.completedAt,
  phase: row.phase,
  currentPhase: row.currentPhaseId ? phaseById[row.currentPhaseId] : null,
});

describe('bucketWhere', () => {
  it('claims every task exactly once', () => {
    for (const row of everyRow()) {
      const claimed = TASK_BUCKETS.filter((b) => matches(row, bucketWhere(b, partition)));
      expect({ row, claimed }).toEqual({ row, claimed: [claimed[0]] });
    }
  });

  it('agrees with taskBucket on every task', () => {
    for (const row of everyRow()) {
      const claimed = TASK_BUCKETS.find((b) => matches(row, bucketWhere(b, partition)));
      expect({ row, bucket: claimed }).toEqual({ row, bucket: taskBucket(rowToTask(row)) });
    }
  });

  /** The gap that made the three counts fall short of the total. */
  it('still claims a task with no phase', () => {
    const row: Row = { currentPhaseId: null, phase: 'TODO', completedAt: null };
    expect(matches(row, bucketWhere('pending', partition))).toBe(true);
  });

  it('claims a task in a one-phase workflow as completed, not pending', () => {
    const single = partitionPhaseIds([onlyPhase]);
    const row: Row = { currentPhaseId: 'only', phase: 'TODO', completedAt: null };
    expect(matches(row, bucketWhere('completed', single))).toBe(true);
    expect(matches(row, bucketWhere('pending', single))).toBe(false);
  });

  it('claims everything as pending when the company has no phases yet', () => {
    const empty: PhasePartition = { end: [], middle: [], start: [] };
    const row: Row = { currentPhaseId: null, phase: 'TODO', completedAt: null };
    const claimed = TASK_BUCKETS.filter((b) => matches(row, bucketWhere(b, empty)));
    expect(claimed).toEqual(['pending']);
  });

  it('never applies a negating filter to the nullable phase column', () => {
    const serialised = TASK_BUCKETS.map((b) => JSON.stringify(bucketWhere(b, partition))).join(' ');
    // notIn and not on currentPhaseId would silently discard every phaseless task.
    expect(serialised).not.toMatch(/"currentPhaseId":\{"notIn"/);
    expect(serialised).not.toMatch(/"currentPhaseId":\{"not"/);
  });
});

describe('notCompletedWhere', () => {
  it('matches exactly the tasks the completed bucket does not', () => {
    for (const row of everyRow()) {
      const open = matches(row, notCompletedWhere(partition));
      const completed = matches(row, bucketWhere('completed', partition));
      expect({ row, open }).toEqual({ row, open: !completed });
    }
  });

  it('keeps an overdue task that has no phase', () => {
    expect(matches({ currentPhaseId: null, phase: 'TODO', completedAt: null }, notCompletedWhere(partition)))
      .toBe(true);
  });
});

describe('reconcileBuckets', () => {
  it('leaves a partition that already adds up alone', () => {
    expect(reconcileBuckets(10, { completed: 5, inProgress: 3, pending: 2 }))
      .toEqual({ completed: 5, inProgress: 3, pending: 2, unaccounted: 0 });
  });

  it('gives unclaimed tasks to pending so the three match the total', () => {
    const r = reconcileBuckets(10, { completed: 5, inProgress: 3, pending: 0 });
    expect(r.pending).toBe(2);
    expect(r.unaccounted).toBe(2);
    expect(r.completed + r.inProgress + r.pending).toBe(10);
  });

  /** The defect: this expression rendered a negative Pending count to a user. */
  it('never returns a negative count', () => {
    const r = reconcileBuckets(4, { completed: 5, inProgress: 3, pending: 0 });
    expect(r.pending).toBe(0);
    expect(r.unaccounted).toBe(-4);
  });

  it('clamps a negative input count before doing anything with it', () => {
    const r = reconcileBuckets(3, { completed: -1, inProgress: 0, pending: 0 });
    expect(r.completed).toBe(0);
    expect(r.pending).toBe(3);
  });

  it('adds up to the total for any non-negative split of it', () => {
    for (let total = 0; total <= 6; total++) {
      for (let completed = 0; completed <= total; completed++) {
        for (let inProgress = 0; inProgress <= total - completed; inProgress++) {
          const r = reconcileBuckets(total, { completed, inProgress, pending: 0 });
          expect(r.completed + r.inProgress + r.pending).toBe(total);
        }
      }
    }
  });
});

describe('completionRate', () => {
  it('is zero when there is nothing to complete, rather than NaN', () => {
    expect(completionRate(0, 0)).toBe(0);
    expect(completionRate(3, 0)).toBe(0);
  });

  it('rounds to a whole percent', () => {
    expect(completionRate(1, 3)).toBe(33);
    expect(completionRate(2, 3)).toBe(67);
  });

  it('never leaves the 0 to 100 range', () => {
    expect(completionRate(7, 5)).toBe(100);
    expect(completionRate(-2, 5)).toBe(0);
  });
});

describe('averageCompletionRate', () => {
  /** The defect: a member with nothing assigned scored 0% and pulled the team down. */
  it('ignores members who have no tasks at all', () => {
    expect(averageCompletionRate([
      { assignedTasks: 4, completionRate: 100 },
      { assignedTasks: 2, completionRate: 50 },
      { assignedTasks: 0, completionRate: 0 },
    ])).toBe(75);
  });

  it('matches the plain mean when everybody has work', () => {
    expect(averageCompletionRate([
      { assignedTasks: 4, completionRate: 100 },
      { assignedTasks: 2, completionRate: 50 },
    ])).toBe(75);
  });

  it('still counts a member who has work and has finished none of it', () => {
    expect(averageCompletionRate([
      { assignedTasks: 4, completionRate: 100 },
      { assignedTasks: 2, completionRate: 0 },
    ])).toBe(50);
  });

  it('is zero for an empty team and for a team with no work', () => {
    expect(averageCompletionRate([])).toBe(0);
    expect(averageCompletionRate([{ assignedTasks: 0, completionRate: 0 }])).toBe(0);
  });
});
