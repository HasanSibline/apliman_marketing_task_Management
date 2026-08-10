/**
 * A task is in one of three places, and that is the whole model.
 *
 * The database enum still carries the states an approval step needed:
 * PENDING_APPROVAL, APPROVED, ASSIGNED, REJECTED. There is no approval step any
 * more, so none of those describe anything a person cares about. They cannot simply
 * be deleted either, because PostgreSQL will not drop a value from an enum type and
 * rows out there still hold them. So they are mapped rather than removed, in one
 * place, and nothing outside this file needs to know they were ever there.
 *
 * Everything before work starts is To do. That is the honest reading of a task that
 * was waiting to be approved, had just been approved, or had been assigned to
 * someone: in every case nobody had started it.
 */

export type TaskStage = 'TODO' | 'IN_PROGRESS' | 'COMPLETED';

export const TASK_STAGES: TaskStage[] = ['TODO', 'IN_PROGRESS', 'COMPLETED'];

export const TASK_STAGE_LABEL: Record<TaskStage, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
};

/** The enum value written when a task is put into a stage. */
export const STAGE_TO_PHASE: Record<TaskStage, 'TODO' | 'IN_PROGRESS' | 'COMPLETED'> = {
  TODO: 'TODO',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
};

export function isTaskStage(value: unknown): value is TaskStage {
  return typeof value === 'string' && (TASK_STAGES as string[]).includes(value);
}

/**
 * Which of the three a task is in.
 *
 * `completedAt` and a workflow end phase both win over the enum. A task carrying a
 * completion date is finished whatever its phase column says, and those two have
 * disagreed before: the phase moved and the date did not, or the other way round.
 * Reading completion from the evidence rather than from one field keeps a finished
 * task out of To do.
 */
export function taskStage(task: {
  phase?: string | null;
  completedAt?: Date | string | null;
  currentPhase?: { isEndPhase?: boolean | null } | null;
}): TaskStage {
  if (task.completedAt) return 'COMPLETED';
  if (task.currentPhase?.isEndPhase) return 'COMPLETED';

  switch (task.phase) {
    case 'COMPLETED':
    case 'ARCHIVED':
      return 'COMPLETED';
    case 'IN_PROGRESS':
      return 'IN_PROGRESS';
    // TODO, PENDING_APPROVAL, APPROVED, ASSIGNED, REJECTED and anything unrecognised:
    // work that has not started.
    default:
      return 'TODO';
  }
}

/** The phase values that read as a given stage, for querying. */
export function phasesForStage(stage: TaskStage): string[] {
  switch (stage) {
    case 'COMPLETED':
      return ['COMPLETED', 'ARCHIVED'];
    case 'IN_PROGRESS':
      return ['IN_PROGRESS'];
    default:
      return ['TODO', 'PENDING_APPROVAL', 'APPROVED', 'ASSIGNED', 'REJECTED'];
  }
}
