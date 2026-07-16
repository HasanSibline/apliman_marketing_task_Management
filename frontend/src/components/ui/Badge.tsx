import React from 'react'
import clsx from 'clsx'

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'error'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
}

const tones: Record<Tone, string> = {
  neutral: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
  primary: 'bg-primary-50 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300',
  success: 'bg-success-100 text-success-800 dark:bg-success-900/40 dark:text-success-300',
  warning: 'bg-warning-100 text-warning-800 dark:bg-warning-900/40 dark:text-warning-300',
  error: 'bg-error-100 text-error-800 dark:bg-error-900/40 dark:text-error-300',
}

/** Status/label pill. */
const Badge: React.FC<BadgeProps> = ({ tone = 'neutral', className, children, ...rest }) => (
  <span
    className={clsx(
      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
      tones[tone],
      className,
    )}
    {...rest}
  >
    {children}
  </span>
)

export default Badge
