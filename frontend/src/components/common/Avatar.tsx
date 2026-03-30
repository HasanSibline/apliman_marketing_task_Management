import React, { useState } from 'react'
import { formatAssetUrl } from '@/services/api'

interface AvatarProps {
  src?: string | null
  name?: string
  className?: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  rounded?: 'full' | 'lg' | 'xl' | '2xl'
}

const sizeClasses = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-base',
}

/**
 * Avatar component that gracefully falls back to initials if the image fails to load.
 * Uses formatAssetUrl to build absolute URLs from relative paths.
 */
const Avatar: React.FC<AvatarProps> = ({
  src,
  name,
  className = '',
  size = 'md',
  rounded = 'lg',
}) => {
  const [imgError, setImgError] = useState(false)
  const resolvedSrc = src ? formatAssetUrl(src) : null
  const initial = name ? name.charAt(0).toUpperCase() : '?'

  const baseClass = `${sizeClasses[size]} rounded-${rounded} flex items-center justify-center overflow-hidden flex-shrink-0 ${className}`

  if (resolvedSrc && !imgError) {
    return (
      <img
        src={resolvedSrc}
        alt={name || 'Avatar'}
        className={`${sizeClasses[size]} rounded-${rounded} object-cover flex-shrink-0 ${className}`}
        onError={() => setImgError(true)}
      />
    )
  }

  return (
    <div className={baseClass + ' bg-primary-600 text-white font-bold'}>
      <span>{initial}</span>
    </div>
  )
}

export default Avatar
