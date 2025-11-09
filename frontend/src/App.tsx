import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { checkAuth } from '@/store/slices/authSlice'
import { initializeSocket } from '@/store/slices/presenceSlice'
import PublicRoute from '@/components/auth/PublicRoute'
import AdminRoute from '@/components/auth/AdminRoute'
import CompanyRoute from '@/components/auth/CompanyRoute'
import Layout from '@/components/layout/Layout'
import LoadingScreen from '@/components/ui/LoadingScreen'
import { keepAliveService } from '@/services/keepalive'

// Pages
import LoginPage from '@/pages/auth/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import TasksPage from '@/pages/tasks/TasksPage'
import TaskDetailPage from '@/pages/tasks/TaskDetailPage'
import WorkflowsPage from '@/pages/workflows/WorkflowsPage'
import UsersPage from '@/pages/users/UsersPage'
import AnalyticsPage from '@/pages/analytics/AnalyticsPage'
import ProfilePage from '@/pages/ProfilePage'
import ActivityPage from '@/pages/ActivityPage'
import NotFoundPage from '@/pages/NotFoundPage'
import KnowledgeSourcesPage from '@/pages/admin/KnowledgeSourcesPage'

// Super Admin Pages
import AdminLogin from '@/pages/AdminLogin'
import AdminLayout from '@/components/layout/AdminLayout'
import SuperAdminDashboard from '@/pages/SuperAdminDashboard'
import CreateCompany from '@/pages/CreateCompany'
import CompanyDetails from '@/pages/CompanyDetails'

function App() {
  const dispatch = useAppDispatch()
  const { isAuthenticated, isLoading, user } = useAppSelector((state) => state.auth)

  useEffect(() => {
    dispatch(checkAuth())
    
    // Start keepalive service to prevent AI service from sleeping
    keepAliveService.start()
    
    // Cleanup on unmount
    return () => {
      keepAliveService.stop()
    }
  }, [dispatch])

  useEffect(() => {
    if (isAuthenticated && user) {
      dispatch(initializeSocket())
    }
  }, [dispatch, isAuthenticated, user])

  // Start keepalive service to prevent Render services from sleeping
  useEffect(() => {
    keepAliveService.start()
    
    // Cleanup on unmount
    return () => {
      keepAliveService.stop()
    }
  }, [])

  if (isLoading) {
    return <LoadingScreen />
  }

  return (
    <Routes>
        {/* Public Routes */}
        <Route
          path="/login"
          element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          }
        />

        {/* System Admin Login (Separate Portal) */}
        <Route
          path="/admin/login"
          element={
            <PublicRoute>
              <AdminLogin />
            </PublicRoute>
          }
        />

        {/* System Admin Portal (Separate from Company Portal) */}
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminLayout />
            </AdminRoute>
          }
        >
          <Route index element={<Navigate to="/admin/companies" replace />} />
          <Route path="companies" element={<SuperAdminDashboard />} />
          <Route path="companies/create" element={<CreateCompany />} />
          <Route path="companies/:id" element={<CompanyDetails />} />
          <Route path="companies/:id/edit" element={<CreateCompany />} />
        </Route>

        {/* Company Portal Routes (Protected) */}
        <Route
          path="/"
          element={
            <CompanyRoute>
              <Layout />
            </CompanyRoute>
          }
        >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="tasks/:id" element={<TaskDetailPage />} />
        <Route path="workflows" element={<WorkflowsPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="admin/knowledge-sources" element={<KnowledgeSourcesPage />} />
      </Route>

      {/* 404 Route */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default App
