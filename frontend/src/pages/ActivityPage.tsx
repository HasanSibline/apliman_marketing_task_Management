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
import { useAppSelector } from '@/hooks/redux'
import toast from 'react-hot-toast'

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
  const { user } = useAppSelector((state) => state.auth)
  const [activities, setActivities] = useState<Activity[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadActivities()
  }, [])

  const loadActivities = async () => {
    setIsLoading(true)
    try {
      // For now, we'll create mock activities since we don't have a dedicated activities API
      // In a real implementation, you'd call an API endpoint like tasksApi.getActivities()
      const mockActivities: Activity[] = [
        {
          id: '1',
          type: 'task_created',
          user: { name: user?.name || 'You' },
          description: 'created a new task',
          taskTitle: 'Sample Task 1',
          createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString() // 30 minutes ago
        },
        {
          id: '2',
          type: 'task_completed',
          user: { name: 'John Doe' },
          description: 'completed the task',
          taskTitle: 'Sample Task 2',
          createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString() // 2 hours ago
        },
        {
          id: '3',
          type: 'task_assigned',
          user: { name: 'Admin' },
          description: 'assigned you the task',
          taskTitle: 'Sample Task 3',
          createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString() // 1 day ago
        },
        {
          id: '4',
          type: 'comment_added',
          user: { name: 'Jane Smith' },
          description: 'added a comment to',
          taskTitle: 'Sample Task 4',
          createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString() // 2 days ago
        },
        {
          id: '5',
          type: 'file_uploaded',
          user: { name: user?.name || 'You' },
          description: 'uploaded a file to',
          taskTitle: 'Sample Task 5',
          createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString() // 3 days ago
        }
      ]
      setActivities(mockActivities)
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to load activities'
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
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
        return <DocumentIcon className="h-5 w-5 text-gray-500" />
      default:
        return <ClockIcon className="h-5 w-5 text-gray-500" />
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
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeftIcon className="h-5 w-5 text-gray-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Activities</h1>
          <p className="text-gray-600 mt-1">
            View all recent activities across the system
          </p>
        </div>
      </div>

      {/* Activities List */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
      >
        {activities && activities.length > 0 ? (
          <div className="space-y-6">
            {activities.map((activity: Activity, index: number) => (
              <motion.div
                key={activity.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-start space-x-4 p-4 hover:bg-gray-50 rounded-lg transition-colors"
              >
                <div className="flex-shrink-0 mt-1">
                  {getActivityIcon(activity.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900">
                    <span className="font-medium">{activity.user?.name || activity.userName || 'Unknown User'}</span>
                    {' '}{activity.message || activity.description}
                    {activity.taskTitle && (
                      <span className="font-medium text-primary-600">
                        {' "'}{activity.taskTitle}{'"'}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {formatTimeAgo(activity.timestamp || activity.createdAt)}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <ClockIcon className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Activities</h3>
            <p className="text-gray-500">There are no recent activities to display.</p>
          </div>
        )}
      </motion.div>
    </div>
  )
}

export default ActivityPage
