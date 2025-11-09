import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAppSelector } from '@/hooks/redux';
import api from '@/services/api';

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
  const [companySlug, setCompanySlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCompanySlug = async () => {
      if (user?.companyId) {
        try {
          // Fetch company slug for proper redirect
          const response = await api.get(`/public/companies/by-slug/apliman`);
          // For now, we'll use a default. In production, you'd fetch the user's company slug
          setCompanySlug('apliman');
        } catch (err) {
          console.error('Failed to fetch company slug:', err);
          setCompanySlug('apliman'); // Fallback
        }
      }
      setLoading(false);
    };

    fetchCompanySlug();
  }, [user?.companyId]);

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

  // Not authenticated -> redirect to default company login (Apliman)
  if (!isAuthenticated) {
    return <Navigate to="/apliman/login" state={{ from: location }} replace />;
  }

  // System Admin with NO company -> redirect to admin portal
  if (user?.role === 'SUPER_ADMIN' && !user?.companyId) {
    console.warn('System Admins should use the admin portal at /admin');
    return <Navigate to="/admin/companies" replace />;
  }

  // User must have a company
  if (!user?.companyId) {
    console.error('Access denied: No company assigned to user');
    return <Navigate to="/apliman/login" replace />;
  }

  // Valid company user -> allow access
  return <>{children}</>;
};

export default CompanyRoute;

