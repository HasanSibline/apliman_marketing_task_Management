import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { XMarkIcon, SparklesIcon } from '@heroicons/react/24/outline'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { createTask, fetchTasks } from '@/store/slices/tasksSlice'
import { fetchAssignableUsers } from '@/store/slices/usersSlice'
import { useEffect } from 'react'
import ContentSuggester from '../ai/ContentSuggester'
import toast from 'react-hot-toast'

interface CreateTaskModalProps {
  isOpen: boolean
  onClose: () => void
}

const CreateTaskModal: React.FC<CreateTaskModalProps> = ({ isOpen, onClose }) => {
  const dispatch = useAppDispatch()
  const { users } = useAppSelector((state) => state.users)
  const { user } = useAppSelector((state) => state.auth)
  const { isLoading, filters } = useAppSelector((state) => state.tasks)
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    goals: '',
    priority: 3,
    dueDate: '',
    assignedToId: '',
    assignedUserIds: [] as string[],
    phase: 'PENDING_APPROVAL' as const,
  })

  useEffect(() => {
    if (isOpen) {
      dispatch(fetchAssignableUsers())
      
      // Auto-select current user as assigned
      if (user?.id && !formData.assignedUserIds.includes(user.id)) {
        setFormData(prev => ({
          ...prev,
          assignedToId: user.id, // For backward compatibility
          assignedUserIds: [user.id] // Auto-select current user
        }))
      }
    }
  }, [isOpen, dispatch, user?.id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const taskData = {
      ...formData,
      dueDate: formData.dueDate ? new Date(formData.dueDate).toISOString() : undefined,
      assignedToId: formData.assignedToId || undefined,
      assignedUserIds: formData.assignedUserIds.length > 0 ? formData.assignedUserIds : undefined,
    }

    try {
      const result = await dispatch(createTask(taskData))
      if (createTask.fulfilled.match(result)) {
        // Refresh the tasks list
        dispatch(fetchTasks(filters))

        // TODO: Implement notifications system
        // Notify admins about the new task
        // const admins = await tasksApi.getAdmins()
        // admins.forEach(admin => {
        //   tasksApi.createNotification({
        //     userId: admin.id,
        //     type: 'task_approval',
        //     title: 'New Task Requires Approval',
        //     message: `A new task "${formData.title}" requires your approval.`,
        //     taskId: result.payload.id
        //   })
        // })

        toast.success('Task created successfully! Waiting for admin approval.')
        
        // Dispatch custom event to notify NotificationBell
        window.dispatchEvent(new CustomEvent('taskUpdated'))
        
        onClose()
        setFormData({
          title: '',
          description: '',
          goals: '',
          priority: 3,
          dueDate: '',
          assignedToId: user?.id || '', // Auto-select current user
          assignedUserIds: user?.id ? [user.id] : [], // Auto-select current user
          phase: 'PENDING_APPROVAL' as const,
        })
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to create task')
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: name === 'priority' ? parseInt(value) : value
    }))
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
              className="relative w-full max-w-2xl bg-white rounded-lg shadow-xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">Create New Task</h2>
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                {/* Title */}
                <div>
                  <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
                    Task Title *
                  </label>
                  <div className="relative">
                    <div className="relative">
                      <input
                        type="text"
                        id="title"
                        name="title"
                        required
                        value={formData.title}
                        onChange={handleChange}
                        className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        placeholder="Enter task title"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const suggester = document.getElementById('content-suggester');
                          if (suggester) {
                            suggester.style.display = suggester.style.display === 'none' ? 'block' : 'none';
                          }
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full hover:bg-gray-100 transition-colors"
                        title="Get AI suggestions"
                      >
                        <SparklesIcon className="h-5 w-5 text-primary-500" />
                      </button>
                    </div>
                    <div 
                      id="content-suggester" 
                      className="absolute top-full mt-1 left-0 right-0 z-50 bg-white rounded-lg shadow-lg border border-gray-200 p-4" 
                      style={{ display: 'none' }}
                    >
                      <ContentSuggester 
                        title={formData.title} 
                        type="task" 
                        onSuggestionSelect={(suggestion) => {
                          setFormData(prev => ({
                            ...prev,
                            description: suggestion.description || prev.description,
                            goals: suggestion.goals || prev.goals,
                            priority: suggestion.priority || prev.priority,
                          }));
                          const suggester = document.getElementById('content-suggester');
                          if (suggester) {
                            suggester.style.display = 'none';
                          }
                          toast.success('AI suggestions applied!');
                        }}
                      />
                    </div>
                  </div>
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
                    placeholder="Describe the task in detail"
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
                    placeholder="Define what success looks like for this task"
                  />
                </div>

                {/* Priority and Due Date */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Assign To */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Assign To
                  </label>
                  <div className="space-y-2">
                    {/* Single assignment (backward compatibility) */}
                    <div>
                      <label htmlFor="assignedToId" className="block text-xs text-gray-500 mb-1">
                        Single Assignment (Legacy)
                      </label>
                      <select
                        id="assignedToId"
                        name="assignedToId"
                        value={formData.assignedToId}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      >
                        <option value="">Select primary assignee</option>
                        {users.map(userItem => (
                          <option key={userItem.id} value={userItem.id}>
                            {userItem.name} ({userItem.email}) {userItem.id === user?.id ? '(You)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    
                    {/* Multiple assignments */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Assign Team Members
                      </label>
                      <p className="text-xs text-gray-500 mb-2">
                        You are automatically assigned. Select additional team members to collaborate.
                      </p>
                      <div className="space-y-2 max-h-32 overflow-y-auto">
                        {users.map(userItem => (
                          <label key={userItem.id} className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              checked={formData.assignedUserIds.includes(userItem.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFormData(prev => ({
                                    ...prev,
                                    assignedUserIds: [...prev.assignedUserIds, userItem.id]
                                  }))
                                } else {
                                  setFormData(prev => ({
                                    ...prev,
                                    assignedUserIds: prev.assignedUserIds.filter(id => id !== userItem.id)
                                  }))
                                }
                              }}
                              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                            />
                            <span className="text-sm text-gray-700">
                              {userItem.name} ({userItem.email}) {userItem.id === user?.id ? '(You)' : ''}
                            </span>
                          </label>
                        ))}
                      </div>
                      {formData.assignedUserIds.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs text-gray-500">
                            Selected: {formData.assignedUserIds.length} user(s)
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end space-x-3 pt-6 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={onClose}
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
                    {isLoading ? 'Creating...' : 'Create Task'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  )
}

export default CreateTaskModal
