import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  UserGroupIcon,
  ClockIcon,
  ChartBarIcon,
  ArrowTrendingUpIcon,
} from '@heroicons/react/24/outline'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { analyticsApi } from '@/services/api'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'
import toast from 'react-hot-toast'

const TeamAnalytics: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true)
  const [analytics, setAnalytics] = useState<any>(null)

  useEffect(() => {
    loadAnalytics()
  }, [])

  const loadAnalytics = async () => {
    setIsLoading(true)
    try {
      const data = await analyticsApi.getTeamAnalytics()
      setAnalytics(data)
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to load team analytics'
      toast.error(message)
    } finally {
      setIsLoading(false)
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
              <p className="text-sm font-medium text-gray-600">Team Members</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">
                {analytics?.teamSize || 0}
              </h3>
            </div>
            <div className="h-12 w-12 bg-primary-100 rounded-lg flex items-center justify-center">
              <UserGroupIcon className="h-6 w-6 text-primary-600" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-gray-500">
              {analytics?.activeMembers || 0} active now
            </span>
            <span className="text-primary-600 font-medium">
              {Math.round((analytics?.activeMembers || 0) / (analytics?.teamSize || 1) * 100)}%
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
              <p className="text-sm font-medium text-gray-600">Total Time</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">
                {Math.round((analytics?.totalTimeSpent || 0) / 3600)}h
              </h3>
            </div>
            <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <ClockIcon className="h-6 w-6 text-blue-600" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-gray-500">
              {Math.round((analytics?.averageTimePerMember || 0) / 3600)}h per member
            </span>
            <span className="text-blue-600 font-medium">
              {analytics?.activeTimers || 0} active
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
              <p className="text-sm font-medium text-gray-600">Team Performance</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">
                {Math.round((analytics?.teamPerformance || 0) * 100)}%
              </h3>
            </div>
            <div className="h-12 w-12 bg-green-100 rounded-lg flex items-center justify-center">
              <ChartBarIcon className="h-6 w-6 text-green-600" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-gray-500">
              {analytics?.metrics?.total || 0} metrics tracked
            </span>
            <span className="text-green-600 font-medium">
              {analytics?.performanceTrend ? (analytics.performanceTrend > 0 ? '+' : '') + Math.round(analytics.performanceTrend * 100) + '%' : 'N/A'}
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
              <p className="text-sm font-medium text-gray-600">Task Completion</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">
                {Math.round((analytics?.taskCompletionRate || 0) * 100)}%
              </h3>
            </div>
            <div className="h-12 w-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <ArrowTrendingUpIcon className="h-6 w-6 text-yellow-600" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-gray-500">
              {analytics?.tasksCompletedThisWeek || 0} this week
            </span>
            <span className="text-yellow-600 font-medium">
              {analytics?.completionTrend ? (analytics.completionTrend > 0 ? '+' : '') + Math.round(analytics.completionTrend * 100) + '%' : 'N/A'}
            </span>
          </div>
        </motion.div>
      </div>

      {/* Member Performance */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-white rounded-lg shadow-sm p-6"
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Member Performance</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={analytics?.memberPerformance || []}
              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="performance" fill="#8884d8" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* Team Trends */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-white rounded-lg shadow-sm p-6"
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Team Trends</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={analytics?.teamTrends || []}
              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="performance" stroke="#8884d8" name="Performance" />
              <Line type="monotone" dataKey="completion" stroke="#82ca9d" name="Completion" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* Team Insights */}
      {analytics?.insights && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-white rounded-lg shadow-sm p-6"
        >
          <div className="flex items-center space-x-2 mb-4">
            <ArrowTrendingUpIcon className="h-6 w-6 text-primary-600" />
            <h3 className="text-lg font-semibold text-gray-900">Team Insights</h3>
          </div>
          <div className="prose prose-sm max-w-none">
            <div dangerouslySetInnerHTML={{ __html: analytics.insights }} />
            <h4 className="font-medium text-gray-900 mt-4">Recommendations</h4>
            <ul className="list-disc pl-4 space-y-2">
              {analytics.recommendations.map((rec: string, index: number) => (
                <li key={index}>{rec}</li>
              ))}
            </ul>
          </div>
        </motion.div>
      )}
    </div>
  )
}

export default TeamAnalytics
