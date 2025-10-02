import React from 'react'
import { motion } from 'framer-motion'
import { Menu } from '@headlessui/react'
import { useNavigate } from 'react-router-dom'
import { EllipsisVerticalIcon, PencilIcon, TrashIcon, ArrowPathIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline'
import ReactMarkdown from 'react-markdown'
import TaskActivityLog from './TaskActivityLog'
import type { DraggableProvided, DroppableProvided, DraggableStateSnapshot, DroppableStateSnapshot, DropResult } from '@hello-pangea/dnd'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { updateTask, fetchTasks } from '@/store/slices/tasksSlice'
import { tasksApi } from '@/services/api'
import toast from 'react-hot-toast'



interface Task {
  id: string
  title: string
  description: string
  priority: number
  phase: string
  assignedToId?: string
  assignedTo?: {
    id: string
    name: string
    email: string
    position: string
  }
  createdById: string
  createdBy?: {
    id: string
    name: string
    email: string
    position: string
  }
  dueDate?: string
  createdAt: string
  comments?: any[]
  files?: any[]
}

interface TaskBoardProps {
  tasks: Task[]
  onTaskClick: (task: Task) => void
}

const TaskBoard: React.FC<TaskBoardProps> = ({ tasks, onTaskClick }) => {
  const dispatch = useAppDispatch()
  const { user } = useAppSelector((state) => state.auth)
  const navigate = useNavigate()

  const phases = [
    { key: 'PENDING_APPROVAL', title: 'Pending Approval', color: 'bg-gray-100 border-gray-300' },
    { key: 'APPROVED', title: 'Approved', color: 'bg-blue-100 border-blue-300' },
    { key: 'REJECTED', title: 'Rejected', color: 'bg-red-100 border-red-300' },
    { key: 'ASSIGNED', title: 'Assigned', color: 'bg-purple-100 border-purple-300' },
    { key: 'IN_PROGRESS', title: 'In Progress', color: 'bg-yellow-100 border-yellow-300' },
    { key: 'COMPLETED', title: 'Completed', color: 'bg-green-100 border-green-300' },
    { key: 'ARCHIVED', title: 'Archived', color: 'bg-gray-100 border-gray-400' },
  ]

  const getTasksByPhase = (phase: string) => {
    return tasks.filter(task => task.phase === phase)
  }

  const getPriorityColor = (priority: number) => {
    switch (priority) {
      case 1: return 'border-l-gray-400'
      case 2: return 'border-l-blue-400'
      case 3: return 'border-l-yellow-400'
      case 4: return 'border-l-orange-400'
      case 5: return 'border-l-red-400'
      default: return 'border-l-gray-400'
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

  const getPhaseDuration = (task: Task) => {
    const now = new Date()
    const createdAt = new Date(task.createdAt)
    const diffInMs = now.getTime() - createdAt.getTime()
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24))
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60))
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60))

    if (diffInDays > 0) {
      return `${diffInDays}d in ${task.phase.replace('_', ' ').toLowerCase()}`
    } else if (diffInHours > 0) {
      return `${diffInHours}h in ${task.phase.replace('_', ' ').toLowerCase()}`
    } else {
      return `${diffInMinutes}m in ${task.phase.replace('_', ' ').toLowerCase()}`
    }
  }

  const canMoveTask = (task: Task, newPhase: string) => {
    // Only admins can approve/reject tasks
    if (newPhase === 'APPROVED' || newPhase === 'REJECTED') {
      return user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN'
    }

    if (user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN') return true
    if (task.assignedToId !== user?.id) return false

    // Phase transition rules for employees
    const phaseOrder = ['PENDING_APPROVAL', 'APPROVED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED']
    const currentIndex = phaseOrder.indexOf(task.phase)
    const newIndex = phaseOrder.indexOf(newPhase)

    // Can only move one step forward or backward
    return Math.abs(newIndex - currentIndex) === 1
  }

  const handleTaskMove = async (task: Task, newPhase: string) => {
    if (!canMoveTask(task, newPhase)) {
      toast.error('You do not have permission to move this task')
      return
    }

    try {
      await dispatch(updateTask({ 
        id: task.id, 
        data: { phase: newPhase } 
      })).unwrap()
      toast.success('Task phase updated successfully')
    } catch (error) {
      console.error('Failed to update task phase:', error)
      toast.error('Failed to update task phase')
    }
  }

  const handleDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result

    // Dropped outside a valid drop target
    if (!destination) return

    // Dropped in the same position
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) return

    // Get the task being moved
    const task = tasks.find(t => t.id === draggableId)
    if (!task) return

    // Check if the phase change is allowed
    if (!canMoveTask(task, destination.droppableId)) {
      toast.error('You do not have permission to move this task')
      return
    }

    // Update the task phase
    handleTaskMove(task, destination.droppableId)
  }

  const renderTask = (task: Task, index: number) => {
    return (
      <Draggable key={task.id} draggableId={task.id} index={index}>
        {(provided: DraggableProvided, snapshot: DraggableStateSnapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            className={`bg-white rounded-lg p-4 shadow-sm border-l-4 hover:shadow-md transition-all duration-200 ${
              snapshot.isDragging ? 'shadow-lg scale-[1.02]' : ''
            } ${getPriorityColor(task.priority)}`}
          >
                    {/* Task Header */}
                    <div className="flex items-start justify-between mb-2">
                      <h4 
                        className="font-medium text-gray-900 text-sm line-clamp-2 leading-tight flex-1 mr-2 cursor-pointer"
                        onClick={() => onTaskClick(task)}
                      >
                        {task.title}
                      </h4>
                      <Menu as="div" className="relative">
                        <Menu.Button className="p-1 rounded-full hover:bg-gray-100 transition-colors">
                          <EllipsisVerticalIcon className="h-5 w-5 text-gray-500" />
                        </Menu.Button>
                        <Menu.Items className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                          <Menu.Item>
                            {({ active }) => (
                              <button
                                onClick={() => onTaskClick(task)}
                                className={`${
                                  active ? 'bg-gray-100' : ''
                                } flex items-center w-full px-4 py-2 text-sm text-gray-700`}
                              >
                                <PencilIcon className="h-4 w-4 mr-2" />
                                Edit Task
                              </button>
                            )}
                          </Menu.Item>
                          {(user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN') && (
                            <Menu.Item>
                              {({ active }) => (
                                <button
                                  onClick={async () => {
                                    if (window.confirm('Are you sure you want to delete this task?')) {
                                      try {
                                        await tasksApi.delete(task.id)
                                        toast.success('Task deleted successfully')
                                        dispatch(fetchTasks({}))
                                      } catch (error: any) {
                                        toast.error(error.response?.data?.message || 'Failed to delete task')
                                      }
                                    }
                                  }}
                                  className={`${
                                    active ? 'bg-gray-100' : ''
                                  } flex items-center w-full px-4 py-2 text-sm text-red-600`}
                                >
                                  <TrashIcon className="h-4 w-4 mr-2" />
                                  Delete Task
                                </button>
                              )}
                            </Menu.Item>
                          )}
                          {phases.map(phase => (
                            phase.key !== task.phase && (
                              <Menu.Item key={phase.key}>
                                {({ active }) => (
                                  <button
                                    onClick={() => {
                                      try {
                                        dispatch(updateTask({ id: task.id, data: { phase: phase.key } }))
                                        toast.success(`Task moved to ${phase.title}`)
                                      } catch (error: any) {
                                        toast.error(error.response?.data?.message || 'Failed to move task')
                                      }
                                    }}
                                    className={`${
                                      active ? 'bg-gray-100' : ''
                                    } flex items-center w-full px-4 py-2 text-sm text-gray-700`}
                                  >
                                    <ArrowPathIcon className="h-4 w-4 mr-2" />
                                    Move to {phase.title}
                                  </button>
                                )}
                              </Menu.Item>
                            )
                          ))}
                        </Menu.Items>
                      </Menu>
                    </div>

            {/* Task Description */}
            <div className="text-xs text-gray-600 mb-3 line-clamp-3 leading-relaxed prose prose-xs max-w-none">
              <ReactMarkdown>{task.description}</ReactMarkdown>
            </div>

            {/* Pending Approval Actions */}
            {task.phase === 'PENDING_APPROVAL' && (user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN') && (
              <div className="flex items-center justify-center space-x-2 mb-3">
                <button
                  onClick={() => {
                    if (window.confirm('Are you sure you want to approve this task?')) {
                      handleTaskMove(task, 'APPROVED')
                    }
                  }}
                  className="flex items-center px-3 py-1 text-xs font-medium text-white bg-green-500 rounded-full hover:bg-green-600 transition-colors"
                >
                  <CheckIcon className="h-3 w-3 mr-1" />
                  Approve
                </button>
                <button
                  onClick={() => {
                    if (window.confirm('Are you sure you want to reject this task?')) {
                      handleTaskMove(task, 'REJECTED')
                    }
                  }}
                  className="flex items-center px-3 py-1 text-xs font-medium text-white bg-red-500 rounded-full hover:bg-red-600 transition-colors"
                >
                  <XMarkIcon className="h-3 w-3 mr-1" />
                  Reject
                </button>
              </div>
            )}

            {/* Task Meta */}
            <div className="flex items-center justify-between text-xs text-gray-500">
              <div className="flex items-center space-x-2">
                {/* Priority */}
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  task.priority >= 4 ? 'bg-red-100 text-red-800' :
                  task.priority === 3 ? 'bg-yellow-100 text-yellow-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {getPriorityText(task.priority)}
                </span>

                {/* Phase Duration */}
                <span className="text-xs text-gray-500">
                  {getPhaseDuration(task)}
                </span>

                {/* Creator Tag */}
                <div className="flex items-center space-x-1">
                  <div className="w-5 h-5 rounded-full bg-gray-500 flex items-center justify-center">
                    <span className="text-xs font-medium text-white">
                      {task.createdBy?.name?.charAt(0).toUpperCase() || 'U'}
                    </span>
                  </div>
                  <span className="text-xs text-gray-600">
                    {task.createdBy?.name || 'Unknown'}
                  </span>
                </div>

                {/* Assigned User */}
                {task.assignedTo && (
                  <div className="flex items-center space-x-1">
                    <div className="w-5 h-5 rounded-full bg-primary-600 flex items-center justify-center">
                      <span className="text-xs font-medium text-white">
                        {task.assignedTo.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <span className="text-xs text-gray-600">
                      {task.assignedTo.name}
                    </span>
                  </div>
                )}
              </div>

              {/* Due Date */}
              {task.dueDate && (
                <span className={`text-xs ${
                  new Date(task.dueDate) < new Date() 
                    ? 'text-red-600 font-medium' 
                    : 'text-gray-500'
                }`}>
                  {new Date(task.dueDate).toLocaleDateString()}
                </span>
              )}
            </div>

                      {/* Task Stats */}
                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">
                      <div className="flex items-center space-x-3 text-xs text-gray-500">
                        {/* Comments Count */}
                        {task.comments && task.comments.length > 0 && (
                          <span className="flex items-center space-x-1">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                            </svg>
                            <span>{task.comments.length}</span>
                          </span>
                        )}

                        {/* Files Count */}
                        {task.files && task.files.length > 0 && (
                          <span className="flex items-center space-x-1">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M8 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a1 1 0 112 0v4a7 7 0 11-14 0V7a5 5 0 0110 0v4a3 3 0 11-6 0V7a1 1 0 012 0v4a1 1 0 102 0V7a3 3 0 00-3-3z" clipRule="evenodd" />
                            </svg>
                            <span>{task.files.length}</span>
                          </span>
                        )}
                      </div>

                      {/* Created Date */}
                      <span className="text-xs text-gray-400">
                        {new Date(task.createdAt).toLocaleDateString()}
                      </span>
                    </div>

          </div>
        )}
      </Draggable>
    )
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="w-full overflow-x-auto">
        <div className="flex space-x-6 min-w-max pb-4">
          {phases.map((phase) => {
            const phaseTasks = getTasksByPhase(phase.key)
            
            return (
              <div key={phase.key} className="flex flex-col w-80 flex-shrink-0">
                {/* Column Header */}
                <div className={`rounded-t-lg p-4 border-2 ${phase.color}`}>
                  <h3 className="font-semibold text-gray-900 text-sm">
                    {phase.title}
                  </h3>
                  <p className="text-xs text-gray-600 mt-1">
                    {phaseTasks.length} task{phaseTasks.length !== 1 ? 's' : ''}
                  </p>
                </div>

                {/* Tasks Container */}
                <Droppable droppableId={phase.key}>
                  {(provided: DroppableProvided, snapshot: DroppableStateSnapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`flex-1 bg-gray-50 border-l-2 border-r-2 border-b-2 border-gray-200 rounded-b-lg p-3 min-h-[500px] max-h-[calc(100vh-200px)] overflow-y-auto ${
                        snapshot.isDraggingOver ? 'bg-gray-100' : ''
                      }`}
                    >
                      <div className="space-y-3">
                        {phaseTasks.map((task, index) => renderTask(task, index))}

                        {/* Empty State */}
                        {phaseTasks.length === 0 && (
                          <div className="text-center py-8">
                            <p className="text-gray-400 text-sm">No tasks in this phase</p>
                          </div>
                        )}
                      </div>
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            )
          })}
        </div>
      </div>

              {/* Activity Log */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 bg-white rounded-lg shadow-lg p-6 border-t-4 border-primary-500"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-semibold text-gray-900">Recent Activity</h3>
                  <button 
                    className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                    onClick={() => navigate('/activity')}
                  >
                    View All
                  </button>
                </div>
                <TaskActivityLog activities={[
                  {
                    id: '1',
                    type: 'PHASE_CHANGE',
                    user: { name: 'System' },
                    description: 'Task board initialized',
                    createdAt: new Date().toISOString()
                  }
                ]} />
              </motion.div>
    </DragDropContext>
  )
}

export default TaskBoard