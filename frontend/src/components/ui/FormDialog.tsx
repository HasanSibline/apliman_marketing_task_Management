import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { XMarkIcon } from '@heroicons/react/24/outline'
import useDialogChrome from './dialogChrome'

/**
 * The shell every form in the app is served in.
 *
 * Each modal used to draw its own. Backdrops came in three opacities, panels in four
 * radii, z-indexes ran from 10 to 9999, and the buttons at the bottom were re-styled
 * by hand every time, so no two dialogs agreed on what a primary action looked like.
 * None of that was a decision; it was fourteen separate afternoons.
 *
 * Two things here are structural rather than cosmetic:
 *
 * The panel is a column with a fixed ceiling, and only the middle of it scrolls. The
 * hand-rolled dialogs scrolled as one piece, so on a long form, or any form on a
 * laptop, Save left the screen: you filled in the last field and had nowhere to go
 * but back up. Header and footer are pinned now, so the action is always reachable.
 *
 * The footer states its own order. Submit leads, cancel is quiet beside it, and both
 * are the app's buttons rather than a local approximation of them.
 *
 * Keyboard behaviour comes from useDialogChrome, shared with ActionModal so that a
 * confirmation opening on top of a form cannot fight it over the body scroll lock.
 */

export type DialogWidth = 'sm' | 'md' | 'lg' | 'xl'

const WIDTHS: Record<DialogWidth, string> = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
}

interface FormDialogProps {
  isOpen: boolean
  /** Escape, the backdrop and the X. */
  onClose: () => void
  title: string
  /** One line saying what this form is for. Optional, but usually worth it. */
  description?: string
  /** A small icon tile beside the title, for dialogs that benefit from one. */
  icon?: React.ReactNode
  width?: DialogWidth
  children: React.ReactNode
  /**
   * The pinned action row. Omit it for a dialog whose body already ends in its own
   * actions, and pass `noForm` in that case too.
   */
  footer?: React.ReactNode
  /**
   * Wraps the body in a <form> and submits it. Without this the dialog is a plain
   * container, which is what read-only detail panels want.
   */
  onSubmit?: (e: React.FormEvent) => void
  /** Blocks the X and the backdrop while something is in flight. */
  busy?: boolean
  /** Removes the body's default padding, for panels that manage their own. */
  flush?: boolean
  /**
   * Set false while something else is layered over this dialog that is not itself a
   * dialog, so Escape does not close the form out from under it. CreateTaskModal's AI
   * preview is the case: it renders as a sibling overlay, and without this Escape
   * would dismiss the form beneath and leave the preview pointing at nothing.
   */
  dismissible?: boolean
}

const FormDialog: React.FC<FormDialogProps> = ({
  isOpen,
  onClose,
  title,
  description,
  icon,
  width = 'md',
  children,
  footer,
  onSubmit,
  busy = false,
  flush = false,
  dismissible = true,
}) => {
  // A dialog mid-save is not in a state anyone can safely back out of, so Escape and
  // the backdrop go quiet until it settles rather than closing over the top of it.
  const dismiss = React.useCallback(() => {
    if (!busy && dismissible) onClose()
  }, [busy, dismissible, onClose])

  const panelRef = useDialogChrome({ isOpen, onDismiss: dismiss })

  const body = (
    <>
      <div className={`min-h-0 flex-1 overflow-y-auto ${flush ? '' : 'px-6 py-5'}`}>{children}</div>
      {footer && (
        <div className="flex flex-shrink-0 items-center justify-end gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-700 dark:bg-gray-900/40">
          {footer}
        </div>
      )}
    </>
  )

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={dismiss}
            className="absolute inset-0 bg-gray-950/60 backdrop-blur-[2px]"
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className={`relative flex max-h-[calc(100vh-3rem)] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-gray-900/5 dark:bg-gray-800 dark:ring-white/10 ${WIDTHS[width]}`}
          >
            <div className="flex flex-shrink-0 items-start gap-4 border-b border-gray-200 px-6 py-5 dark:border-gray-700">
              {icon && <div className="mt-0.5 flex-shrink-0">{icon}</div>}
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
                {description && (
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={dismiss}
                disabled={busy || !dismissible}
                aria-label="Close"
                className="-mr-1.5 -mt-1 flex-shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {onSubmit ? (
              <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
                {body}
              </form>
            ) : (
              body
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

export default FormDialog
