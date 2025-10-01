import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  ChartBarIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowTrendingUpIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline'
import { aiApi } from '@/services/api'
import toast from 'react-hot-toast'

interface TaskAIAnalysisProps {
  task: any
}

const TaskAIAnalysis: React.FC<TaskAIAnalysisProps> = ({ task }) => {
  const [isLoading, setIsLoading] = useState(false)
  const [analysis, setAnalysis] = useState<any>(null)

  useEffect(() => {
    analyzeTask()
  }, [task])

  const analyzeTask = async () => {
    setIsLoading(true)
    try {
      const [priority, completeness, summary] = await Promise.all([
        aiApi.analyzePriority(task.title, task.description),
        aiApi.checkCompleteness(task.description, task.goals || '', task.phase),
        aiApi.summarizeText(task.description)
      ])

      setAnalysis({
        priority,
        completeness,
        summary,
      })
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to analyze task'
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!analysis) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No analysis available</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Priority Analysis */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-lg border border-gray-200 p-4"
      >
        <div className="flex items-center space-x-2 mb-4">
          <ChartBarIcon className="h-5 w-5 text-primary-600" />
          <h3 className="text-sm font-medium text-gray-900">Priority Analysis</h3>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Suggested Priority</span>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
              analysis.priority.suggestedPriority >= 4 ? 'bg-red-100 text-red-800' :
              analysis.priority.suggestedPriority === 3 ? 'bg-yellow-100 text-yellow-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              Level {analysis.priority.suggestedPriority}
            </span>
          </div>
          <p className="text-sm text-gray-600">
            {analysis.priority.reasoning}
          </p>
        </div>
      </motion.div>

      {/* Completeness Check */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white rounded-lg border border-gray-200 p-4"
      >
        <div className="flex items-center space-x-2 mb-4">
          <CheckCircleIcon className="h-5 w-5 text-primary-600" />
          <h3 className="text-sm font-medium text-gray-900">Completeness Check</h3>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Completeness Score</span>
            <div className="flex items-center">
              <div className="w-32 h-2 bg-gray-200 rounded-full mr-2">
                <div
                  className={`h-2 rounded-full ${
                    analysis.completeness.score >= 0.8 ? 'bg-green-500' :
                    analysis.completeness.score >= 0.5 ? 'bg-yellow-500' :
                    'bg-red-500'
                  }`}
                  style={{ width: `${analysis.completeness.score * 100}%` }}
                />
              </div>
              <span className="text-sm font-medium text-gray-900">
                {Math.round(analysis.completeness.score * 100)}%
              </span>
            </div>
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-2">Suggestions</h4>
            <ul className="space-y-2">
              {analysis.completeness.suggestions.map((suggestion: string, index: number) => (
                <li key={index} className="flex items-start space-x-2">
                  <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500 flex-shrink-0" />
                  <span className="text-sm text-gray-600">{suggestion}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </motion.div>

      {/* Task Summary */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-lg border border-gray-200 p-4"
      >
        <div className="flex items-center space-x-2 mb-4">
          <DocumentTextIcon className="h-5 w-5 text-primary-600" />
          <h3 className="text-sm font-medium text-gray-900">AI Summary</h3>
        </div>
        <p className="text-sm text-gray-600">
          {analysis.summary}
        </p>
      </motion.div>

      {/* Performance Insights */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white rounded-lg border border-gray-200 p-4"
      >
        <div className="flex items-center space-x-2 mb-4">
          <ArrowTrendingUpIcon className="h-5 w-5 text-primary-600" />
          <h3 className="text-sm font-medium text-gray-900">Performance Insights</h3>
        </div>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-gray-900">Time Tracking</p>
              <p className="text-sm text-gray-600">
                {task.timeSpent ? (
                  `${Math.round(task.timeSpent / 3600)} hours spent`
                ) : (
                  'No time tracked yet'
                )}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Activity Level</p>
              <p className="text-sm text-gray-600">
                {task.comments?.length || 0} comments, {task.files?.length || 0} files
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default TaskAIAnalysis
