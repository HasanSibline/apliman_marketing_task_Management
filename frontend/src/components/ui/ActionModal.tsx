import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  XMarkIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline'
import useDialogChrome from './dialogChrome'

/**
 * The dialog that asks before something happens.
 *
 * It had the shape right and the typography backwards. The description, the one line
 * telling you what you are about to do, was set in bold ten-pixel grey, which is the
 * treatment for a caption nobody needs to read; the title above it was larger than
 * the sentence that carried the meaning. It reads as prose now, because reading it is
 * the entire point of stopping here.
 *
 * The two buttons were identical halves of the width, which asks a question and
 * offers no answer. Confirm leads and cancel is quiet beside it, so the shape of the
 * dialog says what it expects, and cancel is still the safe thing Escape does.
 *
 * Escape closes it, the safe action takes focus on open, and focus returns to
 * whatever opened it on close. A dialog that traps a keyboard is worse than no dialog.
 */

interface ActionModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (reason?: string) => void
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'info' | 'success'
  requireReason?: boolean
  reasonPlaceholder?: string
  reasonLabel?: string
  reasons?: string[]
  isLoading?: boolean
  /**
   * What Escape, the backdrop and the X do, when that is not the same as cancelling.
   *
   * Usually dismissing and cancelling are one action. They are not when the cancel
   * button itself is destructive: the idle warning offers "Sign out now" there, and
   * wiring Escape to it would make the most reflexive key in the interface end the
   * session. Defaults to onClose, so every existing caller is unchanged.
   */
  onDismiss?: () => void
}

const VARIANTS = {
  danger: {
    Icon: ExclamationTriangleIcon,
    iconClass: 'text-red-600 dark:text-red-400',
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    confirm: 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-500',
  },
  warning: {
    Icon: ExclamationTriangleIcon,
    iconClass: 'text-amber-600 dark:text-amber-400',
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    confirm: 'bg-amber-600 hover:bg-amber-700 focus-visible:ring-amber-500',
  },
  success: {
    Icon: CheckCircleIcon,
    iconClass: 'text-emerald-600 dark:text-emerald-400',
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
    confirm: 'bg-emerald-600 hover:bg-emerald-700 focus-visible:ring-emerald-500',
  },
  info: {
    Icon: InformationCircleIcon,
    iconClass: 'text-primary-600 dark:text-primary-400',
    iconBg: 'bg-primary-50 dark:bg-primary-900/30',
    confirm: 'bg-primary-600 hover:bg-primary-700 focus-visible:ring-primary-500',
  },
} as const

const ActionModal: React.FC<ActionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'info',
  requireReason = false,
  reasonPlaceholder = 'Add a reason',
  reasonLabel = 'Reason',
  reasons = [],
  isLoading = false,
  onDismiss,
}) => {
  const dismiss = onDismiss ?? onClose
  const [reason, setReason] = useState('')
  const [picked, setPicked] = useState('')
  const cancelRef = useRef<HTMLButtonElement>(null)

  const { Icon, iconClass, iconBg, confirm } = VARIANTS[variant]

  // A free-text reason is what gets sent; a chosen one fills it in, and picking
  // "Something else" hands the field back rather than leaving a value behind.
  const usingList = reasons.length > 0
  const effectiveReason = usingList && picked && picked !== 'other' ? picked : reason

  // Escape, the Tab trap, the scroll lock and focus restore. Shared with FormDialog
  // rather than kept here, so the two cannot each keep their own count of how many
  // dialogs are open and leave the page locked when a confirmation closes over a form.
  // The safe option takes focus, so a stray Enter cannot confirm anything.
  const panelRef = useDialogChrome({ isOpen, onDismiss: dismiss, initialFocusRef: cancelRef })

  useEffect(() => {
    if (!isOpen) {
      setReason('')
      setPicked('')
    }
  }, [isOpen])

  const handleConfirm = () => {
    onConfirm(requireReason ? effectiveReason : undefined)
  }

  const blocked = isLoading || (requireReason && !effectiveReason.trim())

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={dismiss}
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
          />

          <motion.div
            ref={panelRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="action-modal-title"
            aria-describedby="action-modal-description"
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            transition={{ duration: 0.16 }}
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800"
          >
            <div className="flex items-start gap-4 p-6">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${iconBg}`}>
                <Icon className={`h-6 w-6 ${iconClass}`} aria-hidden="true" />
              </div>

              <div className="min-w-0 flex-1">
                <h2
                  id="action-modal-title"
                  className="text-base font-semibold text-gray-900 dark:text-white"
                >
                  {title}
                </h2>
                <p
                  id="action-modal-description"
                  className="mt-1.5 text-sm leading-relaxed text-gray-600 dark:text-gray-300"
                >
                  {description}
                </p>
              </div>

              <button
                aria-label="Close"
                onClick={dismiss}
                className="-mr-1 -mt-1 shrink-0 rounded p-1 text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-200"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {requireReason && (
              <div className="space-y-3 px-6 pb-2">
                {usingList && (
                  <div>
                    <label htmlFor="action-modal-choice" className="form-label">
                      {reasonLabel}
                    </label>
                    <select
                      id="action-modal-choice"
                      value={picked}
                      onChange={(e) => setPicked(e.target.value)}
                      className="select-field"
                    >
                      <option value="">Choose one</option>
                      {reasons.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                      <option value="other">Something else</option>
                    </select>
                  </div>
                )}

                {(!usingList || picked === 'other') && (
                  <div>
                    <label htmlFor="action-modal-reason" className="form-label">
                      {usingList ? 'Tell us more' : reasonLabel}
                    </label>
                    <textarea
                      id="action-modal-reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={reasonPlaceholder}
                      rows={3}
                      autoFocus
                      className="input-field resize-none"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Confirm leads, cancel sits quietly beside it. Equal halves make the
                dialog ask a question without suggesting an answer. */}
            <div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50 px-6 py-4 dark:border-gray-700 dark:bg-gray-900/40">
              <button ref={cancelRef} onClick={onClose} className="btn-secondary">
                {cancelText}
              </button>
              <button
                onClick={handleConfirm}
                disabled={blocked}
                className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-gray-800 ${confirm}`}
              >
                {isLoading ? 'Working…' : confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

export default ActionModal
