import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { 
  PlusIcon, 
  CheckIcon, 
  TrashIcon, 
  UserIcon,
  ClockIcon,
  FlagIcon,
  CalendarDaysIcon
} from '@heroicons/react/24/outline'
import { 
  CheckCircleIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/solid'
import { tasksApi } from '@/services/api'
import { useAppSelector } from '@/hooks/redux'
import toast from 'react-hot-toast'

interface Subtask {
  id: string
  title: string
  description?: string
  isCompleted: boolean
  completedAt?: string
  createdAt: string
  assignedTo?: {
    id: string
    name: string
    email: string
    position?: string
  }
  phase?: {
    id: string
    name: string
    color: string
  }
  suggestedRole?: string
  estimatedHours?: number
  dueDate?: string
}

interface SubtaskListProps {
  taskId: string
  subtasks: Subtask[]
  onSubtasksUpdated: () => void
}

const SubtaskList: React.FC<SubtaskListProps> = ({ taskId, subtasks, onSubtasksUpdated }) => {
  const { user } = useAppSelector((state) => state.auth)
  const [newSubtask, setNewSubtask] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!newSubtask.trim()) return

    setSubmitting(true)
    try {
      await tasksApi.addSubtask(taskId, {
        title: newSubtask.trim()
      })
      setNewSubtask('')
      onSubtasksUpdated()
      toast.success('Subtask added successfully')
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to add subtask'
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleToggleComplete = async (subtaskId: string, completed: boolean) => {
    try {
      await tasksApi.updateSubtask(taskId, subtaskId, { completed: completed })
      onSubtasksUpdated()
      toast.success('Subtask updated successfully')
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to update subtask'
      toast.error(message)
    }
  }

  const handleDelete = async (subtaskId: string) => {
    try {
      await tasksApi.deleteSubtask(taskId, subtaskId)
      onSubtasksUpdated()
      toast.success('Subtask deleted successfully')
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to delete subtask'
      toast.error(message)
    }
  }

  const canManageSubtasks = () => {
    return user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN'
  }

  return (
    <div className="space-y-6">
      {/* Header with Stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <FlagIcon className="h-5 w-5 mr-2 text-blue-600" />
            Subtasks
          </h3>
          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
              <CheckCircleIcon className="h-3 w-3 mr-1" />
              {subtasks.filter(s => s.isCompleted).length} completed
            </span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {subtasks.length - subtasks.filter(s => s.isCompleted).length} remaining
            </span>
          </div>
        </div>
      </div>

      {/* Subtasks Grid */}
      <div className="grid gap-4">
        {subtasks.map((subtask, index) => {
          const isOverdue = subtask.dueDate && new Date(subtask.dueDate) < new Date() && !subtask.isCompleted
          
          return (
          <motion.div
            key={subtask.id}
              initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
              className={`group relative bg-white rounded-xl border-2 transition-all duration-200 hover:shadow-lg ${
                subtask.isCompleted 
                  ? 'border-green-200 bg-green-50/30' 
                  : isOverdue
                  ? 'border-red-200 bg-red-50/30'
                  : 'border-gray-200 hover:border-blue-300'
              }`}
            >
              {/* Progress Bar */}
              {subtask.isCompleted && (
                <div className="absolute top-0 left-0 right-0 h-1 bg-green-500 rounded-t-xl"></div>
              )}
              {isOverdue && (
                <div className="absolute top-0 left-0 right-0 h-1 bg-red-500 rounded-t-xl"></div>
              )}

              <div className="p-6">
                <div className="flex items-start justify-between">
                  {/* Main Content */}
                  <div className="flex items-start space-x-4 flex-1">
                    {/* Completion Toggle */}
              <button
                      onClick={() => handleToggleComplete(subtask.id, !subtask.isCompleted)}
                      className={`mt-1 h-6 w-6 rounded-lg border-2 flex items-center justify-center transition-all duration-200 ${
                        subtask.isCompleted
                          ? 'bg-green-500 border-green-500 text-white shadow-lg'
                          : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'
                      }`}
                    >
                      {subtask.isCompleted && <CheckIcon className="h-4 w-4" />}
              </button>

                    {/* Task Details */}
                    <div className="flex-1 min-w-0">
                      <h4 className={`text-base font-semibold transition-all duration-200 ${
                        subtask.isCompleted 
                          ? 'text-gray-500 line-through' 
                          : 'text-gray-900'
                      }`}>
                  {subtask.title}
                      </h4>
                      
                      {subtask.description && (
                        <p className={`mt-1 text-sm ${
                          subtask.isCompleted ? 'text-gray-400' : 'text-gray-600'
                        }`}>
                          {subtask.description}
                        </p>
                      )}

                      {/* Metadata */}
                      <div className="flex flex-wrap items-center gap-3 mt-3">
                        {/* Assignee */}
                        {subtask.assignedTo && (
                          <div className="flex items-center space-x-1.5 bg-blue-50 px-2.5 py-1 rounded-lg">
                            <UserIcon className="h-3.5 w-3.5 text-blue-600" />
                            <span className="text-xs font-medium text-blue-700">
                              {subtask.assignedTo.name}
                            </span>
                            {subtask.assignedTo.position && (
                              <span className="text-xs text-blue-600">
                                ({subtask.assignedTo.position})
                              </span>
                            )}
                          </div>
                        )}

                        {/* Phase */}
                        {subtask.phase && (
                          <div 
                            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg"
                            style={{ 
                              backgroundColor: `${subtask.phase.color}20`,
                              color: subtask.phase.color
                            }}
                          >
                            <div 
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: subtask.phase.color }}
                            ></div>
                            <span className="text-xs font-medium">
                              {subtask.phase.name}
                            </span>
                          </div>
                        )}

                        {/* Estimated Hours */}
                        {subtask.estimatedHours && (
                          <div className="flex items-center space-x-1.5 bg-purple-50 px-2.5 py-1 rounded-lg">
                            <ClockIcon className="h-3.5 w-3.5 text-purple-600" />
                            <span className="text-xs font-medium text-purple-700">
                              {subtask.estimatedHours}h
                            </span>
                          </div>
                        )}

                        {/* Due Date */}
                        {subtask.dueDate && (
                          <div className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg ${
                            isOverdue 
                              ? 'bg-red-50 text-red-700' 
                              : 'bg-gray-50 text-gray-700'
                          }`}>
                            <CalendarDaysIcon className={`h-3.5 w-3.5 ${
                              isOverdue ? 'text-red-600' : 'text-gray-600'
                            }`} />
                            <span className="text-xs font-medium">
                              {new Date(subtask.dueDate).toLocaleDateString()}
                            </span>
                            {isOverdue && (
                              <ExclamationTriangleIcon className="h-3 w-3 text-red-500" />
                            )}
                          </div>
                        )}
                      </div>
              </div>
            </div>

                  {/* Actions */}
            {canManageSubtasks() && (
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => handleDelete(subtask.id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200"
                        title="Delete subtask"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
                    </div>
            )}
                </div>
              </div>
          </motion.div>
          )
        })}

        {/* Empty State */}
        {subtasks.length === 0 && (
          <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
            <FlagIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">No subtasks yet</h3>
            <p className="mt-2 text-gray-500">Break down this task into smaller, manageable pieces.</p>
          </div>
        )}
      </div>

      {/* Add Subtask Form */}
      <div className="bg-gray-50 rounded-xl p-6 border-2 border-dashed border-gray-300">
        <form onSubmit={handleSubmit} className="flex items-center space-x-4">
        <div className="flex-1">
          <input
            type="text"
            value={newSubtask}
            onChange={(e) => setNewSubtask(e.target.value)}
              placeholder="Add a new subtask..."
              className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
            disabled={submitting}
          />
        </div>
        <button
          type="submit"
          disabled={!newSubtask.trim() || submitting}
            className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
        >
          {submitting ? (
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
          ) : (
              <>
                <PlusIcon className="h-5 w-5 mr-2" />
                Add Subtask
              </>
          )}
        </button>
      </form>
      </div>
    </div>
  )
}

export default SubtaskList
