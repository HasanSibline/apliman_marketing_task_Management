import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAppSelector } from '@/hooks/redux';

interface AdminRouteProps {
  children: React.ReactNode;
}

/**
 * AdminRoute - Protects System Admin routes
 * Only allows SUPER_ADMIN users with NO company (companyId = null)
 * Redirects company users to their dashboard
 */
const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
  const { user, isAuthenticated } = useAppSelector((state) => state.auth);
  const location = useLocation();

  useEffect(() => {
    // Log access attempts for security monitoring
    if (isAuthenticated && user) {
      if (user.role !== 'SUPER_ADMIN' || user.companyId !== null) {
        console.warn(
          `Unauthorized admin route access attempt by ${user.email} (role: ${user.role}, companyId: ${user.companyId})`
        );
      }
    }
  }, [isAuthenticated, user]);

  // Not authenticated -> redirect to admin login
  if (!isAuthenticated) {
    return <Navigate to="/admin/login" state={{ from: location }} replace />;
  }

  // Authenticated but not SUPER_ADMIN or has a company -> redirect to company portal
  if (user?.role !== 'SUPER_ADMIN' || user?.companyId !== null) {
    console.error('Access denied: This portal is for System Administrators only');
    return <Navigate to="/dashboard" replace />;
  }

  // Valid System Admin -> allow access
  return <>{children}</>;
};

export default AdminRoute;

