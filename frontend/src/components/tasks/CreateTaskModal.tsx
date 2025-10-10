import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { XMarkIcon, SparklesIcon } from '@heroicons/react/24/outline'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { createTask, fetchTasks } from '@/store/slices/tasksSlice'
import { fetchAssignableUsers } from '@/store/slices/usersSlice'
import { workflowsApi } from '@/services/api'
import { Workflow } from '@/types/task'
import UserAssignmentPicker from './UserAssignmentPicker'
import toast from 'react-hot-toast'

interface CreateTaskModalProps {
  isOpen: boolean
  onClose: () => void
}

const CreateTaskModal: React.FC<CreateTaskModalProps> = ({ isOpen, onClose }) => {
  const dispatch = useAppDispatch()
  const { users } = useAppSelector((state) => state.users)
  const { user } = useAppSelector((state) => state.auth)
  const { isLoading } = useAppSelector((state) => state.tasks)
  
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null)
  const [isGeneratingContent, setIsGeneratingContent] = useState(false)
  const [loadingStage, setLoadingStage] = useState('')
  const [aiPreview, setAiPreview] = useState<{
    description?: string
    goals?: string
    priority?: number
    subtasks?: any[]
    aiProvider?: string
  } | null>(null)
  const [showAiPreview, setShowAiPreview] = useState(false)
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    goals: '',
    priority: 3,
    dueDate: '',
    assignedToId: '',
    assignedUserIds: [] as string[],
    workflowId: '',
    generateSubtasks: false,
    autoAssign: false,
  })

  useEffect(() => {
    if (isOpen) {
      dispatch(fetchAssignableUsers())
      loadWorkflows()
      
      // Auto-select current user as assigned
      if (user?.id && !formData.assignedUserIds.includes(user.id)) {
        setFormData(prev => ({
          ...prev,
          assignedToId: user.id,
          assignedUserIds: [user.id]
        }))
      }
    }
  }, [isOpen, dispatch, user?.id])

  const loadWorkflows = async () => {
    try {
      const workflowsData = await workflowsApi.getAll()
      setWorkflows(workflowsData)
      
      // Auto-select default general workflow if available
      const defaultWorkflow = workflowsData.find(w => w.isDefault && w.taskType === 'GENERAL')
      if (defaultWorkflow) {
        setSelectedWorkflow(defaultWorkflow)
        setFormData(prev => ({ ...prev, workflowId: defaultWorkflow.id }))
      }
    } catch (error) {
      console.error('Error loading workflows:', error)
      toast.error('Failed to load workflows')
    }
  }

  const handleWorkflowChange = (workflowId: string) => {
    const workflow = workflows.find(w => w.id === workflowId) || null
    setSelectedWorkflow(workflow)
    setFormData(prev => ({ ...prev, workflowId }))
  }

  const generateAIContent = async () => {
    if (!formData.title.trim()) {
      toast.error('Please enter a task title first')
      return
    }

    try {
      setIsGeneratingContent(true)
      setLoadingStage('🤔 Analyzing your task...')

      // Generate main task content
      const contentResponse = await fetch('/api/ai/generate-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title,
          type: 'task'
        })
      })

      if (!contentResponse.ok) {
        throw new Error('Failed to generate content')
      }

      const contentData = await contentResponse.json()
      
      let subtasks: any[] = []
      
      if (formData.generateSubtasks && selectedWorkflow) {
        setLoadingStage('📋 Creating subtasks...')
        
        const subtaskResponse = await fetch('/api/ai/generate-subtasks', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({
            title: formData.title,
            description: contentData.description || formData.description,
            taskType: selectedWorkflow.taskType,
            workflowPhases: selectedWorkflow.phases?.map(p => p.name) || [],
            availableUsers: users.map(u => ({
              id: u.id,
              name: u.name,
              position: u.position || u.role,
              role: u.role
            }))
          })
        })

        if (subtaskResponse.ok) {
          const subtaskData = await subtaskResponse.json()
          subtasks = subtaskData.subtasks || []
        }
      }

      setAiPreview({
        description: contentData.description,
        goals: contentData.goals,
        priority: contentData.priority || 3,
        subtasks,
        aiProvider: contentData.ai_provider
      })
      
      setShowAiPreview(true)
      toast.success('AI content generated successfully!')
      
    } catch (error: any) {
      console.error('Error generating AI content:', error)
      toast.error(error.message || 'Failed to generate AI content')
    } finally {
      setIsGeneratingContent(false)
      setLoadingStage('')
    }
  }

  const applyAiContent = () => {
    if (!aiPreview) return
    
    setFormData(prev => ({
      ...prev,
      description: aiPreview.description || prev.description,
      goals: aiPreview.goals || prev.goals,
      priority: aiPreview.priority || prev.priority
    }))
    
    setShowAiPreview(false)
    setAiPreview(null)
    toast.success('AI content applied to form')
  }

  const discardAiContent = () => {
    setAiPreview(null)
    setShowAiPreview(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.title.trim()) {
      toast.error('Please enter a task title')
      return
    }

    if (!formData.workflowId) {
      toast.error('Please select a workflow')
      return
    }

    if (formData.assignedUserIds.length === 0) {
      toast.error('Please assign at least one team member')
      return
    }

    try {
      const taskData = {
        ...formData,
        assignedToId: formData.assignedUserIds[0], // Primary assignee
        aiSubtasks: aiPreview?.subtasks || []
      }

      await dispatch(createTask(taskData)).unwrap()
      
      // Reset form
        setFormData({
          title: '',
          description: '',
          goals: '',
          priority: 3,
          dueDate: '',
        assignedToId: '',
        assignedUserIds: user?.id ? [user.id] : [],
        workflowId: '',
        generateSubtasks: false,
        autoAssign: false,
      })
      
      setAiPreview(null)
      setShowAiPreview(false)
      dispatch(fetchTasks({}))
      onClose()
      toast.success('Task created successfully!')
      
    } catch (error: any) {
      console.error('Error creating task:', error)
      toast.error(error.message || 'Failed to create task')
    }
  }

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      goals: '',
      priority: 3,
      dueDate: '',
      assignedToId: '',
      assignedUserIds: user?.id ? [user.id] : [],
      workflowId: '',
      generateSubtasks: false,
      autoAssign: false,
    })
    setAiPreview(null)
    setShowAiPreview(false)
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black bg-opacity-50"
              onClick={onClose}
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
          className="relative bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">Create New Task</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
              <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Task Title *
                  </label>
                      <input
                        type="text"
                        value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter task title..."
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Workflow *
                  </label>
                  <select
                    value={formData.workflowId}
                    onChange={(e) => handleWorkflowChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  >
                    <option value="">Select a workflow</option>
                    {workflows.map(workflow => (
                      <option key={workflow.id} value={workflow.id}>
                        {workflow.name} ({workflow.taskType})
                      </option>
                    ))}
                  </select>
                </div>

                  <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                      Priority
                    </label>
                    <select
                      value={formData.priority}
                    onChange={(e) => setFormData(prev => ({ ...prev, priority: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value={1}>1 - Low</option>
                      <option value={2}>2 - Medium</option>
                    <option value={3}>3 - High</option>
                    <option value={4}>4 - Urgent</option>
                      <option value={5}>5 - Critical</option>
                    </select>
                  </div>

                  <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                      Due Date
                    </label>
                    <input
                      type="date"
                      value={formData.dueDate}
                    onChange={(e) => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Describe the task..."
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Goals & Success Criteria
                  </label>
                  <textarea
                    value={formData.goals}
                    onChange={(e) => setFormData(prev => ({ ...prev, goals: e.target.value }))}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="What are the goals and success criteria?"
                    />
                  </div>
                </div>

              {/* Team Assignment */}
              <div className="border-t border-gray-200 pt-6">
                <UserAssignmentPicker
                  selectedUsers={formData.assignedUserIds}
                  onUsersChange={(users) => setFormData(prev => ({ 
                    ...prev, 
                    assignedUserIds: users,
                    assignedToId: users[0] || ''
                  }))}
                  aiSuggestions={aiPreview?.subtasks
                    ?.filter(subtask => subtask.suggestedUserId)
                    .map(subtask => subtask.suggestedUserId)
                    .filter((id, index, arr) => arr.indexOf(id) === index) || []
                  }
                  label="Assign Team Members"
                  maxUsers={8}
                />
              </div>

              {/* AI Options */}
              <div className="border-t border-gray-200 pt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">AI Assistance</h3>
                  <SparklesIcon className="h-5 w-5 text-blue-500" />
                    </div>
                    
                <div className="space-y-4">
                  <div className="flex items-center space-x-3">
                            <input
                              type="checkbox"
                      id="generateSubtasks"
                      checked={formData.generateSubtasks}
                      onChange={(e) => setFormData(prev => ({ ...prev, generateSubtasks: e.target.checked }))}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="generateSubtasks" className="text-sm text-gray-700">
                      Generate subtasks automatically
                          </label>
                  </div>

                  <button
                    type="button"
                    onClick={generateAIContent}
                    disabled={isGeneratingContent || !formData.title.trim()}
                    className={`w-full flex items-center justify-center space-x-2 px-4 py-3 rounded-lg font-medium transition-all duration-300 ${
                      isGeneratingContent 
                        ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg transform scale-105' 
                        : 'bg-gradient-to-r from-blue-600 to-purple-700 hover:from-blue-700 hover:to-purple-800 text-white shadow-md hover:shadow-lg hover:scale-105'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {isGeneratingContent ? (
                      <>
                        <div className="relative">
                          <SparklesIcon className="h-5 w-5 animate-pulse" />
                          <div className="absolute inset-0 animate-ping">
                            <SparklesIcon className="h-5 w-5 opacity-75" />
                      </div>
                        </div>
                        <span className="animate-pulse">
                          {loadingStage || '🤔 AI is thinking...'}
                        </span>
                      </>
                    ) : (
                      <>
                        <SparklesIcon className="h-5 w-5" />
                        <span>✨ Generate AI Content</span>
                      </>
                    )}
                  </button>
                    </div>
                  </div>

              {/* Form Actions */}
              <div className="border-t border-gray-200 pt-6 flex items-center justify-between">
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-gray-600 hover:text-gray-800"
                >
                  Reset Form
                </button>
                
                <div className="flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading || !formData.title.trim() || !formData.workflowId}
                    className={`px-6 py-2.5 rounded-lg font-medium transition-all duration-200 ${
                      isLoading 
                        ? 'bg-blue-500 text-white cursor-not-allowed' 
                        : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg transform hover:scale-105'
                    } disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none`}
                  >
                    {isLoading ? (
                      <span className="flex items-center space-x-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Creating...</span>
                      </span>
                    ) : (
                      <span className="flex items-center space-x-2">
                        <span>➕ Create Task</span>
                      </span>
                    )}
                  </button>
                </div>
                </div>
              </form>
          </div>
            </motion.div>

        {/* AI Preview Modal */}
        {showAiPreview && aiPreview && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute inset-4 bg-white rounded-lg shadow-2xl z-10 overflow-hidden"
          >
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center space-x-2">
                <SparklesIcon className="h-5 w-5 text-blue-500" />
                <h3 className="text-lg font-semibold text-gray-900">AI Generated Content</h3>
                {aiPreview.aiProvider && (
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                    {aiPreview.aiProvider}
                  </span>
                )}
              </div>
              <button onClick={discardAiContent} className="text-gray-400 hover:text-gray-600">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {aiPreview.description && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">📝 Description</h4>
                  <p className="text-gray-700 bg-gray-50 p-3 rounded-lg">{aiPreview.description}</p>
                </div>
              )}

              {aiPreview.goals && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">🎯 Goals & Success Criteria</h4>
                  <p className="text-gray-700 bg-gray-50 p-3 rounded-lg">{aiPreview.goals}</p>
                </div>
              )}

              {aiPreview.subtasks && aiPreview.subtasks.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">
                    📋 Subtasks ({aiPreview.subtasks.length})
                  </h4>
                  <div className="space-y-3">
                    {aiPreview.subtasks.map((subtask, index) => (
                      <div key={index} className="bg-gray-50 p-4 rounded-lg">
                        <h5 className="font-medium text-gray-900 mb-1">{subtask.title}</h5>
                        {subtask.description && (
                          <p className="text-sm text-gray-600 mb-2">{subtask.description}</p>
                        )}
                        <div className="flex flex-wrap gap-2 text-xs">
                          {subtask.phaseName && (
                            <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                              📍 {subtask.phaseName}
                            </span>
                          )}
                          {subtask.suggestedUserName && (
                            <span className="bg-green-100 text-green-800 px-2 py-1 rounded">
                              👤 {subtask.suggestedUserName}
                            </span>
                          )}
                          {subtask.estimatedHours && (
                            <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded">
                              ⏱️ {subtask.estimatedHours}h
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
          </div>
        </div>
      )}
            </div>

            <div className="border-t border-gray-200 p-6 flex items-center justify-between">
              <button
                onClick={discardAiContent}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Discard
              </button>
              <button
                onClick={applyAiContent}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Apply to Form
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </AnimatePresence>
  )
}

export default CreateTaskModal