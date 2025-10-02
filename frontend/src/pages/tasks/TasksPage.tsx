import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { PlusIcon, FunnelIcon, Squares2X2Icon, ListBulletIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { fetchTasks, setFilters } from '@/store/slices/tasksSlice'
import CreateTaskModal from '@/components/tasks/CreateTaskModal'
import ExportButton from '@/components/tasks/ExportButton'
import TaskBoard from '@/components/tasks/TaskBoard'
import { useNavigate } from 'react-router-dom'
import { Task } from '@/types/task'

const TasksPage: React.FC = () => {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { tasks: apiTasks, isLoading, filters, pagination } = useAppSelector((state) => state.tasks)
  const tasks = apiTasks.map(task => ({
    ...task,
    createdById: task.createdBy?.id || ''
  })) as Task[]
  const { user } = useAppSelector((state) => state.auth)
  const [showFilters, setShowFilters] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'board'>('board')

  useEffect(() => {
    dispatch(fetchTasks(filters))
  }, [dispatch, filters])

  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN'

  const phaseColors = {
    PENDING_APPROVAL: 'bg-gray-100 text-gray-800',
    APPROVED: 'bg-blue-100 text-blue-800',
    ASSIGNED: 'bg-purple-100 text-purple-800',
    IN_PROGRESS: 'bg-yellow-100 text-yellow-800',
    COMPLETED: 'bg-green-100 text-green-800',
    ARCHIVED: 'bg-gray-100 text-gray-600',
  }

  const priorityColors = {
    1: 'text-gray-500',
    2: 'text-blue-500',
    3: 'text-yellow-500',
    4: 'text-orange-500',
    5: 'text-red-500',
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
          <p className="text-gray-600 mt-1">
            Manage and track your tasks
          </p>
        </div>
        <div className="flex items-center space-x-3">
          {/* Search Bar */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search tasks..."
              value={filters.search || ''}
              onChange={(e) => dispatch(setFilters({ search: e.target.value || undefined }))}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent w-64"
            />
          </div>

          {/* View Toggle */}
          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('board')}
              className={`p-2 rounded-md transition-colors ${
                viewMode === 'board' 
                  ? 'bg-white text-primary-600 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              title="Board View"
            >
              <Squares2X2Icon className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-md transition-colors ${
                viewMode === 'list' 
                  ? 'bg-white text-primary-600 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              title="List View"
            >
              <ListBulletIcon className="h-4 w-4" />
            </button>
          </div>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className="btn-secondary"
          >
            <FunnelIcon className="h-4 w-4 mr-2" />
            Filters
          </button>
          {isAdmin && (
            <>
              <ExportButton filters={filters} />
              <button 
                onClick={() => setShowCreateModal(true)}
                className="btn-primary"
              >
                <PlusIcon className="h-4 w-4 mr-2" />
                Create Task
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="card"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                <option value="ASSIGNED">Assigned</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </div>
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
            <div className="flex items-end">
              <button
                onClick={() => dispatch(setFilters({}))}
                className="btn-secondary w-full"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Tasks Content */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500">No tasks found</p>
        </div>
      ) : viewMode === 'board' ? (
        <TaskBoard 
          tasks={tasks} 
          onTaskClick={(task) => navigate(`/tasks/${task.id}`)}
        />
      ) : (
        <div className="space-y-4">
          {tasks.map((task: Task, index: number) => (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
              className="card hover:shadow-md transition-shadow duration-200 cursor-pointer"
              onClick={() => navigate(`/tasks/${task.id}`)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {task.title}
                    </h3>
                    <span className={`status-badge ${phaseColors[task.phase as keyof typeof phaseColors]}`}>
                      {task.phase.replace('_', ' ')}
                    </span>
                    <span className={`text-lg ${priorityColors[task.priority as keyof typeof priorityColors]}`}>
                      {'★'.repeat(task.priority)}
                    </span>
                  </div>
                  <p className="text-gray-600 mb-3 line-clamp-2">
                    {task.description}
                  </p>
                  <div className="flex items-center space-x-4 text-sm text-gray-500">
                    {task.assignedTo && (
                      <span>Assigned to: {task.assignedTo.name}</span>
                    )}
                    <span>Created by: {task.createdBy?.name || 'Unknown'}</span>
                    <span>{task._count?.files || 0} files</span>
                    <span>{task._count?.comments || 0} comments</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500">
                    {new Date(task.createdAt).toLocaleDateString()}
                  </p>
                  {task.dueDate && (
                    <p className="text-sm text-red-600">
                      Due: {new Date(task.dueDate).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex justify-center">
          <div className="flex items-center space-x-2">
            <button
              disabled={pagination.page === 1}
              className="btn-secondary disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-gray-600">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              disabled={pagination.page === pagination.totalPages}
              className="btn-secondary disabled:opacity-50"
            >
              Next
            </button>
          </div>
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
