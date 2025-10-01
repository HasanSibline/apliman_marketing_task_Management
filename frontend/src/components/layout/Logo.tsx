import React from 'react'
import { Link } from 'react-router-dom'

interface LogoProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

const Logo: React.FC<LogoProps> = ({ className = '', size = 'md' }) => {
  const sizeClasses = {
    sm: 'h-6',
    md: 'h-8',
    lg: 'h-10',
  }

  return (
    <Link to="/" className={`flex items-center ${className}`}>
      <img
        src="/logo.png"
        alt="Apliman Logo"
        className={`${sizeClasses[size]} w-auto`}
      />
      <span className={`ml-2 font-semibold text-gray-900 ${
        size === 'sm' ? 'text-lg' :
        size === 'md' ? 'text-xl' :
        'text-2xl'
      }`}>
        Apliman
      </span>
    </Link>
  )
}

export default Logo
