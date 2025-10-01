import React from 'react'
import { motion } from 'framer-motion'
import {
  ArrowPathIcon,
  ChatBubbleLeftIcon,
  PaperClipIcon,
  PencilIcon,
  UserIcon,
  CheckIcon,
} from '@heroicons/react/24/outline'

interface TaskActivityLogProps {
  activities: any[]
}

const TaskActivityLog: React.FC<TaskActivityLogProps> = ({ activities }) => {
  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'PHASE_CHANGE':
        return <ArrowPathIcon className="h-5 w-5" />
      case 'COMMENT_ADDED':
        return <ChatBubbleLeftIcon className="h-5 w-5" />
      case 'FILE_ADDED':
        return <PaperClipIcon className="h-5 w-5" />
      case 'TASK_UPDATED':
        return <PencilIcon className="h-5 w-5" />
      case 'ASSIGNED':
        return <UserIcon className="h-5 w-5" />
      case 'COMPLETED':
        return <CheckIcon className="h-5 w-5" />
      default:
        return <ArrowPathIcon className="h-5 w-5" />
    }
  }

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'PHASE_CHANGE':
        return 'text-blue-600 bg-blue-100'
      case 'COMMENT_ADDED':
        return 'text-green-600 bg-green-100'
      case 'FILE_ADDED':
        return 'text-purple-600 bg-purple-100'
      case 'TASK_UPDATED':
        return 'text-orange-600 bg-orange-100'
      case 'ASSIGNED':
        return 'text-indigo-600 bg-indigo-100'
      case 'COMPLETED':
        return 'text-green-600 bg-green-100'
      default:
        return 'text-gray-600 bg-gray-100'
    }
  }

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (diffInSeconds < 60) return 'Just now'
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`
    
    return date.toLocaleDateString()
  }

  return (
    <div className="flow-root">
      <ul role="list" className="-mb-8">
        {activities.map((activity, index) => (
          <motion.li
            key={activity.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <div className="relative pb-8">
              {index !== activities.length - 1 ? (
                <span
                  className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200"
                  aria-hidden="true"
                />
              ) : null}
              <div className="relative flex space-x-3">
                <div>
                  <span className={`h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white ${getActivityColor(activity.type)}`}>
                    {getActivityIcon(activity.type)}
                  </span>
                </div>
                <div className="flex min-w-0 flex-1 justify-between space-x-4">
                  <div>
                    <p className="text-sm text-gray-500">
                      <span className="font-medium text-gray-900">
                        {activity.user.name}
                      </span>{' '}
                      {activity.description}
                    </p>
                    {activity.details && (
                      <p className="mt-1 text-sm text-gray-500">
                        {activity.details}
                      </p>
                    )}
                  </div>
                  <div className="whitespace-nowrap text-right text-sm text-gray-500">
                    <time dateTime={activity.createdAt}>
                      {formatTimeAgo(activity.createdAt)}
                    </time>
                  </div>
                </div>
              </div>
            </div>
          </motion.li>
        ))}
      </ul>
    </div>
  )
}

export default TaskActivityLog
