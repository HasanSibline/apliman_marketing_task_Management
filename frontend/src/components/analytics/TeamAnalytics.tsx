import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  UserGroupIcon,
  TrophyIcon,
  ChartBarIcon,
  ArrowDownTrayIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
} from '@heroicons/react/24/outline'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { analyticsApi } from '@/services/api'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

const TeamAnalytics: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true)
  const [teamData, setTeamData] = useState<any>(null)
  const [sortBy, setSortBy] = useState<'completion' | 'assigned' | 'name'>('completion')

  useEffect(() => {
    loadTeamAnalytics()
  }, [])

  const loadTeamAnalytics = async () => {
    setIsLoading(true)
    try {
      const data = await analyticsApi.getTeamAnalytics()
      setTeamData(data)
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to load team analytics')
    } finally {
      setIsLoading(false)
    }
  }

  const handleExportTeamReport = async () => {
    try {
      toast.loading('Generating team report...')
      
      const workbook = XLSX.utils.book_new()
      
      // Team Summary
      const summaryData = [
        ['Team Analytics Report'],
        ['Generated:', new Date().toLocaleString()],
        [''],
        ['Metric', 'Value'],
        ['Total Team Members', teamData.summary?.totalTeamMembers || 0],
        ['Total Tasks', teamData.summary?.totalTasks || 0],
        ['Average Completion Rate', `${teamData.summary?.averageCompletionRate || 0}%`],
        ['Team Performance', `${teamData.summary?.teamPerformance || 0}%`],
        ['Tasks Completed This Week', teamData.summary?.tasksCompletedThisWeek || 0],
      ]
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryData)
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Team Summary')
      
      // Team Members Performance
      if (teamData.teamMembers && teamData.teamMembers.length > 0) {
        const membersData = teamData.teamMembers.map((member: any) => ({
          Name: member.name,
          Email: member.email,
          Position: member.position || 'N/A',
          'Assigned Tasks': member.assignedTasks,
          'Completed Tasks': member.completedTasks,
          'Completion Rate': `${member.completionRate}%`,
          Status: member.status,
        }))
        const membersSheet = XLSX.utils.json_to_sheet(membersData)
        XLSX.utils.book_append_sheet(workbook, membersSheet, 'Team Members')
      }
      
      // Generate file
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `team-analytics-${new Date().toISOString().split('T')[0]}.xlsx`
      link.click()
      window.URL.revokeObjectURL(url)
      
      toast.dismiss()
      toast.success('Team report downloaded successfully!')
    } catch (error) {
      toast.dismiss()
      toast.error('Failed to export team report')
    }
  }

  const getSortedTeamMembers = () => {
    if (!teamData?.teamMembers) return []
    
    const members = [...teamData.teamMembers]
    
    switch (sortBy) {
      case 'completion':
        return members.sort((a, b) => b.completionRate - a.completionRate)
      case 'assigned':
        return members.sort((a, b) => b.assignedTasks - a.assignedTasks)
      case 'name':
        return members.sort((a, b) => a.name.localeCompare(b.name))
      default:
        return members
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

  if (!teamData) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <UserGroupIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Team Data</h3>
          <p className="text-gray-500">Team analytics will appear here.</p>
        </div>
      </div>
    )
  }

  const summary = teamData.summary || {}
  const teamMembers = getSortedTeamMembers()

  // Prepare chart data
  const performanceComparisonData = teamMembers.slice(0, 10).map((member: any) => ({
    name: member.name.split(' ')[0], // First name only for cleaner display
    completed: member.completedTasks,
    assigned: member.assignedTasks,
    rate: member.completionRate,
  }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Team Analytics</h2>
          <p className="text-gray-600 mt-1">Monitor team performance and collaboration</p>
        </div>
        <button
          onClick={handleExportTeamReport}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors shadow-sm font-medium"
        >
          <ArrowDownTrayIcon className="h-5 w-5" />
          Export Team Report
        </button>
      </div>

      {/* Team Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-primary-50 to-white rounded-xl shadow-sm p-6 border border-primary-100"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 mb-1">Team Members</p>
              <h3 className="text-3xl font-bold text-gray-900">
                {summary.totalTeamMembers || 0}
              </h3>
              <p className="text-sm text-primary-600 mt-2 font-medium">
                {teamData.activeMembers || 0} active
              </p>
            </div>
            <div className="h-14 w-14 bg-primary-600 rounded-xl flex items-center justify-center shadow-lg">
              <UserGroupIcon className="h-8 w-8 text-white" />
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
              <p className="text-sm font-medium text-gray-600 mb-1">Total Tasks</p>
              <h3 className="text-3xl font-bold text-gray-900">
                {summary.totalTasks || 0}
              </h3>
              <p className="text-sm text-success-600 mt-2 font-medium">
                {summary.tasksCompletedThisWeek || 0} this week
              </p>
            </div>
            <div className="h-14 w-14 bg-success-600 rounded-xl flex items-center justify-center shadow-lg">
              <ChartBarIcon className="h-8 w-8 text-white" />
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
              <p className="text-sm font-medium text-gray-600 mb-1">Avg. Completion</p>
              <h3 className="text-3xl font-bold text-gray-900">
                {summary.averageCompletionRate || 0}%
              </h3>
              <div className="flex items-center gap-1 mt-2">
                {summary.averageCompletionRate >= 75 ? (
                  <ArrowTrendingUpIcon className="h-4 w-4 text-success-600" />
                ) : (
                  <ArrowTrendingDownIcon className="h-4 w-4 text-warning-600" />
                )}
                <p className={`text-sm font-medium ${
                  summary.averageCompletionRate >= 75 ? 'text-success-600' : 'text-warning-600'
                }`}>
                  Team performance
                </p>
              </div>
            </div>
            <div className="h-14 w-14 bg-warning-600 rounded-xl flex items-center justify-center shadow-lg">
              <TrophyIcon className="h-8 w-8 text-white" />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Team Performance Comparison */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-xl shadow-sm p-6 border border-gray-200"
        >
          <h3 className="text-lg font-bold text-gray-900 mb-4">Team Performance Comparison</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={performanceComparisonData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis 
                  dataKey="name" 
                  tick={{ fontSize: 11 }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px'
                  }}
                />
                <Legend />
                <Bar dataKey="completed" fill="#10B981" name="Completed" radius={[8, 8, 0, 0]} />
                <Bar dataKey="assigned" fill="#3B82F6" name="Assigned" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Completion Rate by Member */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-xl shadow-sm p-6 border border-gray-200"
        >
          <h3 className="text-lg font-bold text-gray-900 mb-4">Completion Rate by Member</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={performanceComparisonData} layout="horizontal">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis 
                  type="category" 
                  dataKey="name" 
                  tick={{ fontSize: 11 }}
                  width={80}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px'
                  }}
                  formatter={(value: any) => `${value}%`}
                />
                <Bar 
                  dataKey="rate" 
                  fill="#3B82F6" 
                  name="Completion Rate (%)"
                  radius={[0, 8, 8, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      {/* Team Leaderboard */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-white rounded-xl shadow-sm p-6 border border-gray-200"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <TrophyIcon className="h-5 w-5 text-warning-600" />
            Team Leaderboard
          </h3>
          <div className="flex gap-2">
            <button
              onClick={() => setSortBy('completion')}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                sortBy === 'completion'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              By Rate
            </button>
            <button
              onClick={() => setSortBy('assigned')}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                sortBy === 'assigned'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              By Tasks
            </button>
            <button
              onClick={() => setSortBy('name')}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                sortBy === 'name'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              By Name
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rank
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Team Member
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Position
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Assigned
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Completed
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Completion Rate
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {teamMembers.map((member: any, index: number) => (
                <tr key={member.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {index < 3 && sortBy === 'completion' && (
                        <span className="text-2xl mr-2">
                          {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                        </span>
                      )}
                      <span className="text-sm font-medium text-gray-900">#{index + 1}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{member.name}</div>
                      <div className="text-sm text-gray-500">{member.email}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {member.position || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {member.assignedTasks}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-success-600">
                    {member.completedTasks}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                        <div
                          className="bg-primary-600 h-2 rounded-full"
                          style={{ width: `${member.completionRate}%` }}
                        ></div>
                      </div>
                      <span className="text-sm font-medium text-gray-900">
                        {member.completionRate}%
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        member.status === 'ACTIVE'
                          ? 'bg-success-100 text-success-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {member.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {teamMembers.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No team members found
            </div>
          )}
        </div>
      </motion.div>

      {/* Team Performance Summary */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="bg-gradient-to-br from-primary-600 to-primary-700 rounded-xl shadow-lg p-8 text-white"
      >
        <h3 className="text-2xl font-bold mb-6">Team Performance Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="text-4xl font-bold">{summary.totalTeamMembers || 0}</div>
            <div className="text-primary-100 mt-2">Total Members</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold">{summary.totalTasks || 0}</div>
            <div className="text-primary-100 mt-2">Total Tasks</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold">{summary.averageCompletionRate || 0}%</div>
            <div className="text-primary-100 mt-2">Avg. Completion</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold">{summary.tasksCompletedThisWeek || 0}</div>
            <div className="text-primary-100 mt-2">This Week</div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default TeamAnalytics
