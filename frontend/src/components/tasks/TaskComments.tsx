import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { PaperAirplaneIcon } from '@heroicons/react/24/outline'
import { useAppSelector } from '@/hooks/redux'
import { tasksApi } from '@/services/api'

interface TaskCommentsProps {
  taskId: string
  comments: any[]
  onCommentsUpdated: () => void
}

const TaskComments: React.FC<TaskCommentsProps> = ({ taskId, comments, onCommentsUpdated }) => {
  const { user } = useAppSelector((state) => state.auth)
  const [newComment, setNewComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!newComment.trim()) return

    setSubmitting(true)
    try {
      await tasksApi.addComment(taskId, newComment.trim())
      setNewComment('')
      console.log('Comment added successfully!')
      onCommentsUpdated()
    } catch (error) {
      console.error('Error adding comment:', error)
    } finally {
      setSubmitting(false)
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
    <div className="space-y-4">
      {/* Comments List */}
      <div className="space-y-4 max-h-96 overflow-y-auto">
        {comments && comments.length > 0 ? (
          comments.map((comment: any, index: number) => (
            <motion.div
              key={comment.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="flex space-x-3"
            >
              <div className="h-8 w-8 rounded-full bg-primary-600 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-medium text-white">
                  {comment.user?.name?.charAt(0).toUpperCase() || 'U'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-gray-900">
                      {comment.user?.name || 'Unknown User'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatTimeAgo(comment.createdAt)}
                    </p>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {comment.comment}
                  </p>
                </div>
              </div>
            </motion.div>
          ))
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-500">No comments yet. Be the first to comment!</p>
          </div>
        )}
      </div>

      {/* Add Comment Form */}
      <form onSubmit={handleSubmitComment} className="border-t border-gray-200 pt-4">
        <div className="flex space-x-3">
          <div className="h-8 w-8 rounded-full bg-primary-600 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-medium text-white">
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </span>
          </div>
          <div className="flex-1">
            <div className="relative">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a comment..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                disabled={submitting}
              />
              <div className="absolute bottom-2 right-2">
                <button
                  type="submit"
                  disabled={!newComment.trim() || submitting}
                  className="inline-flex items-center p-2 text-primary-600 hover:text-primary-700 disabled:text-gray-400 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
                  ) : (
                    <PaperAirplaneIcon className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}

export default TaskComments
