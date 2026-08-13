import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckIcon } from '@heroicons/react/24/outline'

/**
 * The Aura dropdown, list included.
 *
 * A native <select> can be styled down to the last pixel and still open a list drawn
 * by the operating system: grey on Windows, translucent on macOS, full-screen on
 * Android, and identical in a dark app to a light one. Half the control was ours and
 * the half people actually read was not. This owns both halves.
 *
 * It is a drop-in for the element it replaces. It takes the same <option> children,
 * including the ones produced by a .map, and calls onChange with an object shaped
 * like a change event, so every `e.target.value` handler in the app keeps working
 * untouched. Converting a call site is renaming the tag.
 *
 * The list is portalled to document.body and positioned against the trigger, because
 * a dropdown inside a dialog with a scrolling body gets clipped by it. That also
 * means it cannot be trapped in the stacking context the page content sits in.
 *
 * Keyboard: Enter, Space, or either arrow opens it; arrows move; Home and End jump;
 * typing jumps to a matching label; Enter or Tab commits; Escape closes without
 * changing anything. Native selects do all of this and losing it would make the
 * prettier control the worse one.
 *
 * The one native behaviour it does not reproduce is constraint validation. `required`
 * is passed through to aria-required so it is announced, but a button takes no part
 * in a form's validity, so a form that leaned on the browser to block an empty
 * selection has to check that itself. Two call sites used `required`; one could never
 * be empty, and the other now validates in its submit handler.
 */

interface Opt {
  value: string
  label: string
  disabled: boolean
  /** The optgroup this sits under, if any. */
  group?: string
}

/** Reads <option> and <optgroup> children into a flat list, ignoring nulls and arrays. */
function readOptions(children: React.ReactNode, group?: string): Opt[] {
  const out: Opt[] = []
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return
    if (child.type === 'optgroup') {
      const props = child.props as { label?: string; children?: React.ReactNode }
      out.push(...readOptions(props.children, props.label))
      return
    }
    if (child.type !== 'option') return
    const props = child.props as { value?: string | number; children?: React.ReactNode; disabled?: boolean }
    out.push({
      value: String(props.value ?? ''),
      label: React.Children.toArray(props.children).join('').trim(),
      disabled: Boolean(props.disabled),
      group,
    })
  })
  return out
}

interface SelectProps {
  value?: string | number
  /**
   * Called with an object shaped like a change event.
   *
   * Typed loosely on purpose. Several call sites share one handler between inputs
   * and selects, annotated `ChangeEvent<HTMLInputElement | HTMLSelectElement>`, and a
   * narrower type here would reject every one of them and force the handler to be
   * split in two. The shape passed is the part those handlers actually read.
   */
  onChange?: (e: any) => void
  name?: string
  id?: string
  disabled?: boolean
  required?: boolean
  className?: string
  /** Applied to the trigger, for the one control that carries its phase's colour. */
  style?: React.CSSProperties
  children?: React.ReactNode
  'aria-label'?: string
}

