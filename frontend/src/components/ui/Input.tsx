import React from 'react'
import clsx from 'clsx'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

/** Labeled text input built on the shared field styling. */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, 'aria-describedby': describedBy, ...rest }, ref) => {
    /**
     * An id is not optional here, it is the whole of the label association.
     *
     * This used to be `id || rest.name`, which quietly produced `undefined` for an
     * input given neither. The label then pointed at nothing, and the control was
     * announced as an unnamed edit field: the exact failure a labelled input
     * component exists to prevent.
     */
    const generated = React.useId()
    const inputId = id || rest.name || generated
    const errorId = `${inputId}-error`
    const hintId = `${inputId}-hint`

    // The message under the field is the one that explains the field, so it has to
    // be attached to it. Read out on focus this way, rather than only sitting on
    // screen for whoever can see it.
    const described =
      [describedBy, error ? errorId : null, !error && hint ? hintId : null].filter(Boolean).join(' ') || undefined

    return (
      <div>
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={described}
          className={clsx(
            'block w-full px-3 py-2 rounded-lg border shadow-sm text-sm transition-colors duration-200',
            'placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500',
            'dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500',
            error
              ? 'border-error-500 dark:border-error-500'
              : 'border-gray-300 dark:border-gray-700',
            className,
          )}
          {...rest}
        />
        {error ? (
          // A validation message that appears after a submit is new information, and
          // announcing it is the only way anyone not watching the field finds out.
          <p id={errorId} role="alert" className="mt-1 text-xs text-error-600 dark:text-error-400">
            {error}
          </p>
        ) : hint ? (
          <p id={hintId} className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {hint}
          </p>
        ) : null}
      </div>
    )
  },
)

Input.displayName = 'Input'
export default Input
