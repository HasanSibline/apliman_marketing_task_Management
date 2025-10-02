import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  SparklesIcon,
} from '@heroicons/react/24/outline'
import { aiApi } from '@/services/api'
import toast from 'react-hot-toast'

interface TaskAIPreviewProps {
  task: any
}

const TaskAIPreview: React.FC<TaskAIPreviewProps> = ({ task }) => {
  const [isLoading, setIsLoading] = useState(false)
  const [analysis, setAnalysis] = useState<any>(null)

  useEffect(() => {
    analyzeTask()
  }, [task])

  const analyzeTask = async () => {
    setIsLoading(true)
    try {
      const [priority, summary] = await Promise.all([
        aiApi.analyzePriority(task.title, task.description),
        aiApi.summarizeText(task.description)
      ])

      setAnalysis({
        priority,
        summary,
      })
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to analyze task'
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading || !analysis) {
    return null
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mt-3 pt-3 border-t border-gray-100"
    >
      <div className="flex items-center space-x-2 text-xs text-gray-500">
        <SparklesIcon className="h-4 w-4 text-primary-500" />
        <span>AI Analysis</span>
      </div>
      <div className="mt-2 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">Suggested Priority</span>
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
            analysis.priority.suggestedPriority >= 4 ? 'bg-red-100 text-red-800' :
            analysis.priority.suggestedPriority === 3 ? 'bg-yellow-100 text-yellow-800' :
            'bg-gray-100 text-gray-800'
          }`}>
            Level {analysis.priority.suggestedPriority}
          </span>
        </div>
        <p className="text-xs text-gray-500 line-clamp-2">
          {analysis.summary.summary}
        </p>
      </div>
    </motion.div>
  )
}

export default TaskAIPreview
