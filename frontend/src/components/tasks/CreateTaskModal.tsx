import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { XMarkIcon, SparklesIcon, CogIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { createTask, fetchTasks, setFilters } from '@/store/slices/tasksSlice'
import { fetchAssignableUsers } from '@/store/slices/usersSlice'
import { workflowsApi } from '@/services/api'
import { Workflow } from '@/types/task'
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
  
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null)
  const [isLoadingWorkflows, setIsLoadingWorkflows] = useState(false)
  const [aiGeneratedSubtasks, setAiGeneratedSubtasks] = useState<any[]>([])
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
          assignedToId: user.id, // For backward compatibility
          assignedUserIds: [user.id] // Auto-select current user
        }))
      }
    }
  }, [isOpen, dispatch, user?.id])

  const loadWorkflows = async () => {
    try {
      setIsLoadingWorkflows(true)
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
    } finally {
      setIsLoadingWorkflows(false)
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
      setLoadingStage('🤖 AI is thinking about your task...')
      const preview: any = {}
      
      // Generate basic content
      setLoadingStage('✍️ Writing detailed description and goals...')
      const contentResponse = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/ai/generate-content`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          title: formData.title,
          type: selectedWorkflow?.taskType || 'GENERAL'
        }),
      })

      if (!contentResponse.ok) {
        throw new Error(`AI service error: ${contentResponse.status}`)
      }

      const contentData = await contentResponse.json()
      preview.description = contentData.description
      preview.goals = contentData.goals
      preview.priority = contentData.priority
      preview.aiProvider = contentData.ai_provider

      // Generate subtasks if workflow is selected
      if (selectedWorkflow && formData.generateSubtasks) {
        setLoadingStage('📝 Creating smart subtasks for your workflow...')
        
        const subtasksResponse = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/ai/generate-subtasks`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
          body: JSON.stringify({
            title: formData.title,
            description: formData.description || preview.description,
            taskType: selectedWorkflow.taskType,
            workflowPhases: selectedWorkflow.phases.map(p => p.name),
            availableUsers: users.map(user => ({
              id: user.id,
              name: user.name,
              position: user.position,
              role: user.role
            }))
          }),
        })

        if (subtasksResponse.ok) {
          const subtasksData = await subtasksResponse.json()
          preview.subtasks = subtasksData.subtasks || []
        }
      }

      setLoadingStage('✨ Finalizing your AI-generated content...')
      
      // Show preview modal
      setAiPreview(preview)
      setShowAiPreview(true)
      toast.success('🎉 AI content generated successfully!')
      
    } catch (error: any) {
      console.error('Error generating AI content:', error)
      
      // Show specific error messages
      if (error.message.includes('AI service error')) {
        toast.error('AI service is temporarily unavailable. Please try again later.')
      } else if (error.response?.status === 401) {
        toast.error('Session expired. Please refresh the page and log in again.')
        localStorage.removeItem('token')
        window.location.href = '/login'
      } else {
        toast.error('Failed to generate AI content. Please check your connection and try again.')
      }
    } finally {
      setIsGeneratingContent(false)
      setLoadingStage('')
    }
  }

  const applyAiContent = () => {
    if (!aiPreview) return

    // Apply basic content
    setFormData(prev => ({
      ...prev,
      description: prev.description || aiPreview.description || '',
      goals: prev.goals || aiPreview.goals || '',
      priority: prev.priority || aiPreview.priority || 3,
    }))

    // Apply subtasks
    if (aiPreview.subtasks) {
      setAiGeneratedSubtasks(aiPreview.subtasks)
    }

    // Close preview
    setShowAiPreview(false)
    toast.success('AI content applied to form!')
  }

  const discardAiContent = () => {
    setAiPreview(null)
    setShowAiPreview(false)
  }

  const updateSubtask = (index: number, field: string, value: string) => {
    const updatedSubtasks = [...aiGeneratedSubtasks]
    updatedSubtasks[index] = { ...updatedSubtasks[index], [field]: value }
    setAiGeneratedSubtasks(updatedSubtasks)
  }

  const removeSubtask = (index: number) => {
    setAiGeneratedSubtasks(subtasks => subtasks.filter((_, i) => i !== index))
  }

  const addCustomSubtask = () => {
    setAiGeneratedSubtasks(prev => [...prev, {
      title: '',
      description: '',
      phaseName: selectedWorkflow?.phases[0]?.name || '',
      suggestedRole: '',
      estimatedHours: 2,
    }])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const taskData = {
      ...formData,
      dueDate: formData.dueDate ? new Date(formData.dueDate).toISOString() : undefined,
      assignedToId: formData.assignedToId || undefined,
      assignedUserIds: formData.assignedUserIds.length > 0 ? formData.assignedUserIds : undefined,
      // Include AI-generated subtasks if any
      aiSubtasks: aiGeneratedSubtasks.length > 0 ? aiGeneratedSubtasks : undefined,
    }

    try {
      const result = await dispatch(createTask(taskData))
      if (createTask.fulfilled.match(result)) {
        toast.success('Task created successfully!')
        
        // Dispatch custom event to notify NotificationBell
        window.dispatchEvent(new CustomEvent('taskUpdated'))
        
        // Clear any active filters so the new task is visible
        const hadFilters = Object.keys(filters).length > 0
        if (hadFilters) {
          dispatch(setFilters({}))
          toast('Filters cleared to show your new task', { duration: 4000, icon: '🔍' })
        }
        
        // Close modal and reset form
        onClose()
        setFormData({
          title: '',
          description: '',
          goals: '',
          priority: 3,
          dueDate: '',
          assignedToId: user?.id || '', // Auto-select current user
          assignedUserIds: user?.id ? [user.id] : [], // Auto-select current user
          workflowId: '',
          generateSubtasks: false,
          autoAssign: false,
        })
        setAiGeneratedSubtasks([]) // Clear AI subtasks

        // Refresh the tasks list after a small delay to ensure backend has processed
        setTimeout(() => {
          dispatch(fetchTasks({})) // Fetch all tasks without filters
        }, 300)
      }
    } catch (error: any) {
      console.error('Error creating task:', error)
      if (error.response?.status === 401) {
        toast.error('Session expired. Please refresh the page and log in again.')
        localStorage.removeItem('token')
        window.location.href = '/login'
      } else {
        toast.error(error.response?.data?.message || 'Failed to create task')
      }
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
        <div key="create-task-modal" className="fixed inset-0 z-50 overflow-y-auto">
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
                {/* Workflow Selection */}
                <div>
                  <label htmlFor="workflowId" className="block text-sm font-medium text-gray-700 mb-2">
                    <CogIcon className="h-4 w-4 inline mr-1" />
                    Workflow
                  </label>
                  <select
                    id="workflowId"
                    name="workflowId"
                    value={formData.workflowId}
                    onChange={(e) => handleWorkflowChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={isLoadingWorkflows}
                  >
                    <option value="">Select a workflow</option>
                    {workflows.map((workflow) => (
                      <option key={workflow.id} value={workflow.id}>
                        {workflow.name} ({workflow.taskType})
                      </option>
                    ))}
                  </select>
                  {selectedWorkflow && (
                    <div className="mt-2 p-3 bg-gray-50 rounded-md">
                      <p className="text-sm text-gray-600">{selectedWorkflow.description}</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {selectedWorkflow.phases.map((phase) => (
                          <span
                            key={phase.id}
                            className="text-xs px-2 py-1 rounded-full text-white"
                            style={{ backgroundColor: phase.color }}
                          >
                            {phase.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

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
                        onClick={generateAIContent}
                        disabled={isGeneratingContent || !formData.title.trim()}
                        className="btn-secondary text-sm flex items-center space-x-2 disabled:opacity-50 absolute right-2 top-1/2 -translate-y-1/2"
                      >
                        <SparklesIcon className="h-4 w-4" />
                        <span className="text-xs">{isGeneratingContent ? 'Generating...' : 'Generate AI'}</span>
                      </button>
                    </div>
                    
                    {/* Loading Stage Display */}
                    {isGeneratingContent && loadingStage && (
                      <div className="mt-2 text-sm text-purple-600 animate-pulse flex items-center">
                        <div className="w-2 h-2 bg-purple-600 rounded-full animate-bounce mr-2"></div>
                        {loadingStage}
                      </div>
                    )}
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

                {/* AI Options */}
                <div className="border-t pt-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <SparklesIcon className="h-5 w-5 mr-2 text-purple-500" />
                    AI-Powered Features
                  </h3>
                  
                  <div className="space-y-4">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.generateSubtasks}
                        onChange={(e) => setFormData(prev => ({ ...prev, generateSubtasks: e.target.checked }))}
                        className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">
                        Generate AI subtasks based on task type and workflow
                      </span>
                    </label>

                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.autoAssign}
                        onChange={(e) => setFormData(prev => ({ ...prev, autoAssign: e.target.checked }))}
                        className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">
                        Auto-assign subtasks to team members based on their roles
                      </span>
                    </label>

                    <div className="text-xs text-gray-500 bg-purple-50 p-3 rounded-md">
                      <p className="font-medium mb-1">AI will help with:</p>
                      <ul className="list-disc list-inside space-y-1">
                        <li>Task type detection from title</li>
                        <li>Generate description and goals if not provided</li>
                        <li>Create intelligent subtasks matched to workflow phases</li>
                        <li>Suggest team members for subtasks based on their positions</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* AI-Generated Subtasks */}
                {aiGeneratedSubtasks.length > 0 && (
                  <div className="border-t pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-medium text-gray-900 flex items-center">
                        <SparklesIcon className="h-5 w-5 mr-2 text-green-500" />
                        AI-Generated Subtasks ({aiGeneratedSubtasks.length})
                      </h3>
                      <button
                        type="button"
                        onClick={addCustomSubtask}
                        className="btn-secondary text-sm flex items-center space-x-2"
                      >
                        <PlusIcon className="h-4 w-4" />
                        <span>Add Custom</span>
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {aiGeneratedSubtasks.map((subtask, index) => (
                        <div
                          key={`subtask-${index}-${Date.now()}`}
                          className="bg-gray-50 border border-gray-200 rounded-lg p-4 relative group"
                        >
                          <button
                            type="button"
                            onClick={() => removeSubtask(index)}
                            className="absolute top-2 right-2 text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                          
                          <div className="space-y-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Subtask Title
                              </label>
                              <input
                                type="text"
                                value={subtask.title}
                                onChange={(e) => updateSubtask(index, 'title', e.target.value)}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="Subtask title"
                              />
                            </div>
                            
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Description
                              </label>
                              <textarea
                                rows={2}
                                value={subtask.description}
                                onChange={(e) => updateSubtask(index, 'description', e.target.value)}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="Brief description"
                              />
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                  Phase
                                </label>
                                <select
                                  value={subtask.phaseName}
                                  onChange={(e) => updateSubtask(index, 'phaseName', e.target.value)}
                                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                >
                                  {selectedWorkflow?.phases.map((phase) => (
                                    <option key={phase.id} value={phase.name}>
                                      {phase.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                  Est. Hours
                                </label>
                                <input
                                  type="number"
                                  min="0.5"
                                  step="0.5"
                                  value={subtask.estimatedHours}
                                  onChange={(e) => updateSubtask(index, 'estimatedHours', e.target.value)}
                                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                              </div>
                            </div>
                            
                            {subtask.suggestedRole && (
                              <div className="flex items-center space-x-2">
                                <span className="text-xs text-gray-500">Suggested for:</span>
                                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                                  {subtask.suggestedRole}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <div className="mt-4 text-sm text-gray-600 bg-green-50 p-3 rounded-md">
                      <p className="font-medium mb-1">📝 These subtasks were generated by AI based on your task details.</p>
                      <p>You can edit, remove, or add custom subtasks. They will be created automatically when you create the task.</p>
                    </div>
                  </div>
                )}

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

      {/* AI Preview Modal */}
      {showAiPreview && aiPreview && (
        <div key="ai-preview-modal" className="fixed inset-0 z-[9999] overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black bg-opacity-50"
              onClick={discardAiContent}
            />
            
            {/* Preview Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-4xl bg-white rounded-lg shadow-xl max-h-[90vh] overflow-y-auto"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900 flex items-center">
                  <SparklesIcon className="h-6 w-6 mr-2 text-purple-500" />
                  AI Generated Content Preview
                  {aiPreview.aiProvider === 'fallback' && (
                    <span className="ml-2 text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">
                      Fallback Mode
                    </span>
                  )}
                </h2>
                <button
                  onClick={discardAiContent}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              {/* Preview Content */}
              <div className="p-6 space-y-6">
                {/* Description Preview */}
                {aiPreview.description && (
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">📝 Description</h3>
                    <div className="bg-gray-50 p-4 rounded-lg border">
                      <p className="text-gray-700 whitespace-pre-wrap">{aiPreview.description}</p>
                    </div>
                  </div>
                )}

                {/* Goals Preview */}
                {aiPreview.goals && (
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">🎯 Goals</h3>
                    <div className="bg-gray-50 p-4 rounded-lg border">
                      <p className="text-gray-700 whitespace-pre-wrap">{aiPreview.goals}</p>
                    </div>
                  </div>
                )}

                {/* Priority Preview */}
                {aiPreview.priority && (
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">⚡ Priority</h3>
                    <div className="bg-gray-50 p-4 rounded-lg border">
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                        aiPreview.priority === 5 ? 'bg-red-100 text-red-800' :
                        aiPreview.priority === 4 ? 'bg-orange-100 text-orange-800' :
                        aiPreview.priority === 3 ? 'bg-yellow-100 text-yellow-800' :
                        aiPreview.priority === 2 ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {aiPreview.priority === 5 ? 'Critical' :
                         aiPreview.priority === 4 ? 'High' :
                         aiPreview.priority === 3 ? 'Normal' :
                         aiPreview.priority === 2 ? 'Medium' :
                         'Low'} Priority
                      </span>
                    </div>
                  </div>
                )}

                {/* Subtasks Preview */}
                {aiPreview.subtasks && aiPreview.subtasks.length > 0 && (
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      📋 Subtasks ({aiPreview.subtasks.length})
                    </h3>
                    <div className="space-y-4">
                      {aiPreview.subtasks.map((subtask, index) => (
                        <div key={`preview-subtask-${index}-${subtask.title || index}-${Date.now()}`} className="bg-gray-50 p-4 rounded-lg border">
                          <div className="flex items-start justify-between mb-3">
                            <h4 className="font-medium text-gray-900 flex-1">{subtask.title}</h4>
                            <button
                              onClick={() => {
                                const updatedSubtasks = aiPreview.subtasks?.filter((_, i) => i !== index) || []
                                setAiPreview(prev => prev ? { ...prev, subtasks: updatedSubtasks } : null)
                              }}
                              className="text-red-500 hover:text-red-700 ml-2"
                              title="Remove subtask"
                            >
                              ✕
                            </button>
                          </div>
                          
                          {subtask.description && (
                            <p className="text-sm text-gray-600 mb-3">{subtask.description}</p>
                          )}
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                            {/* Phase Selection */}
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Phase</label>
                              <select
                                value={subtask.phaseName || ''}
                                onChange={(e) => {
                                  const updatedSubtasks = [...(aiPreview.subtasks || [])]
                                  updatedSubtasks[index] = { ...updatedSubtasks[index], phaseName: e.target.value }
                                  setAiPreview(prev => prev ? { ...prev, subtasks: updatedSubtasks } : null)
                                }}
                                className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                              >
                                <option value="">Select Phase</option>
                                {selectedWorkflow?.phases.map(phase => (
                                  <option key={phase.id} value={phase.name}>{phase.name}</option>
                                ))}
                              </select>
                            </div>

                            {/* User Assignment */}
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Assign To</label>
                              <select
                                value={subtask.suggestedUserId || ''}
                                onChange={(e) => {
                                  const selectedUser = users.find(u => u.id === e.target.value)
                                  const updatedSubtasks = [...(aiPreview.subtasks || [])]
                                  updatedSubtasks[index] = { 
                                    ...updatedSubtasks[index], 
                                    suggestedUserId: e.target.value,
                                    suggestedUserName: selectedUser?.name || '',
                                    suggestedRole: selectedUser?.position || subtask.suggestedRole
                                  }
                                  setAiPreview(prev => prev ? { ...prev, subtasks: updatedSubtasks } : null)
                                }}
                                className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                              >
                                <option value="">Unassigned</option>
                                {users.map(user => (
                                  <option key={user.id} value={user.id}>
                                    {user.name} ({user.position})
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2 text-xs">
                            {subtask.phaseName && (
                              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                📍 {subtask.phaseName}
                              </span>
                            )}
                            {(subtask.suggestedUserName || subtask.suggestedRole) && (
                              <span className="bg-green-100 text-green-800 px-2 py-1 rounded">
                                👤 {subtask.suggestedUserName || subtask.suggestedRole}
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
                    
                    {/* Add Custom Subtask Button */}
                    <button
                      onClick={() => {
                        const newSubtask = {
                          title: 'New Subtask',
                          description: '',
                          phaseName: selectedWorkflow?.phases[0]?.name || '',
                          suggestedRole: '',
                          suggestedUserId: '',
                          suggestedUserName: '',
                          estimatedHours: 2,
                        }
                        setAiPreview(prev => prev ? { 
                          ...prev, 
                          subtasks: [...(prev.subtasks || []), newSubtask] 
                        } : null)
                      }}
                      className="mt-3 w-full px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-primary-300 hover:text-primary-600 transition-colors"
                    >
                      + Add Custom Subtask
                    </button>
                  </div>
                )}

                {/* AI Provider Info */}
                <div className={`p-4 rounded-lg ${
                  aiPreview.aiProvider === 'fallback' 
                    ? 'bg-yellow-50 border border-yellow-200' 
                    : 'bg-green-50 border border-green-200'
                }`}>
                  <p className="text-sm">
                    {aiPreview.aiProvider === 'fallback' ? (
                      <>
                        ⚠️ <strong>Fallback Mode:</strong> Using template content. Set up Google API key for AI-powered generation.
                      </>
                    ) : (
                      <>
                        ✨ <strong>AI Generated:</strong> Content created using advanced AI based on your task details.
                      </>
                    )}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200">
                <button
                  onClick={discardAiContent}
                  className="btn-secondary"
                >
                  Discard
                </button>
                <button
                  onClick={applyAiContent}
                  className="btn-primary"
                >
                  Apply to Form
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  )
}

export default CreateTaskModal
