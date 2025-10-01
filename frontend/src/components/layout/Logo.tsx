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
                src="/Apliman logo.webp"
        alt="Apliman Logo"
        className={`${sizeClasses[size]} w-auto`}
      />
    </Link>
  )
}

export default Logo
