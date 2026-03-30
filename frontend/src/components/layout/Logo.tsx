import React from 'react'
import { Link } from 'react-router-dom'
import logoImage from '@/assets/apliman-logo.webp'

import { useAppSelector } from '@/hooks/redux'
import { formatAssetUrl } from '@/services/api'

interface LogoProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

const Logo: React.FC<LogoProps> = ({ className = '', size = 'md' }) => {
  const { user } = useAppSelector((state) => state.auth)
  
  const sizeClasses = {
    sm: 'h-6',
    md: 'h-8',
    lg: 'h-10',
  }

  // Determine logo source: company custom logo or default fallback
  const logoSrc = user?.companyLogo ? formatAssetUrl(user.companyLogo) : logoImage;

  return (
    <Link to="/" className={`flex items-center ${className}`}>
      <img
        src={logoSrc}
        alt={user?.companyId ? "Company Logo" : "Apliman Logo"}
        className={`${sizeClasses[size]} w-auto object-contain max-w-full`}
      />
    </Link>
  )
}

export default Logo
