import React, { useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  ChartBarIcon, 
  ArrowDownTrayIcon,
  UsersIcon,
  ClipboardDocumentListIcon 
} from '@heroicons/react/24/outline'
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { 
  fetchDashboardAnalytics, 
  fetchTeamAnalytics, 
  fetchTaskAnalytics,
  exportTasks 
} from '@/store/slices/analyticsSlice'

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#6B7280']

const AnalyticsPage: React.FC = () => {
  const dispatch = useAppDispatch()
  const { 
    dashboard, 
    teamAnalytics, 
    taskAnalytics, 
    isLoading 
  } = useAppSelector((state) => state.analytics)

  useEffect(() => {
    dispatch(fetchDashboardAnalytics())
    dispatch(fetchTeamAnalytics())
    dispatch(fetchTaskAnalytics())
  }, [dispatch])

  const handleExport = () => {
    dispatch(exportTasks({}))
  }

  // Prepare chart data
  const taskPhaseData = taskAnalytics?.tasksByPhase ? 
    Object.entries(taskAnalytics.tasksByPhase).map(([phase, count]) => ({
      name: phase.replace('_', ' '),
      value: count
    })) : []

  const teamPerformanceData = teamAnalytics?.teamMembers?.slice(0, 5).map((member: any) => ({
    name: member.user.name,
    completed: member.tasksCompleted,
    assigned: member.tasksAssigned,
  })) || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-600 mt-1">
            Performance insights and team metrics
          </p>
        </div>
        <button 
          onClick={handleExport}
          className="btn-primary"
          disabled={isLoading}
        >
          <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
          Export Tasks
        </button>
      </div>

      {/* Overview Stats */}
      {dashboard && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="grid grid-cols-1 md:grid-cols-4 gap-6"
        >
          <div className="card">
            <div className="flex items-center">
              <div className="p-3 rounded-lg bg-blue-500">
                <ClipboardDocumentListIcon className="h-6 w-6 text-white" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Tasks</p>
                <p className="text-2xl font-bold text-gray-900">{dashboard.totalTasks}</p>
              </div>
            </div>
          </div>
          
          <div className="card">
            <div className="flex items-center">
              <div className="p-3 rounded-lg bg-green-500">
                <UsersIcon className="h-6 w-6 text-white" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Active Users</p>
                <p className="text-2xl font-bold text-gray-900">{dashboard.activeUsers}</p>
              </div>
            </div>
          </div>
          
          <div className="card">
            <div className="flex items-center">
              <div className="p-3 rounded-lg bg-yellow-500">
                <ChartBarIcon className="h-6 w-6 text-white" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Completion Rate</p>
                <p className="text-2xl font-bold text-gray-900">
                  {dashboard.totalTasks > 0 
                    ? Math.round((dashboard.tasksByPhase?.COMPLETED || 0) / dashboard.totalTasks * 100)
                    : 0}%
                </p>
              </div>
            </div>
          </div>
          
          <div className="card">
            <div className="flex items-center">
              <div className="p-3 rounded-lg bg-purple-500">
                <ClipboardDocumentListIcon className="h-6 w-6 text-white" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">In Progress</p>
                <p className="text-2xl font-bold text-gray-900">
                  {dashboard.tasksByPhase?.IN_PROGRESS || 0}
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Task Distribution */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="card"
        >
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Task Distribution by Phase</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={taskPhaseData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {taskPhaseData.map((_entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Team Performance */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="card"
        >
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Performers</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={teamPerformanceData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="completed" fill="#10B981" name="Completed" />
              <Bar dataKey="assigned" fill="#3B82F6" name="Assigned" />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      {/* Team Summary */}
      {teamAnalytics && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="card"
        >
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Team Summary</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-gray-900">{teamAnalytics.summary?.totalTeamMembers || 0}</p>
              <p className="text-sm text-gray-600">Team Members</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-gray-900">{teamAnalytics.summary?.totalTasksAssigned || 0}</p>
              <p className="text-sm text-gray-600">Tasks Assigned</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-gray-900">{teamAnalytics.summary?.totalTasksCompleted || 0}</p>
              <p className="text-sm text-gray-600">Tasks Completed</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-gray-900">
                {teamAnalytics.summary?.averageCompletionRate 
                  ? Math.round(teamAnalytics.summary.averageCompletionRate * 100) 
                  : 0}%
              </p>
              <p className="text-sm text-gray-600">Avg Completion Rate</p>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
}

export default AnalyticsPage
