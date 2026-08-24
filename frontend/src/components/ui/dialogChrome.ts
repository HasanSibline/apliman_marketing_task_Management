import { useEffect, useRef } from 'react'

/**
 * The behaviour every dialog in the app owes a keyboard, in one place.
 *
 * Escape closes, Tab stays inside, focus lands somewhere useful on open and returns
 * to whatever opened the dialog on close, the page behind stops scrolling, and the
 * page behind leaves the accessibility tree so a screen reader cannot wander out of
 * the dialog it is meant to be answering.
 *
 * It lives in its own module because of the counter. The body-overflow lock cannot be
 * a per-dialog save-and-restore: a confirmation opening on top of a form would save
 * "hidden" as the value to put back, and the first dialog to close would restore it
 * and leave the page locked with nothing on screen. Counting works only if every
 * dialog counts against the same number, which means one module, imported by all of
 * them, rather than a copy per component.
 */

interface StackEntry {
  /** The panel element, read late: it exists by the time anything asks. */
  panel: () => HTMLElement | null
}

/**
 * Every open dialog, oldest first. The last one is the one on top, and the only one
 * Escape may close.
 *
 * A counter alone is not enough. Each dialog listens on `document`, and
 * stopPropagation does nothing to listeners already attached to the same node, so a
 * confirmation opening over a form would close both on one Escape: the dialog being
 * answered, and the form behind it that the answer belonged to.
 */
const stack: StackEntry[] = []
let overflowBeforeAnyDialog = ''

/* ── Escape layers ────────────────────────────────────────────────────────────
 *
 * A dropdown, a popover or a menu opened inside a dialog owns Escape while it is
 * open: the key should shut the list and leave the form standing.
 *
 * Phase ordering alone cannot arrange that. The dialog listens on `document` in the
 * capture phase, which runs before the event has reached the control at all, so a
 * React onKeyDown on the dropdown calling stopPropagation is already too late: the
 * dialog has closed underneath it. That was the bug. Rather than have the two race
 * on phase, anything that wants Escape first says so, and the dialog stands down
 * while a layer is registered.
 */

interface EscapeLayer {
  close: () => void
}

const escapeLayers: EscapeLayer[] = []
let layerListener: ((e: KeyboardEvent) => void) | null = null

/**
 * Claim Escape for a transient layer, such as an open dropdown list. Returns the
 * function that gives it back; call it when the layer closes.
 *
 * Works whether or not a dialog is involved, so a dropdown on a plain page closes on
 * Escape too, and it is the topmost layer that answers when several are stacked.
 */
export function pushEscapeLayer(close: () => void): () => void {
  const layer: EscapeLayer = { close }
  escapeLayers.push(layer)

  if (!layerListener) {
    layerListener = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const top = escapeLayers[escapeLayers.length - 1]
      if (!top) return
      e.preventDefault()
      // Keeps the key from reaching the control it was pressed on, so nothing
      // handles it twice, and from reaching the page behind.
      e.stopPropagation()
      top.close()
    }
    document.addEventListener('keydown', layerListener, true)
  }

  return () => {
    const at = escapeLayers.indexOf(layer)
    if (at !== -1) escapeLayers.splice(at, 1)
    if (escapeLayers.length === 0 && layerListener) {
      document.removeEventListener('keydown', layerListener, true)
      layerListener = null
    }
  }
}

/* ── Hiding the page behind ──────────────────────────────────────────────────
 *
 * aria-modal alone is a promise, not a mechanism: support for it is uneven, and a
 * screen reader that ignores it will happily read the page underneath, which is the
 * one thing a modal exists to prevent. Marking the rest of the document inert is
 * what actually removes it, from the reading order and from the tab order both.
 *
 * Two things survive. Any open dialog panel, obviously. And anything that announces
 * asynchronously, because a toast reporting that the save failed is worth more while
 * the form is still open than after it closes. react-hot-toast tags its container
 * `data-rht-toaster`; `data-a11y-live` is there for anything else that needs the
 * same exemption.
 */

const KEEP_LIVE = '[data-rht-toaster], [data-a11y-live]'
const NEVER_HIDE = new Set(['SCRIPT', 'STYLE', 'LINK', 'TEMPLATE', 'NOSCRIPT'])

interface HiddenRecord {
  el: Element
  /** null when the element had no aria-hidden of its own to put back. */
  aria: string | null
  inert: boolean
}

