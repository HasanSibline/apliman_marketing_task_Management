import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  UserGroupIcon,
  ClockIcon,
  CheckCircleIcon,
  ArrowTrendingUpIcon,
  DocumentChartBarIcon,
} from '@heroicons/react/24/outline'
import { analyticsApi } from '@/services/api'
import { useAppSelector } from '@/hooks/redux'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import toast from 'react-hot-toast'

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4']
const PHASE_COLORS = {
  'PENDING_APPROVAL': '#6B7280',
  'APPROVED': '#06B6D4',
  'REJECTED': '#EF4444',
  'ASSIGNED': '#3B82F6', 
  'IN_PROGRESS': '#F59E0B',
  'COMPLETED': '#10B981',
  'ARCHIVED': '#9CA3AF'
}

const AnalyticsDashboard: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true)
  const [dashboardData, setDashboardData] = useState<any>(null)
  const [taskAnalytics, setTaskAnalytics] = useState<any>(null)
  const [insights, setInsights] = useState<any>(null)
  const { user } = useAppSelector((state) => state.auth)

  useEffect(() => {
    loadAnalytics()
  }, [])

  const loadAnalytics = async () => {
    setIsLoading(true)
    try {
      const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN'
      
      const [dashboard, tasks] = await Promise.all([
        isAdmin ? analyticsApi.getDashboard() : analyticsApi.getMyDashboard(),
        isAdmin ? analyticsApi.getTaskAnalytics() : analyticsApi.getMyTaskAnalytics(),
      ])

      console.log('Dashboard data received:', dashboard)
      console.log('Tasks by phase:', dashboard.tasksByPhase)
      console.log('Task analytics received:', tasks)

      setDashboardData(dashboard)
      setTaskAnalytics(tasks)

      // Generate AI insights
      const insights = await analyticsApi.generateInsights({
        dashboard,
        tasks,
      })
      setInsights(insights)
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to load analytics'
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleExport = async () => {
    try {
      await analyticsApi.exportTasksReport()
      toast.success('Report exported successfully')
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to export report'
      toast.error(message)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Loading skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg shadow-sm p-6 animate-pulse">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-8 bg-gray-200 rounded w-1/2"></div>
                </div>
                <div className="h-12 w-12 bg-gray-200 rounded-lg"></div>
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg shadow-sm p-6 animate-pulse">
              <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
              <div className="h-80 bg-gray-200 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!dashboardData && !taskAnalytics) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <DocumentChartBarIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Analytics Data</h3>
          <p className="text-gray-500">Analytics data will appear here once you have some tasks.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg shadow-sm p-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Tasks</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">
                {dashboardData?.totalTasks || 0}
              </h3>
            </div>
            <div className="h-12 w-12 bg-primary-100 rounded-lg flex items-center justify-center">
              <DocumentChartBarIcon className="h-6 w-6 text-primary-600" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-gray-500">
              {dashboardData?.completedTasks || 0} completed
            </span>
            <span className="text-primary-600 font-medium">
              {dashboardData?.completionRate || 0}%
            </span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-lg shadow-sm p-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Users</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">
                {dashboardData?.activeUsers || 0}
              </h3>
            </div>
            <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <UserGroupIcon className="h-6 w-6 text-blue-600" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-gray-500">
              {dashboardData?.totalUsers || 0} total users
            </span>
            <span className="text-blue-600 font-medium">
              {Math.round((dashboardData?.activeUsers || 0) / (dashboardData?.totalUsers || 1) * 100)}%
            </span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-lg shadow-sm p-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">In Progress</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">
                {dashboardData?.inProgressTasks || 0}
              </h3>
            </div>
            <div className="h-12 w-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <ClockIcon className="h-6 w-6 text-yellow-600" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-gray-500">
              {dashboardData?.pendingTasks || 0} pending
            </span>
            <span className="text-yellow-600 font-medium">
              Active tasks
            </span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-lg shadow-sm p-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Overdue Tasks</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">
                {dashboardData?.overdueTasks || 0}
              </h3>
            </div>
            <div className="h-12 w-12 bg-red-100 rounded-lg flex items-center justify-center">
              <ClockIcon className="h-6 w-6 text-red-600" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-gray-500">
              Need attention
            </span>
            <span className="text-red-600 font-medium">
              {dashboardData?.overdueTasks > 0 ? 'Action required' : 'All on track'}
            </span>
          </div>
        </motion.div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tasks by Phase */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-lg shadow-sm p-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Tasks by Phase</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={Object.entries(dashboardData?.tasksByPhase || {}).map(([phase, count]) => ({
                  phase: phase.replace(/_/g, ' '),
                  count,
                  fill: PHASE_COLORS[phase as keyof typeof PHASE_COLORS] || '#8884d8'
                }))}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis 
                  dataKey="phase" 
                  tick={{ fontSize: 12 }}
                  tickLine={{ stroke: '#e0e0e0' }}
                />
                <YAxis 
                  tick={{ fontSize: 12 }}
                  tickLine={{ stroke: '#e0e0e0' }}
                  axisLine={{ stroke: '#e0e0e0' }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#fff', 
                    border: '1px solid #e0e0e0',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  }}
                />
                <Bar 
                  dataKey="count" 
                  fill="#8884d8"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Task Distribution */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white rounded-lg shadow-sm p-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Task Priority Distribution</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={taskAnalytics?.tasksByPriority?.map((item: any) => ({
                    name: `Priority ${item.priority}`,
                    value: item.count,
                  })) || []}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                  stroke="#fff"
                  strokeWidth={2}
                >
                  {(taskAnalytics?.tasksByPriority || []).map((_: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#fff', 
                    border: '1px solid #e0e0e0',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      {/* Recent Tasks Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="bg-white rounded-lg shadow-sm p-6"
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Tasks</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Task
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Phase
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Priority
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Assigned To
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {(dashboardData?.recentTasks || []).slice(0, 10).map((task: any, index: number) => (
                <tr key={task.id || index} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900 truncate max-w-xs">
                      {task.title}
                    </div>
                    <div className="text-sm text-gray-500 truncate max-w-xs">
                      {task.description?.substring(0, 50)}...
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      task.phase === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                      task.phase === 'IN_PROGRESS' ? 'bg-yellow-100 text-yellow-800' :
                      task.phase === 'PENDING_APPROVAL' ? 'bg-gray-100 text-gray-800' :
                      task.phase === 'ASSIGNED' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {task.phase?.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className={`h-2 w-2 rounded-full mr-2 ${
                        task.priority >= 4 ? 'bg-red-500' :
                        task.priority >= 3 ? 'bg-yellow-500' :
                        'bg-green-500'
                      }`}></div>
                      <span className="text-sm text-gray-900">Priority {task.priority}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {task.assignedTo?.name || 'Unassigned'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(task.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(!dashboardData?.recentTasks || dashboardData.recentTasks.length === 0) && (
            <div className="text-center py-8">
              <p className="text-gray-500">No recent tasks found</p>
            </div>
          )}
        </div>
      </motion.div>

      {/* Performance Metrics */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="bg-white rounded-lg shadow-sm p-6"
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Metrics</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-primary-600">
              {Math.round(taskAnalytics?.averageCompletionTime || 0)}
            </div>
            <div className="text-sm text-gray-600 mt-1">Days Avg Completion</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-green-600">
              {dashboardData?.tasksCompletedThisWeek || 0}
            </div>
            <div className="text-sm text-gray-600 mt-1">Tasks This Week</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-yellow-600">
              {taskAnalytics?.overdueTasks?.length || 0}
            </div>
            <div className="text-sm text-gray-600 mt-1">Overdue Tasks</div>
          </div>
        </div>
      </motion.div>

      {/* AI Insights */}
      {insights && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-white rounded-lg shadow-sm p-6"
        >
          <div className="flex items-center space-x-2 mb-4">
            <ArrowTrendingUpIcon className="h-6 w-6 text-primary-600" />
            <h3 className="text-lg font-semibold text-gray-900">AI Insights</h3>
          </div>
          <div className="prose prose-sm max-w-none">
            <div dangerouslySetInnerHTML={{ __html: insights.insights }} />
            <h4 className="font-medium text-gray-900 mt-4">Recommendations</h4>
            <ul className="list-disc pl-4 space-y-2">
              {insights.recommendations.map((rec: string, index: number) => (
                <li key={index}>{rec}</li>
              ))}
            </ul>
          </div>
        </motion.div>
      )}

      {/* Export Button */}
      <div className="flex justify-end">
        <button
          onClick={handleExport}
          className="btn-primary"
        >
          <DocumentChartBarIcon className="h-5 w-5 mr-2" />
          Export Report
        </button>
      </div>
    </div>
  )
}

export default AnalyticsDashboard
