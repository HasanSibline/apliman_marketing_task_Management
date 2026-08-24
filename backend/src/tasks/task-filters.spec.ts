import {
  EXCLUDE_SUBTASKS,
  SUBTASK_TASK_TYPE,
  isSubtaskMirror,
  realTasks,
  realTasksOnly,
} from './task-filters';

describe('EXCLUDE_SUBTASKS', () => {
  it('is the same fragment the board has always used', () => {
    // tasks.service.ts, chat.service.ts and companies.service.ts all spell this out
    // by hand. If this shape ever stops matching theirs the screens diverge again.
    expect(EXCLUDE_SUBTASKS).toEqual({ taskType: { not: 'SUBTASK' } });
  });
});

describe('realTasksOnly', () => {
  it('excludes mirror rows when given nothing to start from', () => {
    expect(realTasksOnly()).toEqual({ taskType: { not: SUBTASK_TASK_TYPE } });
  });

  it('keeps the caller filter and adds the exclusion', () => {
    expect(realTasksOnly({ companyId: 'c1', assignedToId: 'u1' })).toEqual({
      companyId: 'c1',
      assignedToId: 'u1',
      taskType: { not: SUBTASK_TASK_TYPE },
    });
  });

  it('does not mutate the clause it was handed', () => {
    // Several call sites reuse one base filter across a Promise.all of counts.
    const base = { companyId: 'c1' };
    realTasksOnly(base);
    expect(base).toEqual({ companyId: 'c1' });
  });

  it('leaves an existing taskType alone rather than widening it', () => {
    // Overwriting this would turn "only social media tasks" into "everything except
    // subtasks", which is a bigger result set than the caller asked for.
    expect(realTasksOnly({ taskType: 'SOCIAL_MEDIA' })).toEqual({
      taskType: 'SOCIAL_MEDIA',
      AND: [{ taskType: { not: SUBTASK_TASK_TYPE } }],
    });
  });

  it('appends to an existing AND rather than replacing it', () => {
    const where = { taskType: 'GENERAL', AND: [{ priority: 1 }] };
    expect(realTasksOnly(where)).toEqual({
      taskType: 'GENERAL',
      AND: [{ priority: 1 }, { taskType: { not: SUBTASK_TASK_TYPE } }],
    });
  });

  it('accepts an AND that is a single object rather than an array', () => {
    expect(realTasksOnly({ taskType: 'GENERAL', AND: { priority: 1 } })).toEqual({
      taskType: 'GENERAL',
      AND: [{ priority: 1 }, { taskType: { not: SUBTASK_TASK_TYPE } }],
    });
  });

  it('treats an undefined taskType as absent, not as a constraint', () => {
    // Optional query parameters arrive as undefined, and an AND wrapper around
    // nothing would be noise in every logged query.
    expect(realTasksOnly({ companyId: 'c1', taskType: undefined })).toEqual({
      companyId: 'c1',
      taskType: { not: SUBTASK_TASK_TYPE },
    });
  });
});

describe('isSubtaskMirror', () => {
  it('recognises only the mirror rows', () => {
    expect(isSubtaskMirror({ taskType: 'SUBTASK' })).toBe(true);
    expect(isSubtaskMirror({ taskType: 'GENERAL' })).toBe(false);
    expect(isSubtaskMirror({ taskType: 'COORDINATION' })).toBe(false);
  });

  it('counts a task with no type as real', () => {
    // Rows predating the column are ordinary tasks and must not vanish from totals.
    expect(isSubtaskMirror({ taskType: null })).toBe(false);
    expect(isSubtaskMirror({})).toBe(false);
  });
});

describe('realTasks', () => {
  it('drops mirror rows so 10 tasks and 25 subtasks total 10', () => {
    const tasks = [
      ...Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, taskType: 'GENERAL' })),
      ...Array.from({ length: 25 }, (_, i) => ({ id: `s${i}`, taskType: 'SUBTASK' })),
    ];
    expect(realTasks(tasks)).toHaveLength(10);
  });

  it('keeps every other task type, including coordination tasks', () => {
    const tasks = [
      { taskType: 'GENERAL' },
      { taskType: 'COORDINATION' },
      { taskType: null },
      { taskType: 'SUBTASK' },
    ];
    expect(realTasks(tasks)).toEqual([
      { taskType: 'GENERAL' },
      { taskType: 'COORDINATION' },
      { taskType: null },
    ]);
  });
});
