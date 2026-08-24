import React, { useState, useEffect, useRef } from 'react'
import { useAppSelector } from '@/hooks/redux'
import { usersApi } from '@/services/api'
import { motion } from 'framer-motion'
import {
  ChartBarIcon,
  CheckCircleIcon,
  TrophyIcon,
  ArrowDownTrayIcon,
  CalendarIcon,
} from '@heroicons/react/24/outline'
import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { analyticsApi } from '@/services/api'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import { useChartTheme } from '@/theme/chartTheme'
import Select from '@/components/ui/Select'

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444']

const UserAnalytics: React.FC = () => {
  const chart = useChartTheme()
  const { user } = useAppSelector((s) => s.auth)
  const isAdmin = !!user && ['SUPER_ADMIN', 'COMPANY_ADMIN', 'ADMIN'].includes(user.role)

  const [isLoading, setIsLoading] = useState(true)
  const [userAnalytics, setUserAnalytics] = useState<any>(null)
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'year'>('month')

  /**
   * Whose numbers these are. Empty means your own.
   *
   * The endpoint for looking at someone else has existed all along, and the API
   * helper has taken a userId all along; nothing ever passed one. So an admin could
   * see the company in aggregate and their own work in detail, and had no way to ask
   * how any particular person was doing without becoming them.
   */
  const [subjectId, setSubjectId] = useState('')
  const [people, setPeople] = useState<{ id: string; name: string }[]>([])
  /**
   * A failed request and a person with no activity look identical otherwise.
   *
   * The empty state below tells you this person has done nothing this period. Saying
   * that about a colleague because a request timed out is worse than saying nothing.
   */
  const [loadError, setLoadError] = useState(false)
  const subjectName = subjectId ? people.find((p) => p.id === subjectId)?.name ?? 'This person' : ''
  /**
   * Who the page is talking about, decided once.
   *
   * Every heading and every insight below was written in the first or second person,
   * back when this page could only ever show you your own work. Now that an admin can
   * point it at a colleague, those same words hand that colleague's figures to
   * whoever is reading: "Excellent Work! Your completion rate is 91%" about someone
   * else's quarter. Wrong in the flattering direction is still wrong, and it is the
   * same defect as a page inventing history and signing your name to it.
   */
  const possessive = subjectName ? `${subjectName}'s` : 'My'
  const subject = subjectName || 'You'
  const verb = subjectName ? 'has' : 'have'
  const verbNeg = subjectName ? 'does not' : 'do not'

  useEffect(() => {
    if (!isAdmin) return
    usersApi
      .getAll()
      .then((u: any) => setPeople((u?.users ?? u ?? []).map((p: any) => ({ id: p.id, name: p.name }))))
      .catch(() => setPeople([]))
  }, [isAdmin])

  useEffect(() => {
    loadUserAnalytics()
  }, [timeRange, subjectId])

  const requestId = useRef(0)

  const loadUserAnalytics = async () => {
    const mine = ++requestId.current
    setIsLoading(true)
    setLoadError(false)
    // Cleared up front: showing the last person's numbers under this person's name
    // is worse than showing nothing while it loads.
    setUserAnalytics(null)
    try {
      console.log('=== Loading User Analytics ===')
      console.log('Time range:', timeRange)
      
      const data = await analyticsApi.getUserAnalytics(timeRange, subjectId || undefined)
      
      console.log('=== Received Analytics Data ===')
      console.log('Full response:', data)
      console.log('Stats:', data.stats)
      console.log('Performance Trend:', data.performanceTrend)
      console.log('Tasks by Status:', data.tasksByStatus)
      console.log('Recent Activity:', data.recentActivity)
      
      if (mine !== requestId.current) return
      setUserAnalytics(data)
    } catch (error: any) {
      if (mine !== requestId.current) return
      console.error('Error loading analytics:', error)
      setLoadError(true)
      toast.error(error.response?.data?.message || 'Failed to load user analytics')
    } finally {
      // The guard has to cover the spinner too. An older answer arriving late used to
      // clear it while the current request was still out, so you saw an empty dashboard
      // rather than something loading.
      if (mine === requestId.current) setIsLoading(false)
    }
  }

  const handleExportMyReport = async () => {
    try {
      toast.loading(subjectName ? `Generating the report for ${subjectName}…` : 'Generating your report…')
      
      const data = userAnalytics
      const workbook = XLSX.utils.book_new()
      
      // Personal Overview
      const overviewData = [
        [subjectName ? `${subjectName} performance report` : 'My performance report'],
        ['Generated:', new Date().toLocaleString()],
        [''],
        ['Metric', 'Value'],
        ['Total Assigned Tasks', data.stats?.totalAssignedTasks || 0],
        ['Completed Tasks', data.stats?.completedTasks || 0],
        ['Completion Rate', `${data.stats?.completionRate || 0}%`],
        ['Tasks Created', data.stats?.totalCreatedTasks || 0],
      ]
      const overviewSheet = XLSX.utils.aoa_to_sheet(overviewData)
      XLSX.utils.book_append_sheet(workbook, overviewSheet, 'Performance')
      
      // Generate file
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `analytics-${new Date().toISOString().split('T')[0]}.xlsx`
      link.click()
      window.URL.revokeObjectURL(url)
      
      toast.dismiss()
      toast.success('Report downloaded')
    } catch (error) {
      toast.dismiss()
      toast.error('Failed to export report')
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="surface p-6 animate-pulse">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-4"></div>
              <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="surface p-6 animate-pulse">
              <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
              <div className="h-80 bg-gray-200 dark:bg-gray-700 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!userAnalytics) {
    return (
      <div className="space-y-6">
        {/* The picker stays. Returning early above it meant that a person whose data
            failed to load took away the only control that could switch back to
            someone else, leaving a dead end that needed a page reload. */}
        {isAdmin && (
          <div>
            <label htmlFor="analytics-subject-empty" className="sr-only">Whose analytics</label>
            <Select
              id="analytics-subject-empty"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className="select-field w-auto"
            >
              <option value="">My analytics</option>
              {people.filter((p) => p.id !== user?.id).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>
        )}

        <div className="surface flex min-h-[320px] items-center justify-center">
          <div className="p-8 text-center">
            {loadError ? (
              <>
                <ChartBarIcon className="mx-auto mb-4 h-12 w-12 text-error-500" />
                <h3 className="text-sm font-medium text-gray-900 dark:text-white">Analytics could not be loaded</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  The server did not answer, so there is nothing to say about this period yet.
                </p>
                <button onClick={loadUserAnalytics} className="btn-primary mt-4">Try again</button>
              </>
            ) : (
              <>
                <ChartBarIcon className="mx-auto mb-4 h-12 w-12 text-gray-400" />
                <h3 className="text-sm font-medium text-gray-900 dark:text-white">Nothing to show yet</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {subjectName
                    ? `${subjectName} has no activity in this period.`
                    : 'Your analytics will appear here once you have some activity.'}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  const stats = userAnalytics.stats || {}

  const performanceTrend = userAnalytics.performanceTrend || []

  /**
   * The server's three buckets, and no second opinion about them.
   *
   * This used to fall back to rebuilding Completed / In progress / Pending out of
   * `stats`. The server now guarantees the three add up to the total and drops the
   * empty ones, so a local copy could only ever disagree with the counters printed
   * on the cards above.
   *
   * Colours are looked up by bucket name rather than taken by position. The server
   * omits a bucket that is zero, so a person with nothing in progress used to have
   * Pending drawn in In-progress green, and the same colour meant a different thing
   * on two people's pages.
   */
  const STATUS_COLORS: Record<string, string> = {
    Completed: COLORS[0],
    'In Progress': COLORS[1],
    Pending: COLORS[2],
  }
  const taskStatusData: { name: string; value: number }[] = userAnalytics.tasksByStatus || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="section-title">{subjectName ? `${subjectName}'s analytics` : 'My analytics'}</h2>
          <p className="page-subtitle">
            {subjectName ? `What ${subjectName} has been working on and how it is going.` : 'What you have been working on and how it is going.'}
          </p>
        </div>
        <button
          onClick={handleExportMyReport}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors shadow-sm font-medium"
        >
          <ArrowDownTrayIcon className="h-5 w-5" />
          {subjectName ? 'Export report' : 'Export my report'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
      {isAdmin && (
        <div>
          <label htmlFor="analytics-subject" className="sr-only">Whose analytics</label>
          <Select
            id="analytics-subject"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            className="select-field w-auto"
          >
            <option value="">My analytics</option>
            {people
              .filter((p) => p.id !== user?.id)
              .map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
          </Select>
        </div>
      )}

      {/* Time Range Selector */}
      <div className="flex gap-2 surface p-1 border border-gray-200 dark:border-gray-700 w-fit">
        {(['week', 'month', 'year'] as const).map((range) => (
          <button
            key={range}
            onClick={() => setTimeRange(range)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              timeRange === range
                ? 'bg-primary-600 text-white'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            {range.charAt(0).toUpperCase() + range.slice(1)}
          </button>
        ))}
      </div>
      </div>

      {/* Personal Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-primary-50 dark:from-primary-900/20 to-white dark:to-gray-800 rounded-xl shadow-sm p-6 border border-primary-100 dark:border-primary-900/40"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Tasks</p>
              <h3 className="text-3xl font-bold text-gray-900 dark:text-white">
                {stats.totalAssignedTasks || 0}
              </h3>
              <p className="text-sm text-primary-600 dark:text-primary-400 mt-2 font-medium">
                {stats.inProgressTasks || 0} in progress
              </p>
            </div>
            <div className="h-14 w-14 bg-primary-600 rounded-xl flex items-center justify-center shadow-lg">
              <ChartBarIcon className="h-8 w-8 text-white" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-br from-success-50 dark:from-success-900/20 to-white dark:to-gray-800 rounded-xl shadow-sm p-6 border border-success-100 dark:border-success-900/40"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Completed</p>
              <h3 className="text-3xl font-bold text-gray-900 dark:text-white">
                {stats.completedTasks || 0}
              </h3>
              <p className="text-sm text-success-600 dark:text-success-400 mt-2 font-medium">
                {stats.completionRate || 0}% completion rate
              </p>
            </div>
            <div className="h-14 w-14 bg-success-600 rounded-xl flex items-center justify-center shadow-lg">
              <CheckCircleIcon className="h-8 w-8 text-white" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gradient-to-br from-warning-50 dark:from-warning-900/20 to-white dark:to-gray-800 rounded-xl shadow-sm p-6 border border-warning-100 dark:border-warning-900/40"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Created</p>
              <h3 className="text-3xl font-bold text-gray-900 dark:text-white">
                {stats.totalCreatedTasks || 0}
              </h3>
              <p className="text-sm text-warning-600 dark:text-warning-400 mt-2 font-medium">
                {subjectName ? `Tasks ${subjectName} created` : 'Tasks I created'}
              </p>
            </div>
            <div className="h-14 w-14 bg-warning-600 rounded-xl flex items-center justify-center shadow-lg">
              <CalendarIcon className="h-8 w-8 text-white" />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Performance Trend */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="surface p-6 border border-gray-200 dark:border-gray-700"
        >
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{possessive} performance trend</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={performanceTrend}>
                <defs>
                  <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorAssigned" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                <XAxis dataKey="date" tick={{ fontSize: 12, ...chart.tick }} />
                <YAxis tick={{ fontSize: 12, ...chart.tick }} />
                <Tooltip
                  contentStyle={chart.tooltip} labelStyle={chart.tooltipLabel}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="completed"
                  stroke="#10B981"
                  fillOpacity={1}
                  fill="url(#colorCompleted)"
                  name="Completed"
                />
                <Area
                  type="monotone"
                  dataKey="assigned"
                  stroke="#3B82F6"
                  fillOpacity={1}
                  fill="url(#colorAssigned)"
                  name="Assigned"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Task Status Breakdown */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
          className="surface p-6 border border-gray-200 dark:border-gray-700"
      >
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{possessive} task status</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={taskStatusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                  stroke={chart.isDark ? '#1f2937' : '#fff'}
                  strokeWidth={2}
                >
                  {taskStatusData.map((entry) => (
                    <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? COLORS[3]} />
                  ))}
                </Pie>
              <Tooltip 
                contentStyle={chart.tooltip} labelStyle={chart.tooltipLabel}
                />
              </PieChart>
          </ResponsiveContainer>
        </div>
      </motion.div>
      </div>

      {/* Performance Summary */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-gradient-to-br from-primary-600 to-primary-700 rounded-xl shadow-lg p-8 text-white"
      >
        <div className="flex items-center gap-3 mb-6">
          <TrophyIcon className="h-8 w-8" />
          <h3 className="text-2xl font-bold">{subjectName ? `${subjectName}'s performance` : 'Your performance'}</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <div className="text-sm text-primary-100 mb-1">Completion Rate</div>
            <div className="text-4xl font-bold">{stats.completionRate || 0}%</div>
            <div className="mt-2 text-sm text-primary-200">
              {stats.completedTasks || 0} of {stats.totalAssignedTasks || 0} tasks
            </div>
          </div>
          <div>
            <div className="text-sm text-primary-100 mb-1">Tasks Created</div>
            <div className="text-4xl font-bold">{stats.totalCreatedTasks || 0}</div>
            <div className="mt-2 text-sm text-primary-200">
              {subjectName ? 'Their initiative' : 'Your initiative'}
            </div>
          </div>
          <div>
            <div className="text-sm text-primary-100 mb-1">Status</div>
            <div className="text-4xl font-bold">
              {stats.completionRate >= 80 ? '🌟' : stats.completionRate >= 60 ? '👍' : '💪'}
              </div>
            <div className="mt-2 text-sm text-primary-200">
              {stats.completionRate >= 80 ? 'Excellent!' : stats.completionRate >= 60 ? 'Good job!' : 'Keep going!'}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Personal Insights */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="surface p-6 border border-gray-200 dark:border-gray-700"
      >
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{subjectName ? 'Insights' : 'Personal insights'}</h3>
        <div className="space-y-3">
          {/* Excellent Performance */}
          {stats.completionRate >= 80 && (
            <div className="p-4 bg-success-50 dark:bg-success-900/30 rounded-lg border border-success-200">
              <p className="text-sm text-success-800 dark:text-success-300">
                <strong>🌟 Excellent work!</strong> {possessive} completion rate is {stats.completionRate}%.{' '}
                {subject} {verb} completed {stats.completedTasks} of {stats.totalAssignedTasks} tasks.
              </p>
            </div>
          )}
          
          {/* Good Performance */}
          {stats.completionRate >= 60 && stats.completionRate < 80 && (
            <div className="p-4 bg-primary-50 dark:bg-primary-900/30 rounded-lg border border-primary-200">
              <p className="text-sm text-primary-800 dark:text-primary-300">
                <strong>👍 Good job!</strong> {possessive} completion rate is {stats.completionRate}%.{' '}
                {subject} {verb} completed {stats.completedTasks} tasks.
              </p>
            </div>
          )}
          
          {/* Needs Improvement */}
          {stats.completionRate < 60 && stats.totalAssignedTasks > 0 && (
            <div className="p-4 bg-warning-50 dark:bg-warning-900/30 rounded-lg border border-warning-200">
              <p className="text-sm text-warning-800 dark:text-warning-300">
                <strong>💪 Room for growth.</strong> {possessive} completion rate is {stats.completionRate}%.{' '}
                {subject} {verb} {stats.inProgressTasks} in progress and {stats.pendingTasks} pending.
              </p>
            </div>
          )}
          
          {/* High Initiative */}
          {stats.totalCreatedTasks > stats.totalAssignedTasks && (
            <div className="p-4 bg-primary-50 dark:bg-primary-900/30 rounded-lg border border-primary-200">
              <p className="text-sm text-primary-800 dark:text-primary-300">
                <strong>🚀 Great initiative!</strong> {subject} {verb} created {stats.totalCreatedTasks} tasks,{' '}
                against {stats.totalAssignedTasks} assigned.
              </p>
            </div>
          )}
          
          {/* Active Tasks Info */}
          {stats.inProgressTasks > 0 && (
            <div className="p-4 bg-gray-50 dark:bg-gray-900/40 rounded-lg border border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-800 dark:text-gray-100">
                <strong>⚡ Currently active:</strong> {subject} {verb} {stats.inProgressTasks} task{stats.inProgressTasks !== 1 ? 's' : ''} in progress.
                {stats.pendingTasks > 0 && ` ${stats.pendingTasks} task${stats.pendingTasks !== 1 ? 's are' : ' is'} still pending.`}
              </p>
            </div>
          )}
          
          {/* No Tasks */}
          {stats.totalAssignedTasks === 0 && (
            <div className="p-4 bg-gray-50 dark:bg-gray-900/40 rounded-lg border border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-800 dark:text-gray-100">
                <strong>📋 Nothing assigned yet.</strong> {subject} {verbNeg} have any tasks assigned.
                {stats.totalCreatedTasks > 0 &&
                  ` ${stats.totalCreatedTasks} task${stats.totalCreatedTasks !== 1 ? 's' : ''} created, though.`}
              </p>
          </div>
          )}
          
          {/* Recent Activity */}
          {userAnalytics.recentActivity && userAnalytics.recentActivity.length > 0 && (
            <div className="p-4 bg-gray-50 dark:bg-gray-900/40 rounded-lg border border-gray-200 dark:border-gray-700">
              <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">📊 Recent activity</p>
              <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-200">
                {userAnalytics.recentActivity.slice(0, 3).map((activity: any) => (
                  <li key={activity.id} className="flex items-center justify-between">
                    <span className="truncate flex-1">{activity.title}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">{activity.phase}</span>
                  </li>
              ))}
            </ul>
            </div>
          )}
          </div>
        </motion.div>
    </div>
  )
}

export default UserAnalytics
