import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  ChartBarIcon,
  UserGroupIcon,
  ClockIcon,
  DocumentChartBarIcon,
  ArrowDownTrayIcon,
  ArrowTrendingUpIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline'
import {
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
} from 'recharts'
import { analyticsApi, workflowsApi } from '@/services/api'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import AnalyticsFilters from './AnalyticsFilters'

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899', '#F97316']

interface AdminAnalyticsDashboardProps {
  onExport?: () => void
}

const AdminAnalyticsDashboard: React.FC<AdminAnalyticsDashboardProps> = () => {
  const [isLoading, setIsLoading] = useState(true)
  const [dashboardData, setDashboardData] = useState<any>(null)
  const [dateRange, setDateRange] = useState({ from: '', to: '' })
  const [workflowFilter, setWorkflowFilter] = useState('')
  const [phaseFilter, setPhaseFilter] = useState('')
  const [workflows, setWorkflows] = useState<any[]>([])
  const [phases, setPhases] = useState<any[]>([])

  useEffect(() => {
    loadData()
    loadFiltersData()
  }, [dateRange, workflowFilter, phaseFilter])

  const loadFiltersData = async () => {
    try {
      const workflowsRes = await workflowsApi.list()
      setWorkflows(workflowsRes || [])
    } catch (error) {
      console.error('Error loading filter data:', error)
      toast.error('Failed to load filter data')
    }
  }

  const loadData = async () => {
    setIsLoading(true)
    try {
      const data = await analyticsApi.getDashboard()
      setDashboardData(data)
      
      // Extract unique phases from tasks
      if (data.tasksByPhase) {
        const uniquePhases = data.tasksByPhase.map((item: any) => ({
          id: item.phase,
          name: item.phase,
        }))
        setPhases(uniquePhases)
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to load analytics')
    } finally {
      setIsLoading(false)
    }
  }

  const handleExportExcel = async () => {
    try {
      toast.loading('Generating Excel report...')
      
      const data = dashboardData
      
      // Create workbook
      const workbook = XLSX.utils.book_new()
      
      // Overview sheet
      const overviewData = [
        ['Metric', 'Value'],
        ['Total Tasks', data.totalTasks],
        ['Completed Tasks', data.completedTasks],
        ['In Progress', data.inProgressTasks],
        ['Pending Tasks', data.pendingTasks],
        ['Overdue Tasks', data.overdueTasks],
        ['Completion Rate', `${data.completionRate}%`],
        ['Active Users', data.activeUsers],
        ['Total Users', data.totalUsers],
      ]
      const overviewSheet = XLSX.utils.aoa_to_sheet(overviewData)
      XLSX.utils.book_append_sheet(workbook, overviewSheet, 'Overview')
      
      // Tasks by Phase sheet
      if (data.tasksByPhase && data.tasksByPhase.length > 0) {
        const phaseSheet = XLSX.utils.json_to_sheet(data.tasksByPhase)
        XLSX.utils.book_append_sheet(workbook, phaseSheet, 'Tasks by Phase')
      }
      
      // Recent Tasks sheet
      if (data.recentTasks && data.recentTasks.length > 0) {
        const tasksSheet = XLSX.utils.json_to_sheet(data.recentTasks)
        XLSX.utils.book_append_sheet(workbook, tasksSheet, 'Recent Tasks')
      }
      
      // Top Performers sheet
      if (data.topPerformers && data.topPerformers.length > 0) {
        const performersSheet = XLSX.utils.json_to_sheet(data.topPerformers)
        XLSX.utils.book_append_sheet(workbook, performersSheet, 'Top Performers')
      }
      
      // Generate file
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `analytics-report-${new Date().toISOString().split('T')[0]}.xlsx`
      link.click()
      window.URL.revokeObjectURL(url)
      
      toast.dismiss()
      toast.success('Excel report downloaded successfully!')
    } catch (error) {
      toast.dismiss()
      toast.error('Failed to export Excel report')
    }
  }

  const handleExportPDF = async () => {
    try {
      toast.loading('Generating PDF report...')
      
      // Create a printable version of the page
      const printWindow = window.open('', '_blank')
      if (!printWindow) {
        toast.dismiss()
        toast.error('Please allow pop-ups to export PDF')
        return
      }

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Analytics Report - ${new Date().toLocaleDateString()}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { color: #3B82F6; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #3B82F6; color: white; }
            .metric { display: inline-block; margin: 10px; padding: 15px; border: 1px solid #ddd; }
            .metric h3 { margin: 0; color: #3B82F6; }
          </style>
        </head>
        <body>
          <h1>Analytics Report</h1>
          <p>Generated: ${new Date().toLocaleString()}</p>
          
          <h2>Overview Metrics</h2>
          <div class="metric">
            <h3>${dashboardData.totalTasks || 0}</h3>
            <p>Total Tasks</p>
          </div>
          <div class="metric">
            <h3>${dashboardData.completedTasks || 0}</h3>
            <p>Completed</p>
          </div>
          <div class="metric">
            <h3>${dashboardData.inProgressTasks || 0}</h3>
            <p>In Progress</p>
          </div>
          <div class="metric">
            <h3>${dashboardData.overdueTasks || 0}</h3>
            <p>Overdue</p>
          </div>
          
          <h2>Recent Tasks</h2>
          <table>
            <thead>
              <tr>
                <th>Task</th>
                <th>Phase</th>
                <th>Workflow</th>
                <th>Assigned To</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              ${(dashboardData.recentTasks || []).map((task: any) => `
                <tr>
                  <td>${task.title}</td>
                  <td>${task.phase}</td>
                  <td>${task.workflow || 'Unknown'}</td>
                  <td>${task.assignedTo || 'Unassigned'}</td>
                  <td>${new Date(task.createdAt).toLocaleDateString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <script>
            window.onload = function() {
              window.print();
              setTimeout(() => window.close(), 500);
            }
          </script>
        </body>
        </html>
      `

      printWindow.document.write(htmlContent)
      printWindow.document.close()
      
      toast.dismiss()
      toast.success('Print dialog opened!')
    } catch (error) {
      toast.dismiss()
      toast.error('Failed to export PDF')
    }
  }

  const clearFilters = () => {
    setDateRange({ from: '', to: '' })
    setWorkflowFilter('')
    setPhaseFilter('')
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Loading skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl shadow-sm p-6 animate-pulse">
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
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl shadow-sm p-6 animate-pulse">
              <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
              <div className="h-80 bg-gray-200 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!dashboardData) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <DocumentChartBarIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Analytics Data</h3>
          <p className="text-gray-500">Analytics data will appear here once you have tasks.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Export Buttons */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Admin Analytics Dashboard</h2>
        <div className="flex gap-3">
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2 bg-success-600 text-white rounded-lg hover:bg-success-700 transition-colors shadow-sm font-medium"
          >
            <ArrowDownTrayIcon className="h-5 w-5" />
            Export Excel
          </button>
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-2 px-4 py-2 bg-error-600 text-white rounded-lg hover:bg-error-700 transition-colors shadow-sm font-medium"
          >
            <ArrowDownTrayIcon className="h-5 w-5" />
            Export PDF
          </button>
        </div>
      </div>

      {/* Filters */}
      <AnalyticsFilters
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        workflowFilter={workflowFilter}
        onWorkflowChange={setWorkflowFilter}
        phaseFilter={phaseFilter}
        onPhaseChange={setPhaseFilter}
        workflows={workflows}
        phases={phases}
        onClearFilters={clearFilters}
      />

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-primary-50 to-white rounded-xl shadow-sm p-6 border border-primary-100"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 mb-1">Total Tasks</p>
              <h3 className="text-3xl font-bold text-gray-900">
                {dashboardData.totalTasks || 0}
              </h3>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-primary-600 font-medium">
                  {dashboardData.completionRate || 0}% Complete
                </span>
              </div>
            </div>
            <div className="h-14 w-14 bg-primary-600 rounded-xl flex items-center justify-center shadow-lg">
              <DocumentChartBarIcon className="h-8 w-8 text-white" />
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
                {dashboardData.completedTasks || 0}
              </h3>
              <div className="flex items-center gap-1 mt-2">
                <ArrowTrendingUpIcon className="h-4 w-4 text-success-600" />
                <span className="text-xs text-success-600 font-medium">
                  {dashboardData.tasksCompletedThisWeek || 0} this week
                </span>
              </div>
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
              <p className="text-sm font-medium text-gray-600 mb-1">In Progress</p>
              <h3 className="text-3xl font-bold text-gray-900">
                {dashboardData.inProgressTasks || 0}
              </h3>
              <div className="flex items-center gap-1 mt-2">
                <ClockIcon className="h-4 w-4 text-warning-600" />
                <span className="text-xs text-warning-600 font-medium">
                  {dashboardData.pendingTasks || 0} pending
                </span>
              </div>
            </div>
            <div className="h-14 w-14 bg-warning-600 rounded-xl flex items-center justify-center shadow-lg">
              <ClockIcon className="h-8 w-8 text-white" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-gradient-to-br from-error-50 to-white rounded-xl shadow-sm p-6 border border-error-100"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 mb-1">Overdue</p>
              <h3 className="text-3xl font-bold text-gray-900">
                {dashboardData.overdueTasks || 0}
              </h3>
              <div className="flex items-center gap-1 mt-2">
                {dashboardData.overdueTasks > 0 ? (
                  <>
                    <ExclamationCircleIcon className="h-4 w-4 text-error-600" />
                    <span className="text-xs text-error-600 font-medium">Needs attention</span>
                  </>
                ) : (
                  <span className="text-xs text-success-600 font-medium">All on track!</span>
                )}
              </div>
            </div>
            <div className="h-14 w-14 bg-error-600 rounded-xl flex items-center justify-center shadow-lg">
              <ExclamationCircleIcon className="h-8 w-8 text-white" />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tasks by Phase Bar Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-xl shadow-sm p-6 border border-gray-200"
        >
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <ChartBarIcon className="h-5 w-5 text-primary-600" />
            Tasks by Phase
          </h3>
          <div className="h-80">
            {dashboardData.tasksByPhase && dashboardData.tasksByPhase.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dashboardData.tasksByPhase}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis 
                    dataKey="phase" 
                    tick={{ fontSize: 11 }}
                    angle={-45}
                    textAnchor="end"
                    height={100}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#fff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}
                  />
                  <Bar dataKey="count" fill="#3B82F6" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                No phase data available
              </div>
            )}
          </div>
        </motion.div>

        {/* Task Status Distribution Pie Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white rounded-xl shadow-sm p-6 border border-gray-200"
        >
          <h3 className="text-lg font-bold text-gray-900 mb-4">Task Status Distribution</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'Completed', value: dashboardData.completedTasks || 0 },
                    { name: 'In Progress', value: dashboardData.inProgressTasks || 0 },
                    { name: 'Pending', value: dashboardData.pendingTasks || 0 },
                    { name: 'Overdue', value: dashboardData.overdueTasks || 0 },
                  ].filter(item => item.value > 0)}
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
                  {[
                    { name: 'Completed', value: dashboardData.completedTasks || 0 },
                    { name: 'In Progress', value: dashboardData.inProgressTasks || 0 },
                    { name: 'Pending', value: dashboardData.pendingTasks || 0 },
                    { name: 'Overdue', value: dashboardData.overdueTasks || 0 },
                  ].filter(item => item.value > 0).map((_, index) => (
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

      {/* Recent Tasks Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="bg-white rounded-xl shadow-sm p-6 border border-gray-200"
      >
        <h3 className="text-lg font-bold text-gray-900 mb-4">Recent Tasks</h3>
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
                  Workflow
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
              {(dashboardData.recentTasks || []).map((task: any) => (
                <tr key={task.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900 max-w-xs truncate">
                      {task.title}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full"
                      style={{
                        backgroundColor: task.phaseColor ? `${task.phaseColor}20` : '#F3F4F6',
                        color: task.phaseColor || '#374151'
                      }}
                    >
                      {task.phase}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {task.workflow || 'Unknown'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {task.assignedTo || 'Unassigned'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(task.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(!dashboardData.recentTasks || dashboardData.recentTasks.length === 0) && (
            <div className="text-center py-8 text-gray-500">
              No recent tasks found
            </div>
          )}
        </div>
      </motion.div>

      {/* Top Performers Table */}
      {dashboardData.topPerformers && dashboardData.topPerformers.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="bg-white rounded-xl shadow-sm p-6 border border-gray-200"
        >
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <UserGroupIcon className="h-5 w-5 text-primary-600" />
            Top Performers
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dashboardData.topPerformers.map((performer: any, index: number) => (
              <div
                key={performer.email}
                className="p-4 bg-gradient-to-br from-primary-50 to-white rounded-lg border border-primary-100"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl font-bold text-primary-600">#{index + 1}</span>
                  <span className="text-sm font-medium text-gray-500">{performer.position}</span>
                </div>
                <h4 className="font-semibold text-gray-900 mb-1">{performer.name}</h4>
                <p className="text-sm text-gray-600 mb-3">{performer.email}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Tasks Completed</span>
                  <span className="text-lg font-bold text-primary-600">{performer.tasksCompleted}</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Performance Metrics Summary */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        className="bg-gradient-to-br from-primary-600 to-primary-700 rounded-xl shadow-lg p-8 text-white"
      >
        <h3 className="text-2xl font-bold mb-6">Performance Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="text-4xl font-bold mb-2">{dashboardData.totalUsers || 0}</div>
            <div className="text-primary-100">Total Team Members</div>
            <div className="text-sm text-primary-200 mt-1">
              {dashboardData.activeUsers || 0} active
            </div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold mb-2">{dashboardData.completionRate || 0}%</div>
            <div className="text-primary-100">Overall Completion Rate</div>
            <div className="text-sm text-primary-200 mt-1">
              {dashboardData.completedTasks || 0} of {dashboardData.totalTasks || 0} tasks
            </div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold mb-2">{dashboardData.tasksCompletedThisWeek || 0}</div>
            <div className="text-primary-100">Tasks This Week</div>
            <div className="text-sm text-primary-200 mt-1">
              Keep up the momentum!
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default AdminAnalyticsDashboard

