import React from 'react'
import clsx from 'clsx'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

/** Labeled text input built on the shared field styling. */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, ...rest }, ref) => {
    const inputId = id || rest.name
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
          <p className="mt-1 text-xs text-error-600">{error}</p>
        ) : hint ? (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</p>
        ) : null}
      </div>
    )
  },
)

Input.displayName = 'Input'
export default Input
