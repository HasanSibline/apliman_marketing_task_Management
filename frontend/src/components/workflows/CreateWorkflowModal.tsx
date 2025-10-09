import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { XMarkIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import { workflowsApi } from '@/services/api'
import toast from 'react-hot-toast'

interface CreateWorkflowModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

interface PhaseData {
  name: string
  description: string
  allowedRoles: string[]
  autoAssignRole: string
  requiresApproval: boolean
  color: string
}

const CreateWorkflowModal: React.FC<CreateWorkflowModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    taskType: '',
    isDefault: false,
    color: '#3B82F6',
  })

  const [phases, setPhases] = useState<PhaseData[]>([
    {
      name: 'To Do',
      description: 'Tasks that need to be started',
      allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'],
      autoAssignRole: '',
      requiresApproval: false,
      color: '#9CA3AF',
    },
    {
      name: 'In Progress',
      description: 'Tasks currently being worked on',
      allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'],
      autoAssignRole: '',
      requiresApproval: false,
      color: '#3B82F6',
    },
    {
      name: 'Completed',
      description: 'Finished tasks',
      allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
      autoAssignRole: '',
      requiresApproval: false,
      color: '#10B981',
    },
  ])

  const taskTypes = [
    'SOCIAL_MEDIA_POST',
    'VIDEO_CONTENT',
    'BLOG_ARTICLE',
    'EMAIL_CAMPAIGN',
    'CASE_STUDY',
    'WEBSITE_CONTENT',
    'WHITEPAPER',
    'WEBINAR',
    'INFOGRAPHIC',
    'PRESS_RELEASE',
    'GENERAL',
  ]

  const roleOptions = ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE']
  const colorOptions = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6B7280'
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (phases.length < 2) {
      toast.error('Workflow must have at least 2 phases')
      return
    }

    try {
      setIsLoading(true)
      
      // Don't send 'order' field - backend determines order from array position
      await workflowsApi.create({
        ...formData,
        phases: phases,
      })

      toast.success('Workflow created successfully!')
      onSuccess()
      resetForm()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to create workflow')
    } finally {
      setIsLoading(false)
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      taskType: '',
      isDefault: false,
      color: '#3B82F6',
    })
    setPhases([
      {
        name: 'To Do',
        description: 'Tasks that need to be started',
        allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'],
        autoAssignRole: '',
        requiresApproval: false,
        color: '#9CA3AF',
      },
      {
        name: 'In Progress',
        description: 'Tasks currently being worked on',
        allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'],
        autoAssignRole: '',
        requiresApproval: false,
        color: '#3B82F6',
      },
      {
        name: 'Completed',
        description: 'Finished tasks',
        allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
        autoAssignRole: '',
        requiresApproval: false,
        color: '#10B981',
      },
    ])
  }

  const addPhase = () => {
    setPhases([
      ...phases,
      {
        name: '',
        description: '',
        allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'],
        autoAssignRole: '',
        requiresApproval: false,
        color: '#6B7280',
      },
    ])
  }

  const removePhase = (index: number) => {
    if (phases.length <= 2) {
      toast.error('Workflow must have at least 2 phases')
      return
    }
    setPhases(phases.filter((_, i) => i !== index))
  }

  const updatePhase = (index: number, field: keyof PhaseData, value: any) => {
    const newPhases = [...phases]
    newPhases[index] = { ...newPhases[index], [field]: value }
    setPhases(newPhases)
  }

  const toggleRole = (phaseIndex: number, role: string) => {
    const phase = phases[phaseIndex]
    const newRoles = phase.allowedRoles.includes(role)
      ? phase.allowedRoles.filter(r => r !== role)
      : [...phase.allowedRoles, role]
    
    updatePhase(phaseIndex, 'allowedRoles', newRoles)
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
              className="relative w-full max-w-4xl bg-white rounded-lg shadow-xl max-h-[90vh] overflow-y-auto"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">Create New Workflow</h2>
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                {/* Basic Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                      Workflow Name *
                    </label>
                    <input
                      type="text"
                      id="name"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., Social Media Workflow"
                    />
                  </div>

                  <div>
                    <label htmlFor="taskType" className="block text-sm font-medium text-gray-700 mb-2">
                      Task Type *
                    </label>
                    <select
                      id="taskType"
                      required
                      value={formData.taskType}
                      onChange={(e) => setFormData(prev => ({ ...prev, taskType: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select task type</option>
                      {taskTypes.map(type => (
                        <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    id="description"
                    rows={3}
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Describe when and how this workflow should be used"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="color" className="block text-sm font-medium text-gray-700 mb-2">
                      Workflow Color
                    </label>
                    <div className="flex space-x-2">
                      {colorOptions.map(color => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, color }))}
                          className={`w-8 h-8 rounded-full border-2 ${
                            formData.color === color ? 'border-gray-800' : 'border-gray-300'
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.isDefault}
                        onChange={(e) => setFormData(prev => ({ ...prev, isDefault: e.target.checked }))}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">
                        Set as default workflow for this task type
                      </span>
                    </label>
                  </div>
                </div>

                {/* Phases */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-gray-900">Workflow Phases</h3>
                    <button
                      type="button"
                      onClick={addPhase}
                      className="btn-secondary flex items-center space-x-2"
                    >
                      <PlusIcon className="h-4 w-4" />
                      <span>Add Phase</span>
                    </button>
                  </div>

                  <div className="space-y-4">
                    {phases.map((phase, index) => (
                      <div key={index} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="font-medium text-gray-900">Phase {index + 1}</h4>
                          {phases.length > 2 && (
                            <button
                              type="button"
                              onClick={() => removePhase(index)}
                              className="text-red-600 hover:text-red-800"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Phase Name *
                            </label>
                            <input
                              type="text"
                              required
                              value={phase.name}
                              onChange={(e) => updatePhase(index, 'name', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="e.g., In Progress"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Phase Color
                            </label>
                            <div className="flex space-x-2">
                              {colorOptions.slice(0, 5).map(color => (
                                <button
                                  key={color}
                                  type="button"
                                  onClick={() => updatePhase(index, 'color', color)}
                                  className={`w-6 h-6 rounded-full border-2 ${
                                    phase.color === color ? 'border-gray-800' : 'border-gray-300'
                                  }`}
                                  style={{ backgroundColor: color }}
                                />
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="mt-4">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Description
                          </label>
                          <input
                            type="text"
                            value={phase.description}
                            onChange={(e) => updatePhase(index, 'description', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Describe this phase"
                          />
                        </div>

                        <div className="mt-4">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Allowed Roles
                          </label>
                          <div className="flex space-x-4">
                            {roleOptions.map(role => (
                              <label key={role} className="flex items-center">
                                <input
                                  type="checkbox"
                                  checked={phase.allowedRoles.includes(role)}
                                  onChange={() => toggleRole(index, role)}
                                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span className="ml-2 text-sm text-gray-700">{role}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        <div className="mt-4 flex items-center">
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              checked={phase.requiresApproval}
                              onChange={(e) => updatePhase(index, 'requiresApproval', e.target.checked)}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="ml-2 text-sm text-gray-700">
                              Requires approval to move to this phase
                            </span>
                          </label>
                        </div>
                      </div>
                    ))}
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
                    {isLoading ? 'Creating...' : 'Create Workflow'}
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

export default CreateWorkflowModal
