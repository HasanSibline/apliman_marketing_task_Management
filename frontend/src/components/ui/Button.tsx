import React from 'react'
import clsx from 'clsx'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

const base =
  'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-colors duration-200 ' +
  'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed'

const variants: Record<Variant, string> = {
  primary: 'bg-primary-600 text-white hover:bg-primary-700 shadow-sm',
  secondary:
    'bg-white text-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 shadow-sm ' +
    'dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700 dark:hover:bg-gray-700',
  danger: 'bg-error-600 text-white hover:bg-error-700 shadow-sm',
  ghost: 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800',
}

const sizes: Record<Size, string> = {
  sm: 'text-xs px-3 py-1.5',
  md: 'text-sm px-4 py-2',
  lg: 'text-sm px-6 py-3',
}

/** Shared button. Presentation-only wrapper over a native <button>. */
const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  leftIcon,
  rightIcon,
  className,
  children,
  disabled,
  ...rest
}) => (
  <button
    className={clsx(base, variants[variant], sizes[size], className)}
    disabled={disabled || loading}
    {...rest}
  >
    {loading && (
      <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
    )}
    {!loading && leftIcon}
    {children}
    {!loading && rightIcon}
  </button>
)

export default Button
