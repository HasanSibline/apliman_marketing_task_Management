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
  /**
   * Deliberately untyped, and only this field.
   *
   * Callers pass whatever their own Task type says currentPhase is. Some pass the
   * shared Phase interface, which has isEndPhase; some declare a local shape with
   * only id, name and colour, which has not. A closed type rejects the second for
   * having no property in common, and an index signature rejects the first because
   * an interface cannot satisfy one. Reading an absent isEndPhase as undefined is
   * exactly the behaviour wanted, and the body below already guards for it.
   */
  currentPhase?: any
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

/**
 * The stage as a person would say it.
 *
 * Several pages printed `task.phase.replace(/_/g, ' ')`, which is the raw enum with
 * its underscores taken out: a task left over from the approval era reads "PENDING
 * APPROVAL" there, naming a step this app no longer has. Going through the stage
 * rule means every screen says one of three things, and they are the same three
 * words the board uses.
 */
export function stageLabel(task: Parameters<typeof taskStage>[0]): string {
  return STAGES.find((s) => s.key === taskStage(task))!.label
}

/**
 * Order within a column: whatever is due soonest, first.
 *
 * Overdue work sorts to the very top on its own, because a date in the past is the
 * nearest date there is. That is the right answer rather than a special case.
 *
 * A task with no due date sorts last whatever its priority. Undated work is not
 * urgent, it is unscheduled, and letting a Critical undated task outrank one due
 * tomorrow would bury the thing with an actual deadline. Priority breaks ties
 * between tasks due the same day, which is what priority is for.
 */
export function byDeadline(
  a: { dueDate?: string | null; priority?: number; createdAt?: string },
  b: { dueDate?: string | null; priority?: number; createdAt?: string },
): number {
  const da = a.dueDate ? Date.parse(a.dueDate) : NaN
  const db = b.dueDate ? Date.parse(b.dueDate) : NaN
  const aHas = !Number.isNaN(da)
  const bHas = !Number.isNaN(db)

  if (aHas && bHas && da !== db) return da - db
  if (aHas !== bHas) return aHas ? -1 : 1

  // Same day, or neither dated: the more urgent first, then the older.
  const pa = a.priority ?? 0
  const pb = b.priority ?? 0
  if (pa !== pb) return pb - pa

  return Date.parse(a.createdAt ?? '') - Date.parse(b.createdAt ?? '') || 0
}
