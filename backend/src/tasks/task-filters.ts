/**
 * The one filter that keeps subtask mirror rows out of task aggregates.
 *
 * When a task is broken into subtasks and a subtask gets an assignee, the app writes
 * a second `Task` row for it, tagged `taskType: 'SUBTASK'` and linked back through
 * `parentTaskId` and `subtaskId`. That mirror row exists so the subtask can carry an
 * assignment, a due date and notifications of its own, which a `Subtask` row cannot.
 * It is not a separate piece of work: it is one line inside a task that is already
 * counted.
 *
 * So every list and every count of "tasks" has to leave those rows out, or the same
 * work is counted twice and a company with 10 tasks broken into 25 subtasks reports
 * 35. The board has always excluded them. Analytics, Strategy and the user stats did
 * not, so the two screens disagreed about the same work, and the fix was applied
 * three separate times to three separate places before it was written down here.
 *
 * That is why this is a shared module rather than a literal repeated at each call
 * site. If you are adding a task count, a `findMany` that feeds a total, or a
 * `groupBy`, wrap the where clause in `realTasksOnly` and the next person does not
 * have to know any of the above.
 *
 * Two kinds of query deliberately do NOT use this:
 *
 *  - Anything that writes, and the reads that decide what a write touches. Releasing
 *    the tasks in a closing quarter, for instance, has to reach every row pointing at
 *    that quarter, mirror rows included, or one is left pointing at a closed cycle.
 *  - Referential safety checks, such as refusing to delete a quarter that still holds
 *    tasks. That guard is asking whether a foreign key would break, and a mirror row
 *    breaks it exactly as hard as a real task.
 */

/** The value written to `Task.taskType` for a subtask's mirror row. */
export const SUBTASK_TASK_TYPE = 'SUBTASK';

/**
 * Drop-in fragment for a Prisma `Task` where clause.
 *
 * `taskType` is nullable and Prisma's `not` keeps null rows, so tasks created before
 * the column existed are still counted. That is deliberate: they are real tasks.
 */
export const EXCLUDE_SUBTASKS = { taskType: { not: SUBTASK_TASK_TYPE } };

type TaskWhere = Record<string, any>;

/**
 * A task where clause with subtask mirror rows excluded.
 *
 * Call it with nothing for "every real task", or with the filter you already have.
 */
export function realTasksOnly<T extends TaskWhere>(where?: T): T & TaskWhere {
  const base = (where ?? {}) as T;

  // A caller who has already said something about taskType meant it, and overwriting
  // their filter with a broader one would quietly widen their query rather than
  // narrow it. Carry the exclusion in AND instead, so both constraints hold.
  if (base.taskType !== undefined) {
    const existing = base.AND === undefined ? [] : Array.isArray(base.AND) ? base.AND : [base.AND];
    return { ...base, AND: [...existing, EXCLUDE_SUBTASKS] };
  }

  return { ...base, ...EXCLUDE_SUBTASKS };
}

/** True when a row already in memory is a subtask mirror rather than a real task. */
export function isSubtaskMirror(task: { taskType?: string | null }): boolean {
  return task.taskType === SUBTASK_TASK_TYPE;
}

/** The same rule over a list already fetched, for the places that cannot filter in SQL. */
export function realTasks<T extends { taskType?: string | null }>(tasks: T[]): T[] {
  return tasks.filter((t) => !isSubtaskMirror(t));
}
