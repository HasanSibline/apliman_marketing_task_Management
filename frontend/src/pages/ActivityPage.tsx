import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  ClockIcon,
  UserIcon,
  DocumentIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowLeftIcon
} from '@heroicons/react/24/outline'
import { useNavigate } from 'react-router-dom'
import EmptyState from '@/components/common/EmptyState'

interface Activity {
  id: string
  type?: string
  message?: string
  description?: string
  user?: {
    name: string
    avatar?: string
  }
  userName?: string
  userId?: string
  timestamp?: string
  createdAt?: string
  taskTitle?: string
}

const ActivityPage: React.FC = () => {
  const navigate = useNavigate()
  const [activities, setActivities] = useState<Activity[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadActivities()
  }, [])

  /**
   * There is no activity feed to load, so this page invents nothing.
   *
   * It used to build five `mockActivities` and render them as real history:
   * "John Doe completed the task 'Sample Task 2'", "Jane Smith added a comment to
   * 'Sample Task 4'": people who do not work here, about tasks that do not exist,
   * with the signed-in user's own real name on two of the five entries. Anyone
   * reading this page believed it, because nothing on it said otherwise.
   *
   * No endpoint on the backend serves an activity log. Until one does, the honest
   * screen is the one below: it says the feed is not available rather than filling
   * the space with fiction. The rendering code is kept because it is correct and
   * will be needed the moment a real feed exists; only the fabricated source is gone.
   */
  const loadActivities = async () => {
    setActivities([])
    setIsLoading(false)
  }

  const getActivityIcon = (type?: string) => {
    switch (type) {
      case 'task_created':
        return <DocumentIcon className="h-5 w-5 text-blue-500" />
      case 'task_completed':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />
      case 'task_assigned':
        return <UserIcon className="h-5 w-5 text-purple-500" />
      case 'comment_added':
        return <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500" />
      case 'file_uploaded':
        return <DocumentIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
      default:
        return <ClockIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
    }
  }

  const formatTimeAgo = (timestamp?: string) => {
    if (!timestamp) return 'Unknown time'
    const date = new Date(timestamp)
    const now = new Date()
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (diffInSeconds < 60) return 'Just now'
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`
    
    return date.toLocaleDateString()
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
      {/* Header */}
      <div className="flex items-center space-x-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
        >
          <ArrowLeftIcon className="h-5 w-5 text-gray-600 dark:text-gray-300" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">All Activities</h1>
          <p className="text-gray-600 dark:text-gray-300 mt-1">
            View all recent activities across the system
          </p>
        </div>
      </div>

      {/* Activities List */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6"
      >
        {activities && activities.length > 0 ? (
          <div className="space-y-6">
            {activities.map((activity: Activity, index: number) => (
              <motion.div
                key={activity.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-start space-x-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <div className="flex-shrink-0 mt-1">
                  {getActivityIcon(activity.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 dark:text-white">
                    <span className="font-medium">{activity.user?.name || activity.userName || 'Unknown User'}</span>
                    {' '}{activity.message || activity.description}
                    {activity.taskTitle && (
                      <span className="font-medium text-primary-600 dark:text-primary-400">
                        {' "'}{activity.taskTitle}{'"'}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {formatTimeAgo(activity.timestamp || activity.createdAt)}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <EmptyState
            bare
            icon={ClockIcon}
            title="Activity history is not available yet"
            description="Nothing records a company-wide activity log yet, so there is nothing to show here. Each task keeps its own history on its detail page in the meantime."
          />
        )}
      </motion.div>
    </div>
  )
}

export default ActivityPage