let hiddenBehindDialogs: HiddenRecord[] = []

function showBackgroundAgain() {
  for (const record of hiddenBehindDialogs) {
    if (record.aria === null) record.el.removeAttribute('aria-hidden')
    else record.el.setAttribute('aria-hidden', record.aria)
    if (!record.inert) record.el.removeAttribute('inert')
  }
  hiddenBehindDialogs = []
}

/**
 * Recomputed rather than incremented, because which elements need hiding changes with
 * every dialog that opens or closes. A confirmation rendered inside the app tree and
 * a form portalled to the body sit in different branches, and the second one opening
 * has to un-hide the branch the first one lives in.
 */
function refreshBackground() {
  showBackgroundAgain()

  const panels = stack.map((entry) => entry.panel()).filter((el): el is HTMLElement => el !== null)
  if (panels.length === 0) return

  const walk = (parent: Element) => {
    for (const el of Array.from(parent.children)) {
      if (NEVER_HIDE.has(el.tagName)) continue
      // The panel itself, and anything that must keep announcing, are left alone
      // along with everything inside them.
      if (panels.includes(el as HTMLElement)) continue
      if (el.matches(KEEP_LIVE)) continue
      // On the path to something that has to stay: step over it and judge its
      // children individually rather than hiding the branch wholesale.
      if (panels.some((panel) => el.contains(panel)) || el.querySelector(KEEP_LIVE)) {
        walk(el)
        continue
      }
      hiddenBehindDialogs.push({
        el,
        aria: el.getAttribute('aria-hidden'),
        inert: el.hasAttribute('inert'),
      })
      el.setAttribute('aria-hidden', 'true')
      el.setAttribute('inert', '')
    }
  }

  walk(document.body)
}

const FOCUSABLE = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/**
 * Where the keyboard should land. The first focusable thing in a dialog is its close
 * button, which is the worst possible answer: it puts the keyboard on discard, so the
 * reflex of pressing Enter on a form throws it away. A field is what someone opening
 * a form came to use, so a field goes first if the dialog has one.
 */
const FIRST_FIELD = 'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])'

/**
 * A selector match is not enough to tab to something.
 *
 * A collapsed section, a tab panel that is not the open one, or a field inside a
 * `hidden` block all match the selector and none of them can take focus. Left in the
 * list they become the "first" or "last" element the trap wraps to, and the wrap
 * silently does nothing: Tab walks straight out of the dialog instead.
 */
function tabbableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
    if (el.getAttribute('aria-hidden') === 'true') return false
    if (el.closest('[inert]')) return false
    return el.getClientRects().length > 0
  })
}

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

    const me: StackEntry = { panel: () => panelRef.current }
    stack.push(me)

    returnFocusTo.current = document.activeElement

    const focusTimer = setTimeout(() => {
      const panel = panelRef.current
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus()
      } else if (panel) {
        // A field the author already marked wins, then any field, then whatever is
        // focusable at all for a dialog that is only a message and a button.
        const target =
          panel.querySelector<HTMLElement>('[autofocus]') ??
          panel.querySelector<HTMLElement>(FIRST_FIELD) ??
          tabbableWithin(panel)[0]
        target?.focus()
      }
      // After the move, not before: marking the page inert blurs whatever is focused
      // inside it, and doing that first would drop the keyboard on the body for a
      // frame before the dialog picked it up.
      refreshBackground()
    }, 50)

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // A dropdown or popover open inside the dialog answers first, and closing it
        // is the whole of what this Escape means.
        if (escapeLayers.length > 0) return
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
      const focusable = tabbableWithin(panelRef.current)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      // Clicking the backdrop, or a control that unmounted itself, leaves focus on
      // the body: neither the first element nor the last, so the wrap below would
      // not fire and Tab would walk into the page behind. Anything outside the panel
      // is pulled back to the near edge instead.
      if (!panelRef.current.contains(document.activeElement)) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
        return
      }

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

      // Before the focus goes back: the element that opened this dialog is out on the
      // page, and focusing it while the page is still inert would be refused.
      refreshBackground()
      ;(returnFocusTo.current as HTMLElement | null)?.focus?.()
    }
    // initialFocusRef is a ref object and stable; dismiss is read through a ref.
  }, [isOpen, initialFocusRef])

  return panelRef
}

export default useDialogChrome
