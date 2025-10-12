import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ClockIcon,
  UserCircleIcon,
  CheckCircleIcon,
  XCircleIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline'
import { tasksApi } from '@/services/api'
import { useAppSelector } from '@/hooks/redux'
import toast from 'react-hot-toast'
import type { Task } from '@/types/task'

const ApprovalsPage: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAppSelector((state) => state.auth)
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedWorkflow, setSelectedWorkflow] = useState<string>('')
  const [workflows, setWorkflows] = useState<any[]>([])

  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN'

  useEffect(() => {
    if (!isAdmin) {
      toast.error('Access denied: Admin privileges required')
      navigate('/tasks')
      return
    }
    loadPendingApprovals()
    loadWorkflows()
  }, [isAdmin, navigate])

  const loadWorkflows = async () => {
    try {
      const data = await tasksApi.getWorkflows()
      setWorkflows(data)
    } catch (error) {
      console.error('Failed to load workflows:', error)
    }
  }

  const loadPendingApprovals = async () => {
    try {
      setLoading(true)
      // Fetch all tasks and filter for those requiring approval
      const response = await tasksApi.getAll({ page: 1, limit: 1000 })
      const allTasks = response.tasks || response

      // Filter tasks that are in phases requiring approval
      const pendingTasks = allTasks.filter((task: Task) => 
        task.currentPhase?.requiresApproval && 
        !task.currentPhase?.isEndPhase
      )

      setTasks(pendingTasks)
    } catch (error) {
      console.error('Failed to load pending approvals:', error)
      toast.error('Failed to load pending approvals')
    } finally {
      setLoading(false)
    }
  }

  const handleApprovePhaseChange = async (task: Task) => {
    if (!task.workflow?.phases || !task.currentPhase) return

    try {
      // Find next phase in workflow
      const currentPhaseOrder = task.currentPhase.order
      const nextPhase = task.workflow.phases.find(p => p.order === currentPhaseOrder + 1)

      if (!nextPhase) {
        toast.error('No next phase available')
        return
      }

      await tasksApi.moveToPhase(task.id, nextPhase.id, 'Approved by admin')
      toast.success(`Task moved to "${nextPhase.name}"`)
      loadPendingApprovals()
    } catch (error) {
      toast.error('Failed to approve phase change')
    }
  }

  const handleRejectPhaseChange = async (task: Task) => {
    if (!task.workflow?.phases || !task.currentPhase) return

    try {
      // Find previous phase in workflow
      const currentPhaseOrder = task.currentPhase.order
      const prevPhase = task.workflow.phases.find(p => p.order === currentPhaseOrder - 1)

      if (!prevPhase) {
        toast.error('No previous phase available')
        return
      }

      await tasksApi.moveToPhase(task.id, prevPhase.id, 'Rejected by admin - needs revision')
      toast.success('Task sent back for revision')
      loadPendingApprovals()
    } catch (error) {
      toast.error('Failed to reject phase change')
    }
  }

  const filteredTasks = tasks.filter(task => {
    const matchesSearch = task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         task.description?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesWorkflow = !selectedWorkflow || task.workflowId === selectedWorkflow
    return matchesSearch && matchesWorkflow
  })

  if (!isAdmin) {
    return null
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Pending Approvals</h1>
        <p className="text-gray-600">Review and approve tasks waiting for your approval</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Search */}
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Workflow Filter */}
          <div className="relative">
            <FunnelIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <select
              value={selectedWorkflow}
              onChange={(e) => setSelectedWorkflow(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
            >
              <option value="">All Workflows</option>
              {workflows.map(workflow => (
                <option key={workflow.id} value={workflow.id}>{workflow.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Tasks List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <CheckCircleIcon className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">All caught up!</h3>
          <p className="text-gray-600">
            {tasks.length === 0 
              ? 'No tasks are currently pending approval' 
              : 'No tasks match your current filters'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredTasks.map((task, index) => (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
            >
              <div className="p-6">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <button
                      onClick={() => navigate(`/tasks/${task.id}`)}
                      className="text-lg font-semibold text-gray-900 hover:text-blue-600 transition-colors text-left"
                    >
                      {task.title}
                    </button>
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">{task.description}</p>
                  </div>
                  {task.priority && task.priority >= 8 && (
                    <span className="ml-4 px-2.5 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-full">
                      High Priority
                    </span>
                  )}
                </div>

                {/* Metadata */}
                <div className="flex flex-wrap gap-4 mb-4 text-sm text-gray-600">
                  {task.workflow && (
                    <div 
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                      style={{ 
                        backgroundColor: `${task.workflow.color}20`,
                        color: task.workflow.color
                      }}
                    >
                      <span 
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: task.workflow.color }}
                      />
                      {task.workflow.name}
                    </div>
                  )}
                  {task.currentPhase && (
                    <div 
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                      style={{ 
                        backgroundColor: `${task.currentPhase.color}20`,
                        color: task.currentPhase.color
                      }}
                    >
                      {task.currentPhase.name}
                    </div>
                  )}
                  {task.assignedTo && (
                    <div className="flex items-center gap-1.5">
                      <UserCircleIcon className="h-4 w-4" />
                      <span>{task.assignedTo.name}</span>
                    </div>
                  )}
                  {task.createdAt && (
                    <div className="flex items-center gap-1.5">
                      <ClockIcon className="h-4 w-4" />
                      <span>Created {new Date(task.createdAt).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>

                {/* Approval Message */}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                  <p className="text-sm text-amber-800">
                    <strong>{task.assignedTo?.name || 'Someone'}</strong> has completed work on this task and is requesting approval to move forward.
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleApprovePhaseChange(task)}
                    className="flex-1 btn-primary flex items-center justify-center gap-2"
                  >
                    <CheckCircleIcon className="h-5 w-5" />
                    Approve & Move Forward
                  </button>
                  <button
                    onClick={() => handleRejectPhaseChange(task)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-colors font-medium"
                  >
                    <XCircleIcon className="h-5 w-5" />
                    Send Back for Revision
                  </button>
                  <button
                    onClick={() => navigate(`/tasks/${task.id}`)}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                  >
                    View Details
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

export default ApprovalsPage

