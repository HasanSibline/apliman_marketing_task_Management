import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  ChartBarIcon,
  ClockIcon,
  CheckCircleIcon,
  TrophyIcon,
  ArrowDownTrayIcon,
  CalendarIcon,
} from '@heroicons/react/24/outline'
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
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
import { useAppSelector } from '@/hooks/redux'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444']

const UserAnalytics: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true)
  const [userAnalytics, setUserAnalytics] = useState<any>(null)
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'year'>('month')
  const { user } = useAppSelector((state) => state.auth)

  useEffect(() => {
    loadUserAnalytics()
  }, [timeRange])

  const loadUserAnalytics = async () => {
    setIsLoading(true)
    try {
      const data = await analyticsApi.getUserAnalytics()
      setUserAnalytics(data)
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to load user analytics')
    } finally {
      setIsLoading(false)
    }
  }

  const handleExportMyReport = async () => {
    try {
      toast.loading('Generating your personal report...')
      
      const data = userAnalytics
      const workbook = XLSX.utils.book_new()
      
      // Personal Overview
      const overviewData = [
        ['My Performance Report'],
        ['Generated:', new Date().toLocaleString()],
        [''],
        ['Metric', 'Value'],
        ['Total Assigned Tasks', data.stats?.totalAssignedTasks || 0],
        ['Completed Tasks', data.stats?.completedTasks || 0],
        ['Completion Rate', `${data.stats?.completionRate || 0}%`],
        ['Tasks Created', data.stats?.totalCreatedTasks || 0],
      ]
      const overviewSheet = XLSX.utils.aoa_to_sheet(overviewData)
      XLSX.utils.book_append_sheet(workbook, overviewSheet, 'My Performance')
      
      // Generate file
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `my-analytics-${new Date().toISOString().split('T')[0]}.xlsx`
      link.click()
      window.URL.revokeObjectURL(url)
      
      toast.dismiss()
      toast.success('Your report has been downloaded!')
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
            <div key={i} className="bg-white rounded-xl shadow-sm p-6 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
              <div className="h-8 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl shadow-sm p-6 animate-pulse">
              <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
              <div className="h-80 bg-gray-200 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!userAnalytics) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <ChartBarIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Data Available</h3>
          <p className="text-gray-500">Your personal analytics will appear here.</p>
        </div>
      </div>
    )
  }

  const stats = userAnalytics.stats || {}

  // Mock performance trend data (replace with actual data from backend)
  const performanceTrend = [
    { date: 'Week 1', completed: 3, assigned: 5 },
    { date: 'Week 2', completed: 5, assigned: 6 },
    { date: 'Week 3', completed: 4, assigned: 5 },
    { date: 'Week 4', completed: 6, assigned: 7 },
  ]

  const taskStatusData = [
    { name: 'Completed', value: stats.completedTasks || 0 },
    { name: 'In Progress', value: (stats.totalAssignedTasks || 0) - (stats.completedTasks || 0) },
  ].filter(item => item.value > 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">My Analytics</h2>
          <p className="text-gray-600 mt-1">Track your personal performance and progress</p>
        </div>
        <button
          onClick={handleExportMyReport}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors shadow-sm font-medium"
        >
          <ArrowDownTrayIcon className="h-5 w-5" />
          Export My Report
        </button>
      </div>

      {/* Time Range Selector */}
      <div className="flex gap-2 bg-white rounded-lg p-1 border border-gray-200 w-fit">
        {(['week', 'month', 'year'] as const).map((range) => (
          <button
            key={range}
            onClick={() => setTimeRange(range)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              timeRange === range
                ? 'bg-primary-600 text-white'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {range.charAt(0).toUpperCase() + range.slice(1)}
          </button>
        ))}
      </div>

      {/* Personal Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-primary-50 to-white rounded-xl shadow-sm p-6 border border-primary-100"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 mb-1">My Tasks</p>
              <h3 className="text-3xl font-bold text-gray-900">
                {stats.totalAssignedTasks || 0}
              </h3>
              <p className="text-sm text-primary-600 mt-2 font-medium">
                Assigned to me
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
          className="bg-gradient-to-br from-success-50 to-white rounded-xl shadow-sm p-6 border border-success-100"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 mb-1">Completed</p>
              <h3 className="text-3xl font-bold text-gray-900">
                {stats.completedTasks || 0}
              </h3>
              <p className="text-sm text-success-600 mt-2 font-medium">
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
          className="bg-gradient-to-br from-warning-50 to-white rounded-xl shadow-sm p-6 border border-warning-100"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 mb-1">Created</p>
              <h3 className="text-3xl font-bold text-gray-900">
                {stats.totalCreatedTasks || 0}
              </h3>
              <p className="text-sm text-warning-600 mt-2 font-medium">
                Tasks I created
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
          className="bg-white rounded-xl shadow-sm p-6 border border-gray-200"
        >
          <h3 className="text-lg font-bold text-gray-900 mb-4">My Performance Trend</h3>
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
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px'
                  }}
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
          className="bg-white rounded-xl shadow-sm p-6 border border-gray-200"
        >
          <h3 className="text-lg font-bold text-gray-900 mb-4">My Task Status</h3>
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
                  stroke="#fff"
                  strokeWidth={2}
                >
                  {taskStatusData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px'
                  }}
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
          <h3 className="text-2xl font-bold">Your Performance</h3>
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
              Your initiative
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
        className="bg-white rounded-xl shadow-sm p-6 border border-gray-200"
      >
        <h3 className="text-lg font-bold text-gray-900 mb-4">Personal Insights</h3>
        <div className="space-y-3">
          {stats.completionRate >= 80 && (
            <div className="p-4 bg-success-50 rounded-lg border border-success-200">
              <p className="text-sm text-success-800">
                <strong>Great work!</strong> Your completion rate is above 80%. Keep up the excellent performance!
              </p>
            </div>
          )}
          {stats.completionRate < 50 && stats.totalAssignedTasks > 0 && (
            <div className="p-4 bg-warning-50 rounded-lg border border-warning-200">
              <p className="text-sm text-warning-800">
                <strong>Tip:</strong> Your completion rate could be improved. Focus on completing pending tasks.
              </p>
            </div>
          )}
          {stats.totalCreatedTasks > stats.totalAssignedTasks && (
            <div className="p-4 bg-primary-50 rounded-lg border border-primary-200">
              <p className="text-sm text-primary-800">
                <strong>Initiative!</strong> You're creating more tasks than assigned. Great leadership!
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}

export default UserAnalytics
