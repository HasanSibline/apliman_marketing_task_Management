import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  ClockIcon,
  CheckCircleIcon,
  ChartBarIcon,
  ArrowTrendingUpIcon,
} from '@heroicons/react/24/outline'
import { analyticsApi } from '@/services/api'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import toast from 'react-hot-toast'

interface UserAnalyticsProps {
  userId?: string
}

const UserAnalytics: React.FC<UserAnalyticsProps> = ({ userId }) => {
  const [isLoading, setIsLoading] = useState(true)
  const [analytics, setAnalytics] = useState<any>(null)

  useEffect(() => {
    loadAnalytics()
  }, [userId])

  const loadAnalytics = async () => {
    setIsLoading(true)
    try {
      const data = await analyticsApi.getUserAnalytics(userId)
      setAnalytics(data)
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to load user analytics'
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
              <p className="text-sm font-medium text-gray-600">Tasks Completed</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">
                {analytics?.stats?.completedTasks || 0}
              </h3>
            </div>
            <div className="h-12 w-12 bg-primary-100 rounded-lg flex items-center justify-center">
              <CheckCircleIcon className="h-6 w-6 text-primary-600" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-gray-500">
              {analytics?.stats?.totalAssignedTasks || 0} assigned
            </span>
            <span className="text-primary-600 font-medium">
              {analytics?.stats?.completionRate || 0}%
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
              <p className="text-sm font-medium text-gray-600">Total Assigned</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">
                {analytics?.stats?.totalAssignedTasks || 0}
              </h3>
            </div>
            <div className="h-12 w-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <ClockIcon className="h-6 w-6 text-yellow-600" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-gray-500">
              {analytics?.stats?.totalCreatedTasks || 0} created
            </span>
            <span className="text-yellow-600 font-medium">
              Active tasks
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
              <p className="text-sm font-medium text-gray-600">Productivity Score</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">
                {Math.round(analytics?.productivityScore || 0)}%
              </h3>
            </div>
            <div className="h-12 w-12 bg-green-100 rounded-lg flex items-center justify-center">
              <ChartBarIcon className="h-6 w-6 text-green-600" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-gray-500">
              Performance Score
            </span>
            <span className="text-green-600 font-medium">
              {analytics?.productivityScore >= 80 ? 'Excellent' : 
               analytics?.productivityScore >= 60 ? 'Good' : 
               analytics?.productivityScore >= 40 ? 'Average' : 'Needs Improvement'}
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
              <p className="text-sm font-medium text-gray-600">Task Quality</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">
                {Math.round(analytics?.taskQuality || 0)}%
              </h3>
            </div>
            <div className="h-12 w-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <ArrowTrendingUpIcon className="h-6 w-6 text-yellow-600" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-gray-500">
              Quality Score
            </span>
            <span className="text-yellow-600 font-medium">
              {analytics?.taskQuality >= 80 ? 'High' : 
               analytics?.taskQuality >= 60 ? 'Good' : 
               analytics?.taskQuality >= 40 ? 'Average' : 'Low'}
            </span>
          </div>
        </motion.div>
      </div>

      {/* Productivity Trend */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-white rounded-lg shadow-sm p-6"
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Productivity Trend</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={analytics?.productivityHistory || []}
              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="date" 
                tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                tick={{ fontSize: 12 }}
                tickLine={{ stroke: '#e0e0e0' }}
              />
              <YAxis 
                domain={[0, 100]} 
                tick={{ fontSize: 12 }}
                tickLine={{ stroke: '#e0e0e0' }}
                axisLine={{ stroke: '#e0e0e0' }}
              />
              <Tooltip 
                labelFormatter={(value) => new Date(value).toLocaleDateString('en-US', { 
                  month: 'short', 
                  day: 'numeric',
                  year: 'numeric'
                })}
                formatter={(value) => [`${value}%`, 'Productivity Score']}
                contentStyle={{ 
                  backgroundColor: '#fff', 
                  border: '1px solid #e0e0e0',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}
              />
              <Line 
                type="monotone" 
                dataKey="score" 
                stroke="#3B82F6" 
                strokeWidth={3}
                dot={{ fill: '#3B82F6', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, stroke: '#3B82F6', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* Task Details Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-white rounded-lg shadow-sm p-6"
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Task Breakdown</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">
                {analytics?.tasksAssigned || 0}
              </div>
              <div className="text-sm text-gray-600 mt-1">Total Assigned</div>
            </div>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {analytics?.tasksCompleted || 0}
              </div>
              <div className="text-sm text-gray-600 mt-1">Completed</div>
            </div>
          </div>
          <div className="bg-yellow-50 rounded-lg p-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">
                {analytics?.inProgressTasks || 0}
              </div>
              <div className="text-sm text-gray-600 mt-1">In Progress</div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Performance Insights */}
      {analytics?.insights && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white rounded-lg shadow-sm p-6"
        >
          <div className="flex items-center space-x-2 mb-4">
            <ArrowTrendingUpIcon className="h-6 w-6 text-primary-600" />
            <h3 className="text-lg font-semibold text-gray-900">Performance Insights</h3>
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

export default UserAnalytics
