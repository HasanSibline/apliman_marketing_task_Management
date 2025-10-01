import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  UserGroupIcon,
  ClockIcon,
  CheckCircleIcon,
  ArrowTrendingUpIcon,
  DocumentChartBarIcon,
} from '@heroicons/react/24/outline'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { analyticsApi } from '@/services/api'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import toast from 'react-hot-toast'

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d']

const AnalyticsDashboard: React.FC = () => {
  const dispatch = useAppDispatch()
  const { user } = useAppSelector((state) => state.auth)
  const [isLoading, setIsLoading] = useState(true)
  const [dashboardData, setDashboardData] = useState<any>(null)
  const [userAnalytics, setUserAnalytics] = useState<any>(null)
  const [teamAnalytics, setTeamAnalytics] = useState<any>(null)
  const [taskAnalytics, setTaskAnalytics] = useState<any>(null)
  const [insights, setInsights] = useState<any>(null)

  useEffect(() => {
    loadAnalytics()
  }, [])

  const loadAnalytics = async () => {
    setIsLoading(true)
    try {
      const [dashboard, user, team, tasks] = await Promise.all([
        analyticsApi.getDashboard(),
        analyticsApi.getUserAnalytics(),
        analyticsApi.getTeamAnalytics(),
        analyticsApi.getTaskAnalytics(),
      ])

      setDashboardData(dashboard)
      setUserAnalytics(user)
      setTeamAnalytics(team)
      setTaskAnalytics(tasks)

      // Generate AI insights
      const insights = await analyticsApi.generateInsights({
        dashboard,
        user,
        team,
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
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
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
              {Math.round((dashboardData?.completedTasks || 0) / (dashboardData?.totalTasks || 1) * 100)}%
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
              <p className="text-sm font-medium text-gray-600">Time Tracked</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">
                {Math.round((taskAnalytics?.totalTimeSpent || 0) / 3600)}h
              </h3>
            </div>
            <div className="h-12 w-12 bg-green-100 rounded-lg flex items-center justify-center">
              <ClockIcon className="h-6 w-6 text-green-600" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-gray-500">
              {taskAnalytics?.activeTimers || 0} active timers
            </span>
            <span className="text-green-600 font-medium">
              {taskAnalytics?.averageTaskTime ? Math.round(taskAnalytics.averageTaskTime / 3600) + 'h avg' : 'N/A'}
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
              <p className="text-sm font-medium text-gray-600">Completion Rate</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">
                {Math.round((taskAnalytics?.completionRate || 0) * 100)}%
              </h3>
            </div>
            <div className="h-12 w-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <CheckCircleIcon className="h-6 w-6 text-yellow-600" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-gray-500">
              {taskAnalytics?.tasksCompletedThisWeek || 0} this week
            </span>
            <span className="text-yellow-600 font-medium">
              {taskAnalytics?.weekOverWeekChange ? (taskAnalytics.weekOverWeekChange > 0 ? '+' : '') + Math.round(taskAnalytics.weekOverWeekChange * 100) + '%' : 'N/A'}
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
                  phase: phase.replace('_', ' '),
                  count,
                }))}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="phase" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#8884d8" />
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
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Task Distribution</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={Object.entries(taskAnalytics?.taskDistribution || {}).map(([category, value]) => ({
                    name: category.replace('_', ' '),
                    value,
                  }))}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {Object.entries(taskAnalytics?.taskDistribution || {}).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

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
