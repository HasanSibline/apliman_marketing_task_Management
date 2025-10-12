import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  PlusIcon, 
  FunnelIcon, 
  MagnifyingGlassIcon,
  XMarkIcon,
  AdjustmentsHorizontalIcon,
  ChevronDownIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { fetchTasks, setFilters } from '@/store/slices/tasksSlice'
import CreateTaskModal from '@/components/tasks/CreateTaskModal'
import TaskListItem from '@/components/tasks/TaskListItem'
import ExportButton from '@/components/tasks/ExportButton'
import { workflowsApi } from '@/services/api'
import { Task } from '@/types/task'

const TasksPage: React.FC = () => {
  const dispatch = useAppDispatch()
  const { tasks: apiTasks, isLoading, filters } = useAppSelector((state) => state.tasks)
  // Filter out subtasks - only show parent tasks
  const tasks = apiTasks
    .filter(task => task.taskType !== 'SUBTASK')
    .map(task => ({
      ...task,
      createdById: task.createdBy?.id || ''
    })) as Task[]
  
  const { user } = useAppSelector((state) => state.auth)
  const [showFilters, setShowFilters] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [workflows, setWorkflows] = useState<any[]>([])
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())

  useEffect(() => {
    dispatch(fetchTasks(filters))
    loadWorkflows()
  }, [dispatch, filters])

  const loadWorkflows = async () => {
    try {
      const data = await workflowsApi.getAll()
      setWorkflows(data)
    } catch (error) {
      console.error('Failed to load workflows:', error)
    }
  }

  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN'

  const activeFiltersCount = [
    filters.search,
    filters.phase,
    filters.assignedToId,
    filters.workflowId,
    filters.priority
  ].filter(Boolean).length

  const clearAllFilters = () => {
    dispatch(setFilters({}))
  }

  // Separate completed and active tasks
  const completedTasks = tasks.filter(task => task.completedAt)
  const activeTasks = tasks.filter(task => !task.completedAt)

  // Group active tasks by workflow type
  const groupedTasks = activeTasks.reduce((acc, task) => {
    const workflowName = task.workflow?.name || 'Uncategorized'
    if (!acc[workflowName]) {
      acc[workflowName] = {
        workflow: task.workflow,
        tasks: []
      }
    }
    acc[workflowName].tasks.push(task)
    return acc
  }, {} as Record<string, { workflow: any; tasks: Task[] }>)

  const toggleSection = (sectionName: string) => {
    setCollapsedSections(prev => {
      const newSet = new Set(prev)
      if (newSet.has(sectionName)) {
        newSet.delete(sectionName)
      } else {
        newSet.add(sectionName)
      }
      return newSet
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Tasks</h1>
          <p className="text-gray-600 mt-1">
            Manage and track your tasks by workflow type
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="relative btn-secondary"
          >
            <AdjustmentsHorizontalIcon className="h-4 w-4 mr-2" />
            Filters
            {activeFiltersCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                {activeFiltersCount}
              </span>
            )}
          </button>
          <button 
            onClick={() => setShowCreateModal(true)}
            className="btn-primary"
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            Create Task
          </button>
          {isAdmin && (
            <ExportButton filters={filters} />
          )}
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          placeholder="Search tasks by title, description, or assignee..."
          value={filters.search || ''}
          onChange={(e) => dispatch(setFilters({ search: e.target.value || undefined }))}
          className="pl-11 pr-4 py-3 w-full border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
        />
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="bg-white rounded-xl border border-gray-200 shadow-sm p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <FunnelIcon className="h-5 w-5" />
              Filter Tasks
            </h3>
            {activeFiltersCount > 0 && (
              <button
                onClick={clearAllFilters}
                className="text-sm text-red-600 hover:text-red-700 font-medium flex items-center gap-1"
              >
                <XMarkIcon className="h-4 w-4" />
                Clear All Filters
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Workflow Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Workflow
              </label>
              <select
                value={filters.workflowId || ''}
                onChange={(e) => dispatch(setFilters({ workflowId: e.target.value || undefined }))}
                className="input-field"
              >
                <option value="">All Workflows</option>
                {workflows.map(workflow => (
                  <option key={workflow.id} value={workflow.id}>
                    {workflow.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Priority Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Priority
              </label>
              <select
                value={filters.priority || ''}
                onChange={(e) => dispatch(setFilters({ priority: e.target.value ? parseInt(e.target.value) : undefined }))}
                className="input-field"
              >
                <option value="">All Priorities</option>
                <option value="1">Low</option>
                <option value="2">Medium</option>
                <option value="3">High</option>
                <option value="4">Urgent</option>
                <option value="5">Critical</option>
              </select>
            </div>

            {/* Phase Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phase
              </label>
              <select
                value={filters.phase || ''}
                onChange={(e) => dispatch(setFilters({ phase: e.target.value || undefined }))}
                className="input-field"
              >
                <option value="">All Phases</option>
                <option value="PENDING_APPROVAL">Pending Approval</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="ASSIGNED">Assigned</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
                {isAdmin && (
                  <option value="ARCHIVED">Archived</option>
                )}
              </select>
            </div>

            {/* Assigned To Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Assigned To
              </label>
              <select
                value={filters.assignedToId || ''}
                onChange={(e) => dispatch(setFilters({ assignedToId: e.target.value || undefined }))}
                className="input-field"
              >
                <option value="">All Users</option>
                <option value={user?.id}>My Tasks</option>
              </select>
            </div>
          </div>
        </motion.div>
      )}

      {/* Active Filters Display */}
      {activeFiltersCount > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-700">Active Filters:</span>
          {filters.search && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
              Search: "{filters.search}"
              <button
                onClick={() => dispatch(setFilters({ search: undefined }))}
                className="hover:bg-blue-200 rounded-full p-0.5"
              >
                <XMarkIcon className="h-3.5 w-3.5" />
              </button>
            </span>
          )}
          {filters.workflowId && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm">
              Workflow: {workflows.find(w => w.id === filters.workflowId)?.name}
              <button
                onClick={() => dispatch(setFilters({ workflowId: undefined }))}
                className="hover:bg-purple-200 rounded-full p-0.5"
              >
                <XMarkIcon className="h-3.5 w-3.5" />
              </button>
            </span>
          )}
          {filters.priority && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm">
              Priority: {['Low', 'Medium', 'High', 'Urgent', 'Critical'][filters.priority - 1]}
              <button
                onClick={() => dispatch(setFilters({ priority: undefined }))}
                className="hover:bg-amber-200 rounded-full p-0.5"
              >
                <XMarkIcon className="h-3.5 w-3.5" />
              </button>
            </span>
          )}
        </div>
      )}

      {/* Grouped Tasks by Workflow */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">Loading tasks...</p>
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <div className="text-6xl mb-4">📋</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No tasks found</h3>
          <p className="text-gray-500 mb-6">
            {activeFiltersCount > 0 
              ? 'Try adjusting your filters or create a new task'
              : 'Get started by creating your first task'}
          </p>
          <button 
            onClick={() => setShowCreateModal(true)}
            className="btn-primary"
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            Create Task
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedTasks).map(([workflowName, { workflow, tasks: workflowTasks }]) => {
            const isCollapsed = collapsedSections.has(workflowName)
            
            return (
              <div key={workflowName} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Section Header */}
                <button
                  onClick={() => toggleSection(workflowName)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                  style={{
                    borderLeft: workflow ? `4px solid ${workflow.color}` : '4px solid #6B7280'
                  }}
                >
                  <div className="flex items-center gap-3">
                    {isCollapsed ? (
                      <ChevronRightIcon className="h-5 w-5 text-gray-500" />
                    ) : (
                      <ChevronDownIcon className="h-5 w-5 text-gray-500" />
                    )}
                    <div className="flex items-center gap-2">
                      {workflow && (
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: workflow.color }}
                        />
                      )}
                      <h2 className="text-lg font-semibold text-gray-900">{workflowName}</h2>
                    </div>
                    <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium">
                      {workflowTasks.length} {workflowTasks.length === 1 ? 'task' : 'tasks'}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500">
                    {workflow?.taskType || 'General'}
                  </div>
                </button>

                {/* Tasks Grid */}
                <AnimatePresence>
                  {!isCollapsed && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="px-4 pb-4"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {workflowTasks.map((task: Task) => (
                          <motion.div
                            key={task.id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.2 }}
                          >
                            <TaskListItem task={task} />
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      )}

      {/* Completed Tasks Section */}
      {!isLoading && completedTasks.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <button
            onClick={() => toggleSection('Completed Tasks')}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors border-l-4 border-green-500"
          >
            <div className="flex items-center gap-3">
              {collapsedSections.has('Completed Tasks') ? (
                <ChevronRightIcon className="h-5 w-5 text-gray-500" />
              ) : (
                <ChevronDownIcon className="h-5 w-5 text-gray-500" />
              )}
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-green-500" />
                <h2 className="text-lg font-semibold text-gray-900">Completed Tasks</h2>
              </div>
              <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                {completedTasks.length} {completedTasks.length === 1 ? 'task' : 'tasks'}
              </span>
            </div>
            <div className="text-sm text-green-600 font-medium">
              ✓ All Done
            </div>
          </button>

          <AnimatePresence>
            {!collapsedSections.has('Completed Tasks') && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="px-4 pb-4"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {completedTasks.map((task: Task) => (
                    <motion.div
                      key={task.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.2 }}
                    >
                      <TaskListItem task={task} />
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Task Count */}
      {!isLoading && tasks.length > 0 && (
        <div className="text-center text-sm text-gray-500 py-4">
          Showing {activeTasks.length} active task{activeTasks.length !== 1 ? 's' : ''} across {Object.keys(groupedTasks).length} workflow{Object.keys(groupedTasks).length !== 1 ? 's' : ''}
          {completedTasks.length > 0 && ` • ${completedTasks.length} completed task${completedTasks.length !== 1 ? 's' : ''}`}
        </div>
      )}

      {/* Create Task Modal */}
      <CreateTaskModal 
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />
    </div>
  )
}

export default TasksPage
