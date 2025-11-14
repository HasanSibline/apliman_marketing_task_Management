import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { PlusIcon, CogIcon, TrashIcon } from '@heroicons/react/24/outline'
import { useAppSelector } from '@/hooks/redux'
import { workflowsApi } from '@/services/api'
import { Workflow } from '@/types/task'
import CreateWorkflowModal from '@/components/workflows/CreateWorkflowModal'
import toast from 'react-hot-toast'

const WorkflowsPage: React.FC = () => {
  const { user } = useAppSelector((state) => state.auth)
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)

  const isAdmin =
    user?.role === 'SUPER_ADMIN' || user?.role === 'COMPANY_ADMIN' || user?.role === 'ADMIN'

  useEffect(() => {
    loadWorkflows()
  }, [])

  const loadWorkflows = async () => {
    try {
      setIsLoading(true)
      const data = await workflowsApi.getAll()
      setWorkflows(data)
    } catch (error) {
      console.error('Error loading workflows:', error)
      toast.error('Failed to load workflows')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteWorkflow = async (id: string) => {
    if (!confirm('Are you sure you want to delete this workflow?')) return

    try {
      await workflowsApi.delete(id)
      toast.success('Workflow deleted successfully')
      loadWorkflows()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to delete workflow')
    }
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600">You need admin privileges to manage workflows.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Workflow Management</h1>
              <p className="text-gray-600 mt-2">
                Create and manage dynamic workflows for your tasks
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-primary flex items-center space-x-2"
            >
              <PlusIcon className="h-5 w-5" />
              <span>Create Workflow</span>
            </button>
          </div>
        </div>

        {/* Workflows Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-gray-600">Loading workflows...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {workflows.map((workflow) => (
              <motion.div
                key={workflow.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-lg shadow-md overflow-hidden border-l-4"
                style={{ borderLeftColor: workflow.color }}
              >
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2">
                      <div
                        className="h-4 w-4 rounded-full"
                        style={{ backgroundColor: workflow.color }}
                      />
                      <h3 className="text-lg font-semibold text-gray-900">
                        {workflow.name}
                      </h3>
                      {workflow.isDefault && (
                        <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                          Default
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleDeleteWorkflow(workflow.id)}
                        className="text-red-600 hover:text-red-800 p-1"
                        title="Delete workflow"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <p className="text-gray-600 text-sm mb-4">
                    {workflow.description || 'No description'}
                  </p>

                  <div className="mb-4">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Task Type
                    </span>
                    <p className="text-sm font-medium text-gray-900 mt-1">
                      {workflow.taskType}
                    </p>
                  </div>

                  <div className="mb-4">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Phases ({workflow.phases.length})
                    </span>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {workflow.phases
                        .sort((a, b) => a.order - b.order)
                        .map((phase) => (
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

                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Created by {workflow.createdBy?.name}</span>
                    <span>{new Date(workflow.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </motion.div>
            ))}

            {workflows.length === 0 && (
              <div className="col-span-full text-center py-12">
                <CogIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No workflows yet</h3>
                <p className="text-gray-600 mb-4">
                  Create your first workflow to get started with dynamic task management.
                </p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="btn-primary"
                >
                  Create Your First Workflow
                </button>
              </div>
            )}
          </div>
        )}

        {/* Create Workflow Modal */}
        <CreateWorkflowModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false)
            loadWorkflows()
          }}
        />
      </div>
    </div>
  )
}

export default WorkflowsPage
