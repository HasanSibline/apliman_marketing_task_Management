import React, { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { 
  PaperClipIcon, 
  ChatBubbleLeftIcon,
  CalendarIcon,
  UserIcon 
} from '@heroicons/react/24/outline'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { fetchTaskById } from '@/store/slices/tasksSlice'

const TaskDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const dispatch = useAppDispatch()
  const { currentTask, isLoading } = useAppSelector((state) => state.tasks)
  const { user } = useAppSelector((state) => state.auth)

  useEffect(() => {
    if (id) {
      dispatch(fetchTaskById(id))
    }
  }, [dispatch, id])

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!currentTask) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">Task not found</p>
      </div>
    )
  }

  const phaseColors = {
    PENDING_APPROVAL: 'bg-gray-100 text-gray-800',
    APPROVED: 'bg-blue-100 text-blue-800',
    ASSIGNED: 'bg-purple-100 text-purple-800',
    IN_PROGRESS: 'bg-yellow-100 text-yellow-800',
    COMPLETED: 'bg-green-100 text-green-800',
    ARCHIVED: 'bg-gray-100 text-gray-600',
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="card"
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center space-x-3 mb-2">
              <h1 className="text-2xl font-bold text-gray-900">
                {currentTask.title}
              </h1>
              <span className={`status-badge ${phaseColors[currentTask.phase as keyof typeof phaseColors]}`}>
                {currentTask.phase.replace('_', ' ')}
              </span>
            </div>
            <div className="flex items-center space-x-4 text-sm text-gray-600">
              <div className="flex items-center space-x-1">
                <UserIcon className="h-4 w-4" />
                <span>Created by {currentTask.createdBy.name}</span>
              </div>
              {currentTask.assignedTo && (
                <div className="flex items-center space-x-1">
                  <UserIcon className="h-4 w-4" />
                  <span>Assigned to {currentTask.assignedTo.name}</span>
                </div>
              )}
              <div className="flex items-center space-x-1">
                <CalendarIcon className="h-4 w-4" />
                <span>Created {new Date(currentTask.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl text-yellow-500 mb-1">
              {'★'.repeat(currentTask.priority)}
            </div>
            {currentTask.dueDate && (
              <p className="text-sm text-red-600">
                Due: {new Date(currentTask.dueDate).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>

        <div className="prose max-w-none">
          <h3>Description</h3>
          <p className="text-gray-700">{currentTask.description}</p>
          
          {currentTask.goals && (
            <>
              <h3>Goals</h3>
              <p className="text-gray-700">{currentTask.goals}</p>
            </>
          )}
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Files */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="card"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <PaperClipIcon className="h-5 w-5 mr-2" />
              Files ({currentTask.files?.length || 0})
            </h2>
            <button className="btn-secondary text-sm">
              Upload File
            </button>
          </div>
          
          <div className="space-y-2">
            {currentTask.files && currentTask.files.length > 0 ? (
              currentTask.files.map((file: any) => (
                <div key={file.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">{file.fileName}</p>
                    <p className="text-sm text-gray-500">
                      {(file.fileSize / 1024).toFixed(1)} KB • {new Date(file.uploadedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button className="text-primary-600 hover:text-primary-800 text-sm">
                    Download
                  </button>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-4">No files uploaded</p>
            )}
          </div>
        </motion.div>

        {/* Comments */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="card"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <ChatBubbleLeftIcon className="h-5 w-5 mr-2" />
              Comments ({currentTask.comments?.length || 0})
            </h2>
          </div>
          
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {currentTask.comments && currentTask.comments.length > 0 ? (
              currentTask.comments.map((comment: any) => (
                <div key={comment.id} className="flex space-x-3">
                  <div className="h-8 w-8 rounded-full bg-primary-600 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-medium text-white">
                      {comment.user.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="font-medium text-gray-900">{comment.user.name}</span>
                      <span className="text-sm text-gray-500">
                        {new Date(comment.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-gray-700">{comment.comment}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-4">No comments yet</p>
            )}
          </div>

          {/* Add Comment */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex space-x-3">
              <div className="h-8 w-8 rounded-full bg-primary-600 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-medium text-white">
                  {user?.name?.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1">
                <textarea
                  placeholder="Add a comment..."
                  className="input-field resize-none"
                  rows={3}
                />
                <div className="mt-2 flex justify-end">
                  <button className="btn-primary text-sm">
                    Add Comment
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

export default TaskDetailPage
