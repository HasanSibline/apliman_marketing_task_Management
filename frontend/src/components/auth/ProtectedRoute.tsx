import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAppSelector } from '@/hooks/redux'

interface ProtectedRouteProps {
  children: React.ReactNode
  roles?: ('SUPER_ADMIN' | 'COMPANY_ADMIN' | 'ADMIN' | 'EMPLOYEE')[]
  checkStrategy?: boolean
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, roles, checkStrategy }) => {
  const { isAuthenticated, user } = useAppSelector((state) => state.auth)
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  const isAdmin = user && ['SUPER_ADMIN', 'COMPANY_ADMIN', 'ADMIN'].includes(user.role)

  if (checkStrategy) {
    if (!isAdmin && !user?.canAccessStrategy) {
      return <Navigate to="/dashboard" replace />
    }
  } else if (roles && user && !roles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

export default ProtectedRoute
