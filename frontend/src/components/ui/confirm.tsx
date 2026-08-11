import React, { useEffect, useState } from 'react'
import ActionModal from './ActionModal'

/**
 * `confirm()` and `prompt()`, replaced without rewriting every caller.
 *
 * The browser's own dialogs were still doing eighteen jobs across the app. They look
 * like the operating system rather than the product, they name the domain in the
 * title bar, they cannot be styled or translated, they block the entire tab while
 * open, and Firefox lets people tick a box that suppresses them for good, at which
 * point every one of those confirmations silently answers "no" forever.
 *
 * The reason they survived is that they are *synchronous*: `if (!confirm(...)) return`
 * is one line in the middle of a handler, and the declarative alternative means
 * hoisting state, a pending action and a modal into each of fifteen components. So
 * this keeps the shape of the call and changes only the wait:
 *
 *   if (!(await confirmDialog({ title, description }))) return
 *
 * One host is mounted once, and these resolve against it.
 */

interface ConfirmOptions {
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'info' | 'success'
}

interface PromptOptions extends ConfirmOptions {
  /** Label above the field, e.g. "Reason". */
  inputLabel?: string
  placeholder?: string
  /** Offer these as choices, with a free-text option alongside. */
  choices?: string[]
}

type Pending = (ConfirmOptions | PromptOptions) & {
  requireReason: boolean
  resolve: (value: any) => void
}

let show: ((pending: Pending) => void) | null = null

/** Ask a yes or no question. Resolves false on cancel, Escape or backdrop. */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!show) {
      // The host is mounted at the app root, so this only happens if something asks
      // before React has mounted. Refusing is the safe answer: it cancels rather
      // than letting a destructive action through unasked.
      resolve(false)
      return
    }
    show({ ...options, requireReason: false, resolve })
  })
}

/** Ask for a line of text. Resolves null when dismissed. */
export function promptDialog(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    if (!show) {
      resolve(null)
      return
    }
    show({ ...options, requireReason: true, resolve })
  })
}

/** Mounted once, near the root. Everything above resolves through it. */
export const DialogHost: React.FC = () => {
  const [pending, setPending] = useState<Pending | null>(null)

  useEffect(() => {
    show = setPending
    return () => {
      show = null
    }
  }, [])

  const settle = (value: boolean | string | null) => {
    pending?.resolve(value)
    setPending(null)
  }

  const asPrompt = pending as PromptOptions | null

  return (
    <ActionModal
      isOpen={pending !== null}
      title={pending?.title ?? ''}
      description={pending?.description ?? ''}
      confirmText={pending?.confirmText ?? 'Confirm'}
      cancelText={pending?.cancelText ?? 'Cancel'}
      variant={pending?.variant ?? 'info'}
      requireReason={pending?.requireReason ?? false}
      reasonLabel={asPrompt?.inputLabel ?? 'Reason'}
      reasonPlaceholder={asPrompt?.placeholder ?? 'Add a reason'}
      reasons={asPrompt?.choices ?? []}
      // Dismissing a question is a no, and dismissing a prompt is nothing typed.
      onClose={() => settle(pending?.requireReason ? null : false)}
      onConfirm={(reason) => settle(pending?.requireReason ? (reason ?? '') : true)}
    />
  )
}

export default DialogHost
