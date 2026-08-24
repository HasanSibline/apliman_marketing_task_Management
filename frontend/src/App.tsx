import React, { Suspense, lazy, useEffect } from 'react'
import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { store } from '@/store'
import { checkAuth, clearSession } from '@/store/slices/authSlice'
import { UNAUTHORIZED_EVENT } from '@/services/api'
import { initializeSocket, disconnectSocket } from '@/store/slices/presenceSlice'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import PublicRoute from '@/components/auth/PublicRoute'
import AdminRoute from '@/components/auth/AdminRoute'
import CompanyRoute from '@/components/auth/CompanyRoute'
import Layout from '@/components/layout/Layout'
import LoadingScreen from '@/components/ui/LoadingScreen'
import { DialogHost } from '@/components/ui/confirm'
import IdleTimeout from '@/components/auth/IdleTimeout'
import { keepAliveService } from '@/services/keepalive'
import { applyBrandColor } from '@/theme/brandTheme'

/**
 * The shell is eager; the pages are not.
 *
 * Every page used to be imported statically here, so opening the sign-in screen meant
 * downloading the analytics dashboards, the OKR pages and the ticket detail view first.
 * What stays eager is what somebody can be looking at before they have chosen anything:
 * the three sign-in screens, the OAuth landing page, the 404, and the layouts and
 * guards that frame all of it. Splitting those would add a round trip to precisely the
 * screen the split exists to make faster.
 *
 * The boundaries are per route rather than per component, because a route change is
 * already a moment where attention moves and a brief placeholder there passes unnoticed,
 * where the same placeholder halfway down a page reads as a glitch.
 */

// Eager: the sign-in path and the frames around everything else.
import GenericLogin from '@/pages/auth/GenericLogin'
import CompanyLogin from '@/pages/CompanyLogin'
import AdminLogin from '@/pages/AdminLogin'
import AuthCallback from '@/pages/auth/AuthCallback'
import NotFoundPage from '@/pages/NotFoundPage'
import AdminLayout from '@/components/layout/AdminLayout'

// Lazy: company portal.
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const DayTasksPage = lazy(() => import('@/pages/DayTasksPage'))
const TasksPage = lazy(() => import('@/pages/tasks/TasksPage'))
const TaskDetailPage = lazy(() => import('@/pages/tasks/TaskDetailPage'))
const WorkflowsPage = lazy(() => import('@/pages/workflows/WorkflowsPage'))
const UsersPage = lazy(() => import('@/pages/users/UsersPage'))
const AnalyticsPage = lazy(() => import('@/pages/analytics/AnalyticsPage'))
const ProfilePage = lazy(() => import('@/pages/ProfilePage'))
const ActivityPage = lazy(() => import('@/pages/ActivityPage'))
const KnowledgeSourcesPage = lazy(() => import('@/pages/KnowledgeSourcesPage'))
const CalendarPage = lazy(() => import('@/pages/CalendarPage'))
const QuartersPage = lazy(() => import('@/pages/quarters/QuartersPage'))
const QuarterDetailPage = lazy(() => import('@/pages/quarters/QuarterDetailPage'))
const ObjectivesPage = lazy(() => import('@/pages/objectives/ObjectivesPage'))
const StrategyPage = lazy(() => import('@/pages/strategy/StrategyPage'))
const ObjectiveDetailPage = lazy(() => import('@/pages/objectives/ObjectiveDetailPage'))
const TicketsPage = lazy(() => import('@/pages/tickets/TicketsPage'))
const TicketDetailPage = lazy(() => import('@/pages/tickets/TicketDetailPage'))
const MeetingDetailPage = lazy(() => import('@/pages/MeetingDetailPage'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))

// Lazy: system admin portal. A handful of people ever open these.
const SuperAdminDashboard = lazy(() => import('@/pages/SuperAdminDashboard'))
const CreateCompany = lazy(() => import('@/pages/CreateCompany'))
const EditCompany = lazy(() => import('@/pages/EditCompany'))
const CompanyDetails = lazy(() => import('@/pages/CompanyDetails'))
const AdminAnalytics = lazy(() => import('@/pages/admin/AdminAnalytics'))
const AdminSettings = lazy(() => import('@/pages/admin/AdminSettings'))
const PlanSettings = lazy(() => import('@/pages/admin/PlanSettings'))

