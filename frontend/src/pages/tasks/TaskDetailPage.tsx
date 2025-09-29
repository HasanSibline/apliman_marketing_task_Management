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
import FileUpload from '@/components/tasks/FileUpload'
import TaskComments from '@/components/tasks/TaskComments'

const TaskDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const dispatch = useAppDispatch()
  const { currentTask, isLoading } = useAppSelector((state) => state.tasks)

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
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center mb-4">
              <PaperClipIcon className="h-5 w-5 mr-2" />
              Files ({(currentTask as any).files?.length || 0})
            </h2>
            
            <FileUpload 
              taskId={currentTask.id}
              files={(currentTask as any).files || []}
              onFilesUpdated={() => dispatch(fetchTaskById(currentTask.id))}
            />
          </div>
        </motion.div>

        {/* Comments */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="card"
        >
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center mb-4">
              <ChatBubbleLeftIcon className="h-5 w-5 mr-2" />
              Comments ({(currentTask as any).comments?.length || 0})
            </h2>
            
            <TaskComments 
              taskId={currentTask.id}
              comments={(currentTask as any).comments || []}
              onCommentsUpdated={() => dispatch(fetchTaskById(currentTask.id))}
            />
          </div>
        </motion.div>
      </div>
    </div>
  )
}

export default TaskDetailPage
