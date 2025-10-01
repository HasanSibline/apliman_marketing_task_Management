import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  XMarkIcon, 
  PaperClipIcon,
  ChevronDownIcon,
  CheckIcon,
  ClockIcon,
  ChatBubbleLeftIcon,
  DocumentTextIcon,
  ArrowPathIcon,
  PlayIcon,
} from '@heroicons/react/24/outline'
import { Menu } from '@headlessui/react'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { tasksApi } from '@/services/api'
import { fetchTasks } from '@/store/slices/tasksSlice'
import TaskComments from './TaskComments'
import FileUpload from './FileUpload'
import TaskActivityLog from './TaskActivityLog'
import TaskAIAnalysis from './TaskAIAnalysis'
import SubtaskList from './SubtaskList'
import TimeTracker from './TimeTracker'
import toast from 'react-hot-toast'

interface TaskDetailModalProps {
  isOpen: boolean
  onClose: () => void
  task: any
}

const TaskDetailModal: React.FC<TaskDetailModalProps> = ({ isOpen, onClose, task }) => {
  const dispatch = useAppDispatch()
  const { user } = useAppSelector((state) => state.auth)
  const [isLoading, setIsLoading] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [showFiles, setShowFiles] = useState(false)
  const [showActivityLog, setShowActivityLog] = useState(false)
  const [showAIAnalysis, setShowAIAnalysis] = useState(false)
  const [showSubtasks, setShowSubtasks] = useState(false)
  const [showTimeTracker, setShowTimeTracker] = useState(false)
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    goals: '',
    priority: 3,
    dueDate: '',
    assignedToId: '',
    phase: '',
  })

  useEffect(() => {
    if (task) {
      setFormData({
        title: task.title,
        description: task.description,
        goals: task.goals || '',
        priority: task.priority,
        dueDate: task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '',
        assignedToId: task.assignedToId || '',
        phase: task.phase,
      })
    }
  }, [task])

  const phases = [
    { key: 'PENDING_APPROVAL', title: 'Pending Approval' },
    { key: 'APPROVED', title: 'Approved' },
    { key: 'ASSIGNED', title: 'Assigned' },
    { key: 'IN_PROGRESS', title: 'In Progress' },
    { key: 'COMPLETED', title: 'Completed' },
    { key: 'ARCHIVED', title: 'Archived' },
  ]

  const canEditTask = () => {
    if (user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN') return true
    return task.createdById === user?.id || task.assignedToId === user?.id
  }

  const canChangePhase = (newPhase: string) => {
    if (user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN') return true
    if (task.assignedToId !== user?.id) return false

    // Phase transition rules for employees
    const phaseOrder = ['PENDING_APPROVAL', 'APPROVED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED']
    const currentIndex = phaseOrder.indexOf(task.phase)
    const newIndex = phaseOrder.indexOf(newPhase)

    // Can only move one step forward or backward
    return Math.abs(newIndex - currentIndex) === 1
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    setIsLoading(true)
    try {
      const taskData = {
        ...formData,
        dueDate: formData.dueDate ? new Date(formData.dueDate).toISOString() : undefined,
        assignedToId: formData.assignedToId || undefined,
      }

      await tasksApi.update(task.id, taskData)
      toast.success('Task updated successfully!')
      dispatch(fetchTasks({}))
      setIsEditing(false)
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to update task'
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  const handlePhaseChange = async (newPhase: string) => {
    if (!canChangePhase(newPhase)) {
      toast.error('You do not have permission to change to this phase')
      return
    }

    setIsLoading(true)
    try {
      await tasksApi.update(task.id, { phase: newPhase })
      toast.success('Task phase updated successfully!')
      dispatch(fetchTasks({}))
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to update task phase'
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: name === 'priority' ? parseInt(value) : value
    }))
  }

  const getPriorityColor = (priority: number) => {
    switch (priority) {
      case 1: return 'bg-gray-100 text-gray-800'
      case 2: return 'bg-blue-100 text-blue-800'
      case 3: return 'bg-yellow-100 text-yellow-800'
      case 4: return 'bg-orange-100 text-orange-800'
      case 5: return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getPriorityText = (priority: number) => {
    switch (priority) {
      case 1: return 'Low'
      case 2: return 'Medium'
      case 3: return 'Normal'
      case 4: return 'High'
      case 5: return 'Critical'
      default: return 'Normal'
    }
  }

  const getPhaseColor = (phase: string) => {
    switch (phase) {
      case 'PENDING_APPROVAL': return 'bg-gray-100 text-gray-800'
      case 'APPROVED': return 'bg-blue-100 text-blue-800'
      case 'ASSIGNED': return 'bg-purple-100 text-purple-800'
      case 'IN_PROGRESS': return 'bg-yellow-100 text-yellow-800'
      case 'COMPLETED': return 'bg-green-100 text-green-800'
      case 'ARCHIVED': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black bg-opacity-50"
              onClick={onClose}
            />
            
            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-4xl bg-white rounded-lg shadow-xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <div className="flex items-center space-x-4">
                  <h2 className="text-xl font-semibold text-gray-900">Task Details</h2>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${getPhaseColor(task.phase)}`}>
                    {task.phase.replace('_', ' ')}
                  </span>
                </div>
                <div className="flex items-center space-x-4">
                  {canEditTask() && !isEditing && (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="btn-secondary"
                    >
                      Edit Task
                    </button>
                  )}
                  <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>
              </div>

              <div className="p-6">
                <div className="flex space-x-8">
                  {/* Main Content */}
                  <div className="flex-1">
                    {isEditing ? (
                      <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Title */}
                        <div>
                          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
                            Task Title *
                          </label>
                          <input
                            type="text"
                            id="title"
                            name="title"
                            required
                            value={formData.title}
                            onChange={handleChange}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                          />
                        </div>

                        {/* Description */}
                        <div>
                          <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                            Description *
                          </label>
                          <textarea
                            id="description"
                            name="description"
                            required
                            rows={4}
                            value={formData.description}
                            onChange={handleChange}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                          />
                        </div>

                        {/* Goals */}
                        <div>
                          <label htmlFor="goals" className="block text-sm font-medium text-gray-700 mb-2">
                            Goals & Success Criteria
                          </label>
                          <textarea
                            id="goals"
                            name="goals"
                            rows={3}
                            value={formData.goals}
                            onChange={handleChange}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                          />
                        </div>

                        {/* Priority and Due Date */}
                        <div className="grid grid-cols-2 gap-6">
                          <div>
                            <label htmlFor="priority" className="block text-sm font-medium text-gray-700 mb-2">
                              Priority
                            </label>
                            <select
                              id="priority"
                              name="priority"
                              value={formData.priority}
                              onChange={handleChange}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            >
                              <option value={1}>1 - Low</option>
                              <option value={2}>2 - Medium</option>
                              <option value={3}>3 - Normal</option>
                              <option value={4}>4 - High</option>
                              <option value={5}>5 - Critical</option>
                            </select>
                          </div>

                          <div>
                            <label htmlFor="dueDate" className="block text-sm font-medium text-gray-700 mb-2">
                              Due Date
                            </label>
                            <input
                              type="date"
                              id="dueDate"
                              name="dueDate"
                              value={formData.dueDate}
                              onChange={handleChange}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            />
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-end space-x-3 pt-6 border-t border-gray-200">
                          <button
                            type="button"
                            onClick={() => setIsEditing(false)}
                            className="btn-secondary"
                            disabled={isLoading}
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="btn-primary"
                            disabled={isLoading}
                          >
                            {isLoading ? 'Saving...' : 'Save Changes'}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="space-y-6">
                        {/* Title */}
                        <div>
                          <h3 className="text-lg font-medium text-gray-900">
                            {task.title}
                          </h3>
                          <div className="mt-2 flex items-center space-x-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(task.priority)}`}>
                              {getPriorityText(task.priority)}
                            </span>
                            {task.dueDate && (
                              <span className="text-sm text-gray-500 flex items-center">
                                <ClockIcon className="h-4 w-4 mr-1" />
                                Due {new Date(task.dueDate).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Description */}
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 mb-2">Description</h4>
                          <p className="text-gray-600 whitespace-pre-wrap">
                            {task.description}
                          </p>
                        </div>

                        {/* Goals */}
                        {task.goals && (
                          <div>
                            <h4 className="text-sm font-medium text-gray-700 mb-2">Goals & Success Criteria</h4>
                            <p className="text-gray-600 whitespace-pre-wrap">
                              {task.goals}
                            </p>
                          </div>
                        )}

                        {/* Task Stats */}
                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200">
                          <div>
                            <h4 className="text-sm font-medium text-gray-700 mb-2">Created By</h4>
                            <div className="flex items-center space-x-2">
                              <div className="h-8 w-8 rounded-full bg-primary-600 flex items-center justify-center">
                                <span className="text-sm font-medium text-white">
                                  {task.createdBy?.name?.charAt(0).toUpperCase() || 'U'}
                                </span>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-900">
                                  {task.createdBy?.name || 'Unknown User'}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {new Date(task.createdAt).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                          </div>

                          {task.assignedTo && (
                            <div>
                              <h4 className="text-sm font-medium text-gray-700 mb-2">Assigned To</h4>
                              <div className="flex items-center space-x-2">
                                <div className="h-8 w-8 rounded-full bg-primary-600 flex items-center justify-center">
                                  <span className="text-sm font-medium text-white">
                                    {task.assignedTo?.name?.charAt(0).toUpperCase()}
                                  </span>
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-gray-900">
                                    {task.assignedTo?.name}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    {task.assignedTo?.position}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Sidebar */}
                  <div className="w-64 space-y-6">
                    {/* Phase Selection */}
                    {!isEditing && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Task Phase</h4>
                        {task.phase === 'PENDING_APPROVAL' && (user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN') ? (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between px-4 py-2 bg-yellow-50 border border-yellow-200 rounded-md">
                              <span className="text-sm font-medium text-yellow-800">Pending Approval</span>
                              <div className="flex items-center space-x-2">
                                <button
                                  onClick={() => handlePhaseChange('APPROVED')}
                                  className="px-3 py-1 text-sm font-medium text-white bg-green-500 rounded hover:bg-green-600"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handlePhaseChange('REJECTED')}
                                  className="px-3 py-1 text-sm font-medium text-white bg-red-500 rounded hover:bg-red-600"
                                >
                                  Reject
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <Menu as="div" className="relative">
                            <Menu.Button className="w-full px-4 py-2 text-left text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent">
                              <span className="flex items-center justify-between">
                                {task.phase.replace('_', ' ')}
                                <ChevronDownIcon className="h-5 w-5 text-gray-400" />
                              </span>
                            </Menu.Button>
                            <Menu.Items className="absolute right-0 mt-2 w-56 bg-white rounded-md shadow-lg border border-gray-200 focus:outline-none z-10">
                              <div className="py-1">
                                {phases.map((phase) => (
                                  <Menu.Item key={phase.key}>
                                    {({ active }) => (
                                      <button
                                        onClick={() => handlePhaseChange(phase.key)}
                                        disabled={!canChangePhase(phase.key)}
                                        className={`${
                                          active ? 'bg-gray-100' : ''
                                        } ${
                                          !canChangePhase(phase.key) ? 'opacity-50 cursor-not-allowed' : ''
                                        } flex items-center w-full px-4 py-2 text-sm text-gray-700`}
                                      >
                                        {task.phase === phase.key && (
                                          <CheckIcon className="h-4 w-4 mr-3 text-primary-600" />
                                        )}
                                        <span className={task.phase !== phase.key ? 'ml-7' : ''}>
                                          {phase.title}
                                        </span>
                                      </button>
                                    )}
                                  </Menu.Item>
                                ))}
                              </div>
                            </Menu.Items>
                          </Menu>
                        )}
                      </div>
                    )}

                    {/* Activity Buttons */}
                    <div className="space-y-2">
                      <button
                        onClick={() => setShowComments(!showComments)}
                        className="w-full flex items-center justify-between px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                      >
                        <span className="flex items-center">
                          <ChatBubbleLeftIcon className="h-5 w-5 mr-2" />
                          Comments
                        </span>
                        <span className="bg-gray-100 px-2 py-1 rounded-full text-xs">
                          {task.comments?.length || 0}
                        </span>
                      </button>

                      <button
                        onClick={() => setShowFiles(!showFiles)}
                        className="w-full flex items-center justify-between px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                      >
                        <span className="flex items-center">
                          <PaperClipIcon className="h-5 w-5 mr-2" />
                          Files
                        </span>
                        <span className="bg-gray-100 px-2 py-1 rounded-full text-xs">
                          {task.files?.length || 0}
                        </span>
                      </button>

                      <button
                        onClick={() => setShowActivityLog(!showActivityLog)}
                        className="w-full flex items-center justify-between px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                      >
                        <span className="flex items-center">
                          <ArrowPathIcon className="h-5 w-5 mr-2" />
                          Activity
                        </span>
                      </button>

                      <button
                        onClick={() => setShowAIAnalysis (!showAIAnalysis)}
                        className="w-full flex items-center justify-between px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                      >
                        <span className="flex items-center">
                          <DocumentTextIcon className="h-5 w-5 mr-2" />
                          AI Analysis
                        </span>
                      </button>

                      <button
                        onClick={() => setShowSubtasks(!showSubtasks)}
                        className="w-full flex items-center justify-between px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                      >
                        <span className="flex items-center">
                          <CheckIcon className="h-5 w-5 mr-2" />
                          Subtasks
                        </span>
                        <span className="bg-gray-100 px-2 py-1 rounded-full text-xs">
                          {task.subtasks?.length || 0}
                        </span>
                      </button>

                      <button
                        onClick={() => setShowTimeTracker(!showTimeTracker)}
                        className="w-full flex items-center justify-between px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                      >
                        <span className="flex items-center">
                          <PlayIcon className="h-5 w-5 mr-2" />
                          Time Tracking
                        </span>
                        <span className="bg-gray-100 px-2 py-1 rounded-full text-xs">
                          {task.timeEntries?.length || 0}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Comments Section */}
                {showComments && (
                  <div className="mt-8 pt-6 border-t border-gray-200">
                    <TaskComments
                      taskId={task.id}
                      comments={task.comments || []}
                      onCommentsUpdated={() => dispatch(fetchTasks({}))}
                    />
                  </div>
                )}

                {/* Files Section */}
                {showFiles && (
                  <div className="mt-8 pt-6 border-t border-gray-200">
                    <FileUpload
                      taskId={task.id}
                      files={task.files || []}
                      onFilesUpdated={() => dispatch(fetchTasks({}))}
                    />
                  </div>
                )}

                {/* Activity Log Section */}
                {showActivityLog && (
                  <div className="mt-8 pt-6 border-t border-gray-200">
                    <TaskActivityLog
                      activities={task.activities || []}
                    />
                  </div>
                )}

                {/* AI Analysis Section */}
                {showAIAnalysis && (
                  <div className="mt-8 pt-6 border-t border-gray-200">
                    <TaskAIAnalysis
                      task={task}
                    />
                  </div>
                )}

                {/* Subtasks Section */}
                {showSubtasks && (
                  <div className="mt-8 pt-6 border-t border-gray-200">
                    <SubtaskList
                      taskId={task.id}
                      subtasks={task.subtasks || []}
                      onSubtasksUpdated={() => dispatch(fetchTasks({}))}
                    />
                  </div>
                )}

                {/* Time Tracking Section */}
                {showTimeTracker && (
                  <div className="mt-8 pt-6 border-t border-gray-200">
                    <TimeTracker
                      taskId={task.id}
                      timeEntries={task.timeEntries || []}
                      onTimeEntriesUpdated={() => dispatch(fetchTasks({}))}
                    />
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  )
}

export default TaskDetailModal
