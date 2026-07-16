import React from 'react'
import clsx from 'clsx'

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Tailwind width/height utilities or arbitrary sizes via className. */
  rounded?: string
}

/** Lightweight shimmer placeholder for loading states. */
const Skeleton: React.FC<SkeletonProps> = ({ rounded = 'rounded-md', className, ...rest }) => (
  <div
    className={clsx('animate-pulse bg-gray-200 dark:bg-gray-700', rounded, className)}
    {...rest}
  />
)

export default Skeleton