/** The wait while a page's chunk arrives. Seconds at worst, and usually not visible. */
const PageLoading: React.FC = () => (
  <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-live="polite">
    <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary-600" />
    <span className="sr-only">Loading</span>
  </div>
)

/** Chunk fetches fail on flaky connections and after a deploy replaces the files. */
function isChunkLoadError(error: Error): boolean {
  return /dynamically imported module|loading chunk|importing a module script/i.test(
    `${error?.message ?? ''} ${error?.name ?? ''}`,
  )
}

interface RouteBoundaryProps {
  /** Changing this clears a failure, so one bad page does not follow you around. */
  resetKey: string
  children: React.ReactNode
}

/**
 * Catches what a lazily loaded route can throw, including never arriving.
 *
 * Splitting the app puts the network between a click and a page, so a failure that used
 * to be impossible is now routine: a phone on a weak signal, or a deploy that replaced
 * the file this build was asking for. React.lazy remembers the rejection, so retrying
 * the render only re-throws it; reloading is what actually recovers, and that is what
 * this offers first.
 */
class RouteBoundary extends React.Component<RouteBoundaryProps, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Route failed to render:', error, info.componentStack)
  }

  componentDidUpdate(prev: RouteBoundaryProps) {
    // Reset on navigation only, and only the boundary's own state: keying the whole
    // subtree on the path would tear down and rebuild a page every time one of its
    // own parameters changed.
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const stale = isChunkLoadError(error)

    return (
      <div role="alert" className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
            {stale ? 'This page could not be loaded' : 'This page stopped working'}
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            {stale
              ? 'Part of the app failed to download. That is usually the connection, or a new version having just been released. Reloading picks it up.'
              : 'Something broke while rendering. Your work is not lost, reloading usually fixes it.'}
          </p>

          <div className="mt-5 flex justify-center gap-3">
            {!stale && (
              <button
                type="button"
                onClick={() => this.setState({ error: null })}
                className="btn-secondary"
              >
                Try again
              </button>
            )}
            <button type="button" onClick={() => window.location.reload()} className="btn-primary">
              Reload the page
            </button>
          </div>

          {import.meta.env.DEV && (
            <pre className="mt-5 max-h-40 overflow-auto rounded bg-gray-100 p-3 text-left text-xs text-red-700 dark:bg-gray-900 dark:text-red-400">
              {error.message}
            </pre>
          )}
        </div>
      </div>
    )
  }
}

/**
 * One suspense and error boundary for every page inside a shell.
 *
 * A pathless route, so it sits below the layout that rendered it: a boundary above the
 * layout would blank the sidebar and header every time a page was fetched, which is the
 * flash that makes route splitting look broken.
 */
const SuspendedOutlet: React.FC = () => {
  const location = useLocation()
  return (
    <RouteBoundary resetKey={location.pathname}>
      <Suspense fallback={<PageLoading />}>
        <Outlet />
      </Suspense>
    </RouteBoundary>
  )
}

