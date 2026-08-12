import { useEffect, useRef } from 'react'

/**
 * The behaviour every dialog in the app owes a keyboard, in one place.
 *
 * Escape closes, Tab stays inside, focus lands somewhere useful on open and returns
 * to whatever opened the dialog on close, and the page behind stops scrolling.
 *
 * It lives in its own module because of the counter. The body-overflow lock cannot be
 * a per-dialog save-and-restore: a confirmation opening on top of a form would save
 * "hidden" as the value to put back, and the first dialog to close would restore it
 * and leave the page locked with nothing on screen. Counting works only if every
 * dialog counts against the same number, which means one module, imported by all of
 * them, rather than a copy per component.
 */

/**
 * Every open dialog, oldest first. The last one is the one on top, and the only one
 * Escape may close.
 *
 * A counter alone is not enough. Each dialog listens on `document`, and
 * stopPropagation does nothing to listeners already attached to the same node, so a
 * confirmation opening over a form would close both on one Escape: the dialog being
 * answered, and the form behind it that the answer belonged to.
 */
const stack: symbol[] = []
let overflowBeforeAnyDialog = ''

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

/**
 * Where the keyboard should land. The first focusable thing in a dialog is its close
 * button, which is the worst possible answer: it puts the keyboard on discard, so the
 * reflex of pressing Enter on a form throws it away. A field is what someone opening
 * a form came to use, so a field goes first if the dialog has one.
 */
const FIRST_FIELD = 'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])'

interface DialogChromeOptions {
  isOpen: boolean
  /** What Escape and the backdrop do. */
  onDismiss: () => void
  /** Given focus on open. Falls back to the first focusable thing in the panel. */
  initialFocusRef?: React.RefObject<HTMLElement>
}

export function useDialogChrome({ isOpen, onDismiss, initialFocusRef }: DialogChromeOptions) {
  const panelRef = useRef<HTMLDivElement>(null)
  const returnFocusTo = useRef<Element | null>(null)

  // Held in a ref so a caller passing an inline arrow does not tear down and rebuild
  // the listener on every render, which would drop the scroll lock mid-dialog.
  const dismissRef = useRef(onDismiss)
  dismissRef.current = onDismiss

  useEffect(() => {
    if (!isOpen) return

    const me = Symbol('dialog')
    stack.push(me)

    returnFocusTo.current = document.activeElement

    const focusTimer = setTimeout(() => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus()
        return
      }
      const panel = panelRef.current
      if (!panel) return
      // A field the author already marked wins, then any field, then whatever is
      // focusable at all for a dialog that is only a message and a button.
      const target =
        panel.querySelector<HTMLElement>('[autofocus]') ??
        panel.querySelector<HTMLElement>(FIRST_FIELD) ??
        panel.querySelector<HTMLElement>(FOCUSABLE)
      target?.focus()
    }, 50)

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Only the dialog on top answers. Without this every open dialog closes at
        // once, because they all listen on document and none can silence the others.
        if (stack[stack.length - 1] !== me) return
        e.stopPropagation()
        dismissRef.current()
        return
      }

      // Tabbing onto the page behind a modal leaves a keyboard somewhere it cannot
      // see and cannot get back from.
      if (e.key !== 'Tab' || !panelRef.current) return
      // Same reason as Escape: a form under a confirmation must not pull Tab back
      // into itself and out of the dialog actually being answered.
      if (stack[stack.length - 1] !== me) return
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)

    // The page behind must not scroll under a dialog. Taken from the stack rather
    // than saved and restored per dialog: a second dialog would otherwise record
    // "hidden" as the value to put back, and the first to close would restore it and
    // leave the page locked with nothing on screen.
    if (stack.length === 1) {
      overflowBeforeAnyDialog = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }

    return () => {
      clearTimeout(focusTimer)
      document.removeEventListener('keydown', onKeyDown, true)

      const at = stack.indexOf(me)
      if (at !== -1) stack.splice(at, 1)
      if (stack.length === 0) document.body.style.overflow = overflowBeforeAnyDialog
      ;(returnFocusTo.current as HTMLElement | null)?.focus?.()
    }
    // initialFocusRef is a ref object and stable; dismiss is read through a ref.
  }, [isOpen, initialFocusRef])

  return panelRef
}

export default useDialogChrome
