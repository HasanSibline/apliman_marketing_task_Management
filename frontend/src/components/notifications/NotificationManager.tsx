import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BellIcon,
  XMarkIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline'
import { useAppSelector } from '@/hooks/redux'
import { tasksApi } from '@/services/api'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'

interface Notification {
  id: string
  type: 'deadline' | 'welcome' | 'password' | 'system' | 'task_approval' | 'COMMENT_MENTION' | 'TASK_ASSIGNED' | 'TASK_COMPLETED' | 'TASK_PHASE_CHANGED'
  title: string
  message: string
  timestamp: Date
  read: boolean
  taskId?: string
  link?: string
  commentId?: string
}

const NotificationManager: React.FC = () => {
  const { user } = useAppSelector((state) => state.auth)
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    // Check for first-time login
    const hasSeenWelcome = localStorage.getItem(`welcome_seen_${user?.id}`)
    if (!hasSeenWelcome && user) {
      addNotification({
        type: 'welcome',
        title: 'Welcome to Task Management!',
        message: `Welcome ${user.name}! Let's get started with managing your tasks efficiently.`,
      })
      localStorage.setItem(`welcome_seen_${user.id}`, 'true')
    }

    // Check for password reset
    const passwordReset = localStorage.getItem(`password_reset_${user?.id}`)
    if (passwordReset === 'true' && user) {
      addNotification({
        type: 'password',
        title: 'Password Reset',
        message: 'Your password has been reset successfully. Please keep it secure.',
      })
      localStorage.removeItem(`password_reset_${user.id}`)
    }

    // Start deadline checker
    const interval = setInterval(checkDeadlines, 300000) // Check every 5 minutes
    return () => clearInterval(interval)
  }, [user])

  interface Task {
    id: string
    title: string
    dueDate?: string
  }

  const checkDeadlines = async () => {
    try {
      const tasks = await tasksApi.getMyTasks()
      tasks.forEach((task: Task) => {
        if (task.dueDate) {
          const dueDate = new Date(task.dueDate)
          const now = new Date()
          const timeDiff = dueDate.getTime() - now.getTime()
          const hoursDiff = timeDiff / (1000 * 60 * 60)

          // Notify 24 hours before deadline
          if (hoursDiff <= 24 && hoursDiff > 0) {
            const notificationKey = `deadline_${task.id}_24h`
            if (!localStorage.getItem(notificationKey)) {
              addNotification({
                type: 'deadline',
                title: 'Task Due Soon',
                message: `Task "${task.title}" is due in ${Math.round(hoursDiff)} hours.`,
                taskId: task.id,
                link: `/tasks/${task.id}`,
              })
              localStorage.setItem(notificationKey, 'true')
              
              // Show toast notification
              toast(
                () => (
                  <div className="flex items-center space-x-3">
                    <ClockIcon className="h-6 w-6 text-yellow-500" />
                    <div>
                      <p className="font-medium">Task Due Soon</p>
                      <p className="text-sm text-gray-600">{task.title}</p>
                    </div>
                  </div>
                ),
                {
                  duration: 5000,
                  position: 'top-right',
                }
              )
            }
          }

          // Notify 1 hour before deadline
          if (hoursDiff <= 1 && hoursDiff > 0) {
            const notificationKey = `deadline_${task.id}_1h`
            if (!localStorage.getItem(notificationKey)) {
              addNotification({
                type: 'deadline',
                title: 'Urgent: Task Due in 1 Hour',
                message: `Task "${task.title}" is due in less than an hour!`,
                taskId: task.id,
                link: `/tasks/${task.id}`,
              })
              localStorage.setItem(notificationKey, 'true')
              
              // Show toast notification
              toast(
                () => (
                  <div className="flex items-center space-x-3">
                    <ExclamationCircleIcon className="h-6 w-6 text-red-500" />
                    <div>
                      <p className="font-medium">Urgent: Task Due Soon</p>
                      <p className="text-sm text-gray-600">{task.title}</p>
                    </div>
                  </div>
                ),
                {
                  duration: 8000,
                  position: 'top-right',
                }
              )
            }
          }
        }
      })
    } catch (error) {
      console.error('Failed to check deadlines:', error)
    }
  }

  const addNotification = (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
    const newNotification: Notification = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
      read: false,
      ...notification,
    }

    setNotifications(prev => [newNotification, ...prev])
    setUnreadCount(prev => prev + 1)
  }


  const clearNotification = (id: string) => {
    setNotifications(prev => prev.filter(notif => notif.id !== id))
    setUnreadCount(prev => Math.max(0, prev - 1))
  }

  const handleTaskAction = async (taskId: string, _action: 'approve' | 'reject') => {
    try {
      // Note: This functionality needs to be updated for the new workflow system
      // For now, we'll disable this action
      toast.error('Task approval system is being updated for the new workflow system')
      clearNotification(taskId)
    } catch (error) {
      toast.error('Failed to update task status')
    }
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'deadline':
        return <ClockIcon className="h-6 w-6 text-yellow-500" />
      case 'welcome':
        return <CheckCircleIcon className="h-6 w-6 text-green-500" />
      case 'password':
        return <ExclamationCircleIcon className="h-6 w-6 text-blue-500" />
      case 'task_approval':
        return <InformationCircleIcon className="h-6 w-6 text-blue-500" />
      default:
        return <InformationCircleIcon className="h-6 w-6 text-gray-500" />
    }
  }

  return (
    <div className="relative">
      {/* Bell Icon with Badge */}
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="relative p-2 rounded-full hover:bg-gray-100 focus:outline-none"
      >
        <BellIcon className="h-6 w-6 text-gray-600" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-500 rounded-full">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Notifications Dropdown */}
      <AnimatePresence>
        {showDropdown && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg z-50"
          >
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Notifications</h3>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  No notifications
                </div>
              ) : (
                notifications.map(notification => (
                  <motion.div
                    key={notification.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className={`p-4 border-b border-gray-100 hover:bg-gray-50 ${
                      !notification.read ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="flex items-start space-x-3">
                      {getNotificationIcon(notification.type)}
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-gray-900">
                          {notification.title}
                        </h4>
                        <p className="text-sm text-gray-600 mt-1">
                          {notification.message}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(notification.timestamp).toLocaleString()}
                        </p>
                        {notification.type === 'task_approval' && notification.taskId ? (
                          <div className="flex items-center space-x-2 mt-2">
                            <button
                              onClick={() => handleTaskAction(notification.taskId!, 'approve')}
                              className="px-3 py-1 text-sm font-medium text-white bg-green-500 rounded hover:bg-green-600"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleTaskAction(notification.taskId!, 'reject')}
                              className="px-3 py-1 text-sm font-medium text-white bg-red-500 rounded hover:bg-red-600"
                            >
                              Reject
                            </button>
                          </div>
                        ) : notification.link && (
                          <button
                            onClick={() => {
                              // Mark as read/clear notification
                              clearNotification(notification.id)
                              // Close dropdown
                              setShowDropdown(false)
                              // Navigate to the link
                              navigate(notification.link!)
                              // If it's a comment mention, scroll to comments after navigation
                              if (notification.type === 'COMMENT_MENTION' || notification.type === 'task_approval') {
                                setTimeout(() => {
                                  const commentsSection = document.getElementById('comments-section')
                                  if (commentsSection) {
                                    commentsSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
                                  }
                                }, 500)
                              }
                            }}
                            className="text-sm text-blue-600 hover:text-blue-700 mt-2 inline-block font-medium"
                          >
                            View Details →
                          </button>
                        )}
                      </div>
                      <button
                        onClick={() => clearNotification(notification.id)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <XMarkIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default NotificationManager
