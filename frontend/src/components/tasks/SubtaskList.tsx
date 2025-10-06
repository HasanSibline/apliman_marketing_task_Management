import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { PlusIcon, CheckIcon, TrashIcon, CalendarIcon, UserIcon } from '@heroicons/react/24/outline'
import { tasksApi } from '@/services/api'
import { useAppSelector } from '@/hooks/redux'
import { Subtask } from '@/types/task'
import toast from 'react-hot-toast'

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
      await tasksApi.addSubtask(taskId, newSubtask.trim())
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
      await tasksApi.updateSubtask(taskId, subtaskId, { completed })
      onSubtasksUpdated()
      toast.success(completed ? 'Subtask completed!' : 'Subtask reopened')
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to update subtask'
      toast.error(message)
    }
  }

  const handleDelete = async (subtaskId: string) => {
    if (!window.confirm('Are you sure you want to delete this subtask?')) {
      return
    }

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

  const completedCount = subtasks.filter(subtask => subtask.completed).length
  const totalCount = subtasks.length

  return (
    <div className="space-y-4">
      {/* Progress Header */}
      {totalCount > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <h3 className="text-lg font-medium text-gray-900">
              Subtasks ({completedCount}/{totalCount})
            </h3>
            <div className="w-32 bg-gray-200 rounded-full h-2">
              <div 
                className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
              />
            </div>
          </div>
          <span className="text-sm text-gray-500">
            {totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0}% complete
          </span>
        </div>
      )}

      {/* Subtasks List */}
      <div className="space-y-3">
        {subtasks.map((subtask, index) => (
          <motion.div
            key={subtask.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className={`p-4 rounded-lg border transition-all duration-200 ${
              subtask.completed 
                ? 'bg-gray-50 border-gray-200' 
                : 'bg-white border-gray-200 hover:border-primary-300'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3 flex-1">
                <button
                  onClick={() => handleToggleComplete(subtask.id, !subtask.completed)}
                  className={`mt-1 h-5 w-5 rounded border flex items-center justify-center transition-all duration-200 ${
                    subtask.completed
                      ? 'bg-primary-600 border-primary-600 text-white'
                      : 'border-gray-300 hover:border-primary-500 hover:bg-primary-50'
                  }`}
                >
                  {subtask.completed && <CheckIcon className="h-3 w-3" />}
                </button>
                
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium transition-all duration-200 ${
                    subtask.completed ? 'text-gray-500 line-through' : 'text-gray-900'
                  }`}>
                    {subtask.title}
                  </p>
                  
                  {subtask.description && (
                    <p className={`text-sm mt-1 ${
                      subtask.completed ? 'text-gray-400' : 'text-gray-600'
                    }`}>
                      {subtask.description}
                    </p>
                  )}
                  
                  <div className="flex items-center space-x-4 mt-2">
                    <div className="flex items-center space-x-1 text-xs text-gray-500">
                      <UserIcon className="h-3 w-3" />
                      <span>{subtask.createdBy.name}</span>
                    </div>
                    
                    <span className="text-xs text-gray-500">
                      {new Date(subtask.createdAt).toLocaleDateString()}
                    </span>
                    
                    {subtask.dueDate && (
                      <div className={`flex items-center space-x-1 text-xs ${
                        new Date(subtask.dueDate) < new Date() && !subtask.completed
                          ? 'text-red-600 font-medium'
                          : 'text-gray-500'
                      }`}>
                        <CalendarIcon className="h-3 w-3" />
                        <span>Due {new Date(subtask.dueDate).toLocaleDateString()}</span>
                      </div>
                    )}
                    
                    {subtask.assignedTo && (
                      <div className="flex items-center space-x-1 text-xs text-blue-600">
                        <UserIcon className="h-3 w-3" />
                        <span>Assigned to {subtask.assignedTo.name}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {canManageSubtasks() && (
                <button
                  onClick={() => handleDelete(subtask.id)}
                  className="text-gray-400 hover:text-red-600 transition-colors p-1"
                  title="Delete subtask"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          </motion.div>
        ))}

        {subtasks.length === 0 && (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckIcon className="h-8 w-8 text-gray-400" />
            </div>
            <p className="text-gray-500 text-sm">No subtasks yet</p>
            <p className="text-gray-400 text-xs mt-1">Break down this task into smaller steps</p>
          </div>
        )}
      </div>

      {/* Add Subtask Form */}
      <form onSubmit={handleSubmit} className="flex items-center space-x-3 pt-4 border-t border-gray-200">
        <div className="flex-1">
          <input
            type="text"
            value={newSubtask}
            onChange={(e) => setNewSubtask(e.target.value)}
            placeholder="Add a subtask..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
            disabled={submitting}
          />
        </div>
        <button
          type="submit"
          disabled={!newSubtask.trim() || submitting}
          className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          ) : (
            <>
              <PlusIcon className="h-4 w-4 mr-1" />
              Add
            </>
          )}
        </button>
      </form>
    </div>
  )
}

export default SubtaskList
