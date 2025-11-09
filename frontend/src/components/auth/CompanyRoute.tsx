import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAppSelector } from '@/hooks/redux';

interface CompanyRouteProps {
  children: React.ReactNode;
}

/**
 * CompanyRoute - Protects Company routes
 * Only allows users WITH a company (companyId != null)
 * Redirects System Admins to their admin portal
 */
const CompanyRoute: React.FC<CompanyRouteProps> = ({ children }) => {
  const { user, isAuthenticated } = useAppSelector((state) => state.auth);
  const location = useLocation();

  useEffect(() => {
    // Log access attempts for security monitoring
    if (isAuthenticated && user) {
      if (user.role === 'SUPER_ADMIN' && !user.companyId) {
        console.warn(
          `System Admin attempted to access company route: ${location.pathname}`
        );
      }
    }
  }, [isAuthenticated, user, location]);

  // Not authenticated -> redirect to company login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // System Admin with NO company -> redirect to admin portal
  if (user?.role === 'SUPER_ADMIN' && !user?.companyId) {
    console.warn('System Admins should use the admin portal at /admin');
    return <Navigate to="/admin/companies" replace />;
  }

  // User must have a company
  if (!user?.companyId) {
    console.error('Access denied: No company assigned to user');
    return <Navigate to="/login" replace />;
  }

  // Valid company user -> allow access
  return <>{children}</>;
};

export default CompanyRoute;

