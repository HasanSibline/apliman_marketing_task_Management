import React from 'react'
import clsx from 'clsx'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padded?: boolean
}

/** Standard surface. Radius/shadow/border unified across the app. */
const Card: React.FC<CardProps> = ({ padded = true, className, children, ...rest }) => (
  <div
    className={clsx(
      'bg-white rounded-xl border border-gray-200 shadow-sm',
      'dark:bg-gray-800 dark:border-gray-700',
      padded && 'p-6',
      className,
    )}
    {...rest}
  >
    {children}
  </div>
)

export default Card
