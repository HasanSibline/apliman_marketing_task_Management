/**
 * The three places a task can be, mirroring src/tasks/task-stage.ts on the server.
 *
 * The database enum still carries the states the removed approval step needed. They
 * cannot be deleted, because PostgreSQL will not drop a value from an enum type, so
 * they are folded into the three here exactly as the server folds them. Both sides
 * have to agree: a card that sits in a different column from the one the API would
 * put it in is worse than no column at all.
 */

export type TaskStage = 'TODO' | 'IN_PROGRESS' | 'COMPLETED'

export const STAGES: {
  key: TaskStage
  label: string
  /** Status colour, not brand: these describe state, not the company. */
  dot: string
  /** Ground and text for the same status, used on a card. */
  chip: string
  empty: string
}[] = [
  {
    key: 'TODO',
    label: 'To do',
    dot: 'bg-gray-400 dark:bg-gray-500',
    chip: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
    empty: 'Nothing waiting to start.',
  },
  {
    key: 'IN_PROGRESS',
    label: 'In progress',
    dot: 'bg-amber-500',
    chip: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    empty: 'Nothing being worked on.',
  },
  {
    key: 'COMPLETED',
    label: 'Completed',
    dot: 'bg-blue-500',
    chip: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    empty: 'Nothing finished yet.',
  },
]

export function taskStage(task: {
  phase?: string | null
  completedAt?: string | Date | null
  currentPhase?: { isEndPhase?: boolean | null } | null
}): TaskStage {
  // Completion is recorded in more than one place and those places have disagreed,
  // so the evidence wins over the phase column.
  if (task.completedAt) return 'COMPLETED'
  if (task.currentPhase?.isEndPhase) return 'COMPLETED'

  switch (task.phase) {
    case 'COMPLETED':
    case 'ARCHIVED':
      return 'COMPLETED'
    case 'IN_PROGRESS':
      return 'IN_PROGRESS'
    // TODO, the approval-era states, and anything unrecognised: not started. An
    // unknown state belongs where it can be seen, not buried under Completed.
    default:
      return 'TODO'
  }
}
