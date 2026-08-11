import React from 'react'
import { ExclamationTriangleIcon, XMarkIcon } from '@heroicons/react/24/outline'

/**
 * The one move worth stopping for.
 *
 * Nothing else on this board asks for confirmation. A drag is already a deliberate
 * gesture and every move is undone by dragging back, so confirming routine moves
 * would only teach people to dismiss dialogs without reading, which costs the one
 * that matters.
 *
 * This is that one. Completing a task counts it fully toward its key result even
 * with subtasks unticked, because progress reads completion first: the alternative
 * capped a finished task below target forever over one stray subtask. That is the
 * right rule, but it means completing here moves an objective's progress, and the
 * year's verdict behind it, by more than the person may expect. The consequence is
 * invisible from the card, so it is said out loud.
 */

interface Props {
  title: string
  done: number
  total: number
  keyResultTitle?: string | null
  onConfirm: () => void
  onCancel: () => void
}

const CompleteTaskDialog: React.FC<Props> = ({
  title,
  done,
  total,
  keyResultTitle,
  onConfirm,
  onCancel,
}) => {
  const remaining = total - done

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="complete-task-title"
        aria-describedby="complete-task-body"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        className="surface w-full max-w-md p-6 shadow-lg"
      >
        <div className="flex items-start gap-4">
          <div className="rounded-full bg-amber-100 p-2 dark:bg-amber-900/30">
            <ExclamationTriangleIcon
              className="h-6 w-6 text-amber-600 dark:text-amber-400"
              aria-hidden="true"
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <h2 id="complete-task-title" className="section-title">
                Complete with unfinished subtasks?
              </h2>
              <button
                aria-label="Cancel"
                onClick={onCancel}
                className="shrink-0 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <p id="complete-task-body" className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              <span className="font-medium text-gray-900 dark:text-white">{title}</span> still has{' '}
              {remaining} of {total} {total === 1 ? 'subtask' : 'subtasks'} unfinished.
            </p>

            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              {keyResultTitle ? (
                <>
                  Completing it counts it in full toward{' '}
                  <span className="font-medium text-gray-900 dark:text-white">{keyResultTitle}</span>
                  , not {Math.round((done / total) * 100)}%.
                </>
              ) : (
                <>Completing it counts it in full wherever it is measured, not {Math.round((done / total) * 100)}%.</>
              )}{' '}
              You can move it back at any time.
            </p>

            <div className="mt-5 flex justify-end gap-3">
              <button onClick={onCancel} className="btn-secondary">
                Cancel
              </button>
              <button onClick={onConfirm} className="btn-primary" autoFocus>
                Complete anyway
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CompleteTaskDialog