const Select: React.FC<SelectProps> = ({
  value,
  onChange,
  name = '',
  id,
  disabled = false,
  required,
  className = '',
  style,
  children,
  'aria-label': ariaLabel,
}) => {
  const options = readOptions(children)
  const current = String(value ?? '')
  const selected = options.find((o) => o.value === current)

  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [box, setBox] = useState<{ top: number; left: number; width: number; drop: boolean }>({
    top: 0,
    left: 0,
    width: 0,
    drop: true,
  })

  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const typed = useRef({ term: '', at: 0 })
  const listId = useId()

  const place = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    // Opens upward when there is more room above, so a control near the bottom of the
    // window does not push its list off the screen.
    const below = window.innerHeight - r.bottom
    const drop = below > 240 || below > r.top
    setBox({ top: drop ? r.bottom + 6 : r.top - 6, left: r.left, width: r.width, drop })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    place()
    // Capture phase, so a scroll inside a dialog body repositions the list too, not
    // just a scroll of the page.
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) return
      if (listRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    const i = options.findIndex((o) => o.value === current)
    setActive(i >= 0 ? i : 0)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the highlighted row in view when arrowing past the edge of the list.
  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const commit = (opt: Opt) => {
    if (opt.disabled) return
    // `type` is included because handlers shared with inputs branch on it to spot
    // checkboxes; without it the read is undefined and the branch is merely luckily
    // false. A native select reports select-one, so that is what this reports.
    onChange?.({ target: { value: opt.value, name, type: 'select-one' } })
    setOpen(false)
    triggerRef.current?.focus()
  }

  const step = (from: number, dir: 1 | -1) => {
    for (let i = from + dir; i >= 0 && i < options.length; i += dir) {
      if (!options[i].disabled) return i
    }
    return from
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return

    if (!open) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault()
        setOpen(true)
      }
      return
    }

    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        e.stopPropagation() // or a dialog behind this would close along with the list
        setOpen(false)
        return
      case 'ArrowDown':
        e.preventDefault()
        setActive((i) => step(i, 1))
        return
      case 'ArrowUp':
        e.preventDefault()
        setActive((i) => step(i, -1))
        return
      case 'Home':
        e.preventDefault()
        setActive(step(-1, 1))
        return
      case 'End':
        e.preventDefault()
        setActive(step(options.length, -1))
        return
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (options[active]) commit(options[active])
        return
      case 'Tab':
        // Tab commits and moves on, rather than abandoning the highlighted row.
        if (options[active]) commit(options[active])
        return
    }

    // Type-ahead. The buffer resets after a pause, so "de" finds Design and a later
    // "d" starts again rather than searching for "ded".
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const now = Date.now()
      typed.current.term = now - typed.current.at > 800 ? e.key : typed.current.term + e.key
      typed.current.at = now
      const term = typed.current.term.toLowerCase()
      const hit = options.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(term))
      if (hit >= 0) setActive(hit)
    }
  }

  let lastGroup: string | undefined

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        aria-required={required}
        style={style}
        // select-field carries the well and the chevron; this only has to add the
        // alignment a button needs and the placeholder colour a button has no notion of.
        className={`select-field flex items-center text-left ${
          selected?.label ? '' : 'text-gray-400 dark:text-gray-500'
        } ${className}`}
      >
        {/* min-w-0, or a flex item refuses to shrink below its content and the
            truncation never engages: a long label widens the control instead. */}
        <span className="min-w-0 truncate">{selected?.label || 'Select…'}</span>
      </button>

      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.ul
              ref={listRef}
              id={listId}
              role="listbox"
              initial={{ opacity: 0, y: box.drop ? -4 : 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: box.drop ? -4 : 4 }}
              transition={{ duration: 0.12 }}
              style={{
                position: 'fixed',
                top: box.drop ? box.top : undefined,
                bottom: box.drop ? undefined : window.innerHeight - box.top,
                left: box.left,
                width: box.width,
              }}
              className="z-[200] max-h-60 overflow-y-auto overscroll-contain rounded-lg border border-gray-200 bg-white py-1 shadow-xl ring-1 ring-gray-900/5 dark:border-gray-700 dark:bg-gray-800 dark:ring-white/10"
            >
              {options.map((o, i) => {
                const header = o.group && o.group !== lastGroup ? o.group : null
                lastGroup = o.group
                const isSelected = o.value === current
                return (
                  <React.Fragment key={`${o.value}-${i}`}>
                    {header && (
                      <li
                        role="presentation"
                        className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500"
                      >
                        {header}
                      </li>
                    )}
                    <li
                      data-i={i}
                      id={`${listId}-${i}`}
                      role="option"
                      aria-selected={isSelected}
                      aria-disabled={o.disabled || undefined}
                      onMouseEnter={() => !o.disabled && setActive(i)}
                      onClick={() => commit(o)}
                      className={`mx-1 flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors ${
                        o.disabled
                          ? 'cursor-not-allowed text-gray-400 dark:text-gray-600'
                          : i === active
                            ? 'bg-primary-50 text-primary-900 dark:bg-primary-900/30 dark:text-primary-100'
                            : 'text-gray-700 dark:text-gray-200'
                      }`}
                    >
                      <span className="flex-1 truncate">{o.label}</span>
                      {isSelected && <CheckIcon className="h-4 w-4 flex-shrink-0 text-primary-600 dark:text-primary-400" />}
                    </li>
                  </React.Fragment>
                )
              })}

              {options.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                  Nothing to choose from yet.
                </li>
              )}
            </motion.ul>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}

export default Select
