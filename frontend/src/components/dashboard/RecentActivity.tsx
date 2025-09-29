import React from 'react'
import { motion } from 'framer-motion'
import { 
  ClockIcon,
  UserIcon,
  DocumentIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline'

interface Activity {
  id: string
  type: 'task_created' | 'task_completed' | 'task_assigned' | 'comment_added' | 'file_uploaded'
  message: string
  user: {
    name: string
    avatar?: string
  }
  timestamp: string
  taskTitle?: string
}

interface RecentActivityProps {
  activities: Activity[]
}

const RecentActivity: React.FC<RecentActivityProps> = ({ activities }) => {
  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'task_created':
        return <DocumentIcon className="h-4 w-4 text-blue-500" />
      case 'task_completed':
        return <CheckCircleIcon className="h-4 w-4 text-green-500" />
      case 'task_assigned':
        return <UserIcon className="h-4 w-4 text-purple-500" />
      case 'comment_added':
        return <ExclamationTriangleIcon className="h-4 w-4 text-yellow-500" />
      case 'file_uploaded':
        return <DocumentIcon className="h-4 w-4 text-gray-500" />
      default:
        return <ClockIcon className="h-4 w-4 text-gray-500" />
    }
  }

  const formatTimeAgo = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (diffInSeconds < 60) return 'Just now'
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`
    
    return date.toLocaleDateString()
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
    >
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
      
      {activities && activities.length > 0 ? (
        <div className="space-y-4">
          {activities.slice(0, 8).map((activity: any, index: number) => (
            <motion.div
              key={activity.id || index}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="flex items-start space-x-3"
            >
              <div className="flex-shrink-0 mt-1">
                {getActivityIcon(activity.type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900">
                  <span className="font-medium">{activity.user?.name || 'Unknown User'}</span>
                  {' '}{activity.message}
                  {activity.taskTitle && (
                    <span className="font-medium text-primary-600">
                      {' "}{activity.taskTitle}"
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
        <div className="text-center py-8">
          <ClockIcon className="h-12 w-12 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500">No recent activity</p>
        </div>
      )}
    </motion.div>
  )
}

export default RecentActivity
