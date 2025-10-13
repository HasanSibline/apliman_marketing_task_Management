import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { BellIcon } from '@heroicons/react/24/outline'
import { motion, AnimatePresence } from 'framer-motion'
import { notificationsApi } from '@/services/api'
import { useAppSelector } from '@/hooks/redux'
import toast from 'react-hot-toast'

interface Notification {
  id: string
  type: string
  title: string
  message: string
  read: boolean
  createdAt: string
  taskId?: string
  subtaskId?: string
  actionUrl?: string
  task?: {
    id: string
    title: string
    phase: string
  }
}

const NotificationBell: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAppSelector((state) => state.auth)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (user) {
      loadNotifications()
      loadUnreadCount()
      
      // Set up more frequent polling for better real-time updates
      const pollInterval = setInterval(() => {
        loadUnreadCount()
        if (isOpen) {
          loadNotifications()
        }
      }, 10000) // Poll every 10 seconds instead of 30

      return () => clearInterval(pollInterval)
    }
  }, [user, isOpen])

  // Listen for task updates to refresh notifications
  useEffect(() => {
    const handleTaskUpdate = () => {
      console.log('Task updated - refreshing notifications')
      loadUnreadCount()
      loadNotifications() // Always refresh notifications, not just when open
    }

    // Listen for custom events from task updates
    window.addEventListener('taskUpdated', handleTaskUpdate)
    return () => window.removeEventListener('taskUpdated', handleTaskUpdate)
  }, [])

  const loadNotifications = async () => {
    try {
      setIsLoading(true)
      const response = await notificationsApi.getNotifications({ page: 1, limit: 10 })
      console.log('Loaded notifications:', response)
      setNotifications(response.notifications || [])
    } catch (error) {
      console.error('Failed to load notifications:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const loadUnreadCount = async () => {
    try {
      const response = await notificationsApi.getUnreadCount()
      console.log('Loaded unread count:', response.count)
      setUnreadCount(response.count)
    } catch (error) {
      console.error('Failed to load unread count:', error)
    }
  }

  const markAsRead = async (notificationId: string) => {
    try {
      await notificationsApi.markAsRead(notificationId)
      setNotifications(prev => 
        prev.map(notif => 
          notif.id === notificationId ? { ...notif, read: true } : notif
        )
      )
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (error) {
      toast.error('Failed to mark notification as read')
    }
  }

  const markAllAsRead = async () => {
    try {
      await notificationsApi.markAllAsRead()
      setNotifications(prev => prev.map(notif => ({ ...notif, read: true })))
      setUnreadCount(0)
      toast.success('All notifications marked as read')
    } catch (error) {
      toast.error('Failed to mark all notifications as read')
    }
  }

  const deleteNotification = async (notificationId: string) => {
    try {
      await notificationsApi.deleteNotification(notificationId)
      setNotifications(prev => prev.filter(notif => notif.id !== notificationId))
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (error) {
      toast.error('Failed to delete notification')
    }
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'task_created':
        return '📝'
      case 'task_assigned':
        return '📋'
      case 'task_approved':
        return '✅'
      case 'task_rejected':
        return '❌'
      case 'task_completed':
        return '🎉'
      case 'task_phase_changed':
        return '🔄'
      default:
        return '🔔'
    }
  }

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'task_created':
        return 'text-purple-600'
      case 'task_assigned':
        return 'text-blue-600'
      case 'task_approved':
        return 'text-green-600'
      case 'task_rejected':
        return 'text-red-600'
      case 'task_completed':
        return 'text-green-600'
      case 'task_phase_changed':
        return 'text-yellow-600'
      default:
        return 'text-gray-600'
    }
  }

  if (!user) return null

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <BellIcon className="h-6 w-6" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50"
          >
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Notifications</h3>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    Mark all read
                  </button>
                )}
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {isLoading ? (
                <div className="p-4 text-center text-gray-500">
                  Loading notifications...
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  No notifications
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`p-4 hover:bg-gray-50 cursor-pointer ${
                        !notification.read ? 'bg-blue-50' : ''
                      }`}
                      onClick={() => {
                        // Mark as read
                        if (!notification.read) {
                          markAsRead(notification.id)
                        }
                        
                        // Navigate to the appropriate page
                        if (notification.actionUrl) {
                          navigate(notification.actionUrl)
                          setIsOpen(false)
                        } else if (notification.taskId) {
                          navigate(`/tasks/${notification.taskId}`)
                          setIsOpen(false)
                        }
                      }}
                    >
                      <div className="flex items-start space-x-3">
                        <div className="text-lg">
                          {getNotificationIcon(notification.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className={`text-sm font-medium ${getNotificationColor(notification.type)}`}>
                              {notification.title}
                            </p>
                            {!notification.read && (
                              <div className="h-2 w-2 bg-blue-500 rounded-full"></div>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mt-1">
                            {notification.message}
                          </p>
                          {notification.task && (
                            <p className="text-xs text-gray-500 mt-1">
                              Task: {notification.task.title}
                            </p>
                          )}
                          <p className="text-xs text-gray-400 mt-1">
                            {new Date(notification.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteNotification(notification.id)
                          }}
                          className="text-gray-400 hover:text-red-500 text-sm"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default NotificationBell
