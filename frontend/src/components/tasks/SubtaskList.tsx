import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { PlusIcon, CheckIcon, TrashIcon } from '@heroicons/react/24/outline'
import { tasksApi } from '@/services/api'
import { useAppSelector } from '@/hooks/redux'
import toast from 'react-hot-toast'

interface Subtask {
  id: string
  title: string
  completed: boolean
  createdAt: string
  createdBy: {
    id: string
    name: string
  }
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
    <div className="space-y-4">
      {/* Subtasks List */}
      <div className="space-y-2">
        {subtasks.map((subtask, index) => (
          <motion.div
            key={subtask.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className={`flex items-center justify-between p-3 rounded-lg border ${
              subtask.completed ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200'
            }`}
          >
            <div className="flex items-center space-x-3">
              <button
                onClick={() => handleToggleComplete(subtask.id, !subtask.completed)}
                className={`h-5 w-5 rounded border flex items-center justify-center transition-colors ${
                  subtask.completed
                    ? 'bg-primary-600 border-primary-600 text-white'
                    : 'border-gray-300 hover:border-primary-500'
                }`}
              >
                {subtask.completed && <CheckIcon className="h-3 w-3" />}
              </button>
              <div>
                <p className={`text-sm ${subtask.completed ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                  {subtask.title}
                </p>
                <p className="text-xs text-gray-500">
                  Added by {subtask.createdBy.name} on {new Date(subtask.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
            {canManageSubtasks() && (
              <button
                onClick={() => handleDelete(subtask.id)}
                className="text-gray-400 hover:text-red-600 transition-colors"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            )}
          </motion.div>
        ))}

        {subtasks.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-500">No subtasks yet</p>
          </div>
        )}
      </div>

      {/* Add Subtask Form */}
      <form onSubmit={handleSubmit} className="flex items-center space-x-2">
        <div className="flex-1">
          <input
            type="text"
            value={newSubtask}
            onChange={(e) => setNewSubtask(e.target.value)}
            placeholder="Add a subtask..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            disabled={submitting}
          />
        </div>
        <button
          type="submit"
          disabled={!newSubtask.trim() || submitting}
          className="btn-primary"
        >
          {submitting ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          ) : (
            <PlusIcon className="h-4 w-4" />
          )}
        </button>
      </form>
    </div>
  )
}

export default SubtaskList