/** The same pair for a page that stands on its own, outside any shell. */
const Page: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation()
  return (
    <RouteBoundary resetKey={location.pathname}>
      <Suspense fallback={<PageLoading />}>{children}</Suspense>
    </RouteBoundary>
  )
}

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

  /**
   * The presence connection belongs to the session, so it is opened and closed with it.
   *
   * Keyed on the user's id rather than the user object: that object is replaced on
   * every token refresh and every profile save, and each replacement used to open
   * another socket while leaving the previous one connected. Nothing closed it either,
   * so signing out left a connection authenticated as the person who had just left.
   */
  const userId = user?.id
  useEffect(() => {
    if (!isAuthenticated || !userId) return
    dispatch(initializeSocket())
    return () => {
      dispatch(disconnectSocket())
    }
  }, [dispatch, isAuthenticated, userId])

  /**
   * A request refused mid-session ends the session here, in state.
   *
   * services/api.ts cannot dispatch this itself without importing the store it is
   * imported by, so it raises an event and this is the one listener. Clearing the flag
   * is enough: the route guards send people to the right sign-in page, which the
   * document reload this replaces could not do without losing the reason as well.
   */
  useEffect(() => {
    const onUnauthorized = () => {
      if (!store.getState().auth.isAuthenticated) return
      dispatch(clearSession())
      toast.error('Your session has expired. Please sign in again.')
    }
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [dispatch])

  // Apply the company's brand color across the whole app shell (presentation only).
  useEffect(() => {
    applyBrandColor(user?.companyColor)
  }, [user?.companyColor])



  if (isLoading) {
    return <LoadingScreen />
  }

  return (
    <>
    <DialogHost />
    <IdleTimeout />
    <Routes>
      {/* Default Company Login (Generic - No Logo) */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <GenericLogin />
          </PublicRoute>
        }
      />

      {/* System Admin Login (Hidden - Direct URL Only) */}
      <Route
        path="/admin/login"
        element={
          <PublicRoute>
            <AdminLogin />
          </PublicRoute>
        }
      />

      {/* Company-Specific Login (/:slug/login) - With Branding */}
      <Route
        path="/:slug/login"
        element={
          <PublicRoute>
            <CompanyLogin />
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
        <Route element={<SuspendedOutlet />}>
          <Route index element={<Navigate to="/admin/companies" replace />} />
          <Route path="companies" element={<SuperAdminDashboard />} />
          <Route path="companies/create" element={<CreateCompany />} />
          <Route path="companies/:id" element={<CompanyDetails />} />
          <Route path="companies/:id/edit" element={<EditCompany />} />
          <Route path="analytics" element={<AdminAnalytics />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="plans" element={<PlanSettings />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
      </Route>

      {/* Shared Profile Route (accessible from both portals) */}
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Page>
              <ProfilePage />
            </Page>
          </ProtectedRoute>
        }
      />

      {/* Company Portal Routes (Protected) */}
      <Route
        path="/"
        element={
          <CompanyRoute>
            <Layout />
          </CompanyRoute>
        }
      >
        <Route element={<SuspendedOutlet />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="tasks/:id" element={<TaskDetailPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="calendar/:date" element={<DayTasksPage />} />
          <Route
            path="workflows"
            element={
              // Managers included. A workflow is how a team's own work moves and the
              // manager is the person who knows that; the server still scopes every
              // change to the caller's own company.
              <ProtectedRoute roles={['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'MANAGER']}>
                <WorkflowsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="users"
            element={
              <ProtectedRoute roles={['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN']}>
                <UsersPage />
              </ProtectedRoute>
            }
          />
          <Route path="strategy" element={<StrategyPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route
            path="quarters"
            element={
              <ProtectedRoute checkStrategy>
                <QuartersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="quarters/:id"
            element={
              <ProtectedRoute checkStrategy>
                <QuarterDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="objectives"
            element={
              <ProtectedRoute checkStrategy>
                <ObjectivesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="objectives/:id"
            element={
              <ProtectedRoute checkStrategy>
                <ObjectiveDetailPage />
              </ProtectedRoute>
            }
          />
          <Route path="activity" element={<ActivityPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route
            path="knowledge-sources"
            element={
              <ProtectedRoute roles={['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN']}>
                <KnowledgeSourcesPage />
              </ProtectedRoute>
            }
          />
          <Route path="tickets" element={<TicketsPage />} />
          <Route path="tickets/:id" element={<TicketDetailPage />} />
          <Route path="meetings/:id" element={<MeetingDetailPage />} />
          <Route
            path="settings"
            element={
              <ProtectedRoute roles={['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN']}>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
        </Route>
      </Route>

      <Route path="/auth/microsoft/callback" element={<AuthCallback />} />

      {/* 404 Route */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    </>
  )
}

export default App
