import React from 'react'
import { motion } from 'framer-motion'
import { Menu } from '@headlessui/react'
import { useNavigate } from 'react-router-dom'
import { 
  EllipsisVerticalIcon, 
  PencilIcon, 
  TrashIcon,
  CalendarIcon,
  ChatBubbleLeftIcon,
  PaperClipIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  UserIcon,
  UserCircleIcon as UserCircleIconOutline
} from '@heroicons/react/24/outline'
import { 
  BoltIcon as BoltIconSolid,
  CheckCircleIcon as CheckCircleIconSolid,
  ClockIcon as ClockIconSolid,
  UserCircleIcon as UserCircleIconSolid,
  XCircleIcon as XCircleIconSolid,
  ArchiveBoxIcon as ArchiveBoxIconSolid
} from '@heroicons/react/24/solid'
import TaskActivityLog from './TaskActivityLog'
import type { DraggableProvided, DroppableProvided, DraggableStateSnapshot, DroppableStateSnapshot, DropResult } from '@hello-pangea/dnd'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { updateTask, fetchTasks } from '@/store/slices/tasksSlice'
import { tasksApi } from '@/services/api'
import { Task } from '@/types/task'
import toast from 'react-hot-toast'

interface TaskBoardProps {
  tasks: Task[]
  onTaskClick: (task: Task) => void
}

const TaskBoard: React.FC<TaskBoardProps> = ({ tasks, onTaskClick }) => {
  const dispatch = useAppDispatch()
  const { user } = useAppSelector((state) => state.auth)
  const navigate = useNavigate()

  const allPhases = [
    { 
      key: 'PENDING_APPROVAL', 
      title: 'PENDING APPROVAL',
      color: '#DFE1E6',
      Icon: ClockIconSolid,
      iconColor: 'text-gray-600'
    },
    { 
      key: 'APPROVED', 
      title: 'APPROVED',
      color: '#E6F7FF',
      Icon: CheckCircleIconSolid,
      iconColor: 'text-cyan-600'
    },
    { 
      key: 'REJECTED', 
      title: 'REJECTED',
      color: '#FFEBE6',
      Icon: XCircleIconSolid,
      iconColor: 'text-red-600'
    },
    { 
      key: 'ASSIGNED', 
      title: 'ASSIGNED',
      color: '#EAE6FF',
      Icon: UserCircleIconSolid,
      iconColor: 'text-purple-600'
    },
    { 
      key: 'IN_PROGRESS', 
      title: 'IN PROGRESS',
      color: '#FFF0B3',
      Icon: BoltIconSolid,
      iconColor: 'text-blue-600'
    },
    { 
      key: 'COMPLETED', 
      title: 'DONE',
      color: '#E3FCEF',
      Icon: CheckCircleIconSolid,
      iconColor: 'text-green-600'
    },
    { 
      key: 'ARCHIVED', 
      title: 'ARCHIVED',
      color: '#F4F5F7',
      Icon: ArchiveBoxIconSolid,
      iconColor: 'text-gray-500'
    },
  ]

  // Filter phases based on user role - hide ARCHIVED column for employees
  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN'
  const phases = isAdmin ? allPhases : allPhases.filter(phase => phase.key !== 'ARCHIVED')

  const getTasksByPhase = (phase: string) => {
    return tasks.filter(task => task.phase === phase)
  }

  const getPriorityConfig = (priority: number) => {
    switch (priority) {
      case 1: 
        return { 
          color: '#5E6C84',
          bg: 'bg-gray-100',
          text: 'text-gray-700',
          icon: '↓'
        }
      case 2: 
        return { 
          color: '#0052CC',
          bg: 'bg-blue-100',
          text: 'text-blue-700',
          icon: '→'
        }
      case 3: 
        return { 
          color: '#FF991F',
          bg: 'bg-yellow-100',
          text: 'text-yellow-700',
          icon: '↑'
        }
      case 4: 
        return { 
          color: '#FF5630',
          bg: 'bg-orange-100',
          text: 'text-orange-700',
          icon: '⬆'
        }
      case 5: 
        return { 
          color: '#DE350B',
          bg: 'bg-red-100',
          text: 'text-red-700',
          icon: '🔥'
        }
      default: 
        return { 
          color: '#5E6C84',
          bg: 'bg-gray-100',
          text: 'text-gray-700',
          icon: '→'
        }
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

    if (diffInDays > 0) {
      return `${diffInDays}d`
    } else if (diffInHours > 0) {
      return `${diffInHours}h`
    } else {
      return 'Just now'
    }
  }


  const canMoveTask = (task: Task, newPhase: string) => {
    // Only admins can approve (assign) or reject tasks
    if (newPhase === 'ASSIGNED' && task.phase === 'PENDING_APPROVAL') {
      return user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN'
    }
    
    if (newPhase === 'REJECTED') {
      return user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN'
    }

    // Only admins can archive tasks
    if (newPhase === 'ARCHIVED') {
      return user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN'
    }

    // Admins can move any task to any phase
    if (user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN') return true
    
    // Employees can only move their assigned tasks
    if (task.assignedToId !== user?.id) return false

    // Employees can move through normal workflow phases (from ASSIGNED onwards)
    const allowedPhases = ['IN_PROGRESS', 'COMPLETED']
    return allowedPhases.includes(newPhase)
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
      
      // Dispatch custom event to notify NotificationBell
      console.log('Dispatching taskUpdated event')
      window.dispatchEvent(new CustomEvent('taskUpdated'))
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
    const priorityConfig = getPriorityConfig(task.priority)
    
    return (
      <Draggable key={task.id} draggableId={task.id} index={index}>
        {(provided: DraggableProvided, snapshot: DraggableStateSnapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            className={`group bg-white rounded-lg border border-gray-200 hover:bg-gray-50 transition-all duration-150 cursor-pointer mb-2 ${
              snapshot.isDragging ? 'shadow-2xl rotate-3 opacity-90' : 'shadow-sm hover:shadow-md'
            }`}
            style={{
              ...provided.draggableProps.style,
            }}
          >
            {/* Card Content */}
            <div className="p-3">
              {/* Task Title */}
              <div className="flex items-start justify-between mb-3">
                <h4 
                  className="text-sm font-medium text-gray-900 line-clamp-2 leading-snug flex-1 hover:text-blue-600 transition-colors cursor-pointer"
                        onClick={() => onTaskClick(task)}
                  title={task.title}
                      >
                        {task.title}
                      </h4>
                <Menu as="div" className="relative ml-2 flex-shrink-0">
                  <Menu.Button className="p-1 rounded hover:bg-gray-200 transition-colors opacity-0 group-hover:opacity-100">
                    <EllipsisVerticalIcon className="h-4 w-4 text-gray-500" />
                        </Menu.Button>
                  <Menu.Items className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-2xl border border-gray-200 py-2 z-50 ring-1 ring-black ring-opacity-5">
                          <Menu.Item>
                            {({ active }) => (
                              <button
                                onClick={() => onTaskClick(task)}
                                className={`${
                            active ? 'bg-primary-50 text-primary-700' : 'text-gray-700'
                          } flex items-center w-full px-4 py-2.5 text-sm font-medium transition-colors`}
                              >
                          <PencilIcon className="h-4 w-4 mr-3" />
                                Edit Task
                              </button>
                            )}
                          </Menu.Item>
                          {(user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN') && (
                      <>
                        <div className="my-1 border-t border-gray-100" />
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
                                active ? 'bg-red-50 text-red-700' : 'text-red-600'
                              } flex items-center w-full px-4 py-2.5 text-sm font-medium transition-colors`}
                                >
                              <TrashIcon className="h-4 w-4 mr-3" />
                                  Delete Task
                                </button>
                              )}
                            </Menu.Item>
                      </>
                          )}
                    <div className="my-1 border-t border-gray-100" />
                    <div className="px-2 py-1">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2">Move To</p>
                    </div>
                          {phases.map(phase => (
                            phase.key !== task.phase && canMoveTask(task, phase.key) && (
                              <Menu.Item key={phase.key}>
                                {({ active }) => (
                                  <button
                                    onClick={async () => {
                                      try {
                                        await dispatch(updateTask({ id: task.id, data: { phase: phase.key } }))
                                        toast.success(`Task moved to ${phase.title}`)
                                        
                                        // Dispatch custom event to notify NotificationBell
                                        window.dispatchEvent(new CustomEvent('taskUpdated'))
                                      } catch (error: any) {
                                        toast.error(error.response?.data?.message || 'Failed to move task')
                                      }
                                    }}
                                    className={`${
                                active ? 'bg-gray-50' : ''
                              } flex items-center w-full px-4 py-2 text-sm text-gray-700 font-medium transition-colors`}
                                  >
                              <phase.Icon className={`h-4 w-4 mr-3 ${phase.iconColor}`} />
                              {phase.title}
                                  </button>
                                )}
                              </Menu.Item>
                            )
                          ))}
                        </Menu.Items>
                      </Menu>
                    </div>

              {/* Metadata Tags */}
              <div className="flex flex-wrap gap-2 mb-3">
                {/* Time in Phase */}
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-gray-100 text-gray-700 font-medium">
                  <ClockIcon className="h-3.5 w-3.5" />
                  {getPhaseDuration(task)}
                </span>

                {/* Created By */}
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-blue-50 text-blue-700 font-medium" title={`Created by ${task.createdBy?.name || 'Unknown'}`}>
                  <UserIcon className="h-3.5 w-3.5" />
                  {task.createdBy?.name || 'Unknown'}
                </span>

                {/* Assigned To */}
                {task.assignedTo && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-purple-50 text-purple-700 font-medium" title={`Assigned to ${task.assignedTo.name}`}>
                    <UserCircleIconOutline className="h-3.5 w-3.5" />
                    {task.assignedTo.name}
                  </span>
                )}

                {/* Priority */}
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${priorityConfig.bg} ${priorityConfig.text}`}>
                  <span className="text-sm">{priorityConfig.icon}</span>
                  {getPriorityText(task.priority)}
                      </span>
                    </div>

              {/* Pending Approval Actions */}
              {task.phase === 'PENDING_APPROVAL' && (user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN') && (
                <div className="flex items-center gap-2 mb-3">
                  <button
                    onClick={async () => {
                      if (window.confirm('Are you sure you want to approve this task?')) {
                        await handleTaskMove(task, 'APPROVED')
                      }
                    }}
                    className="flex-1 flex items-center justify-center px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded hover:bg-green-700 transition-colors"
                  >
                    <CheckCircleIcon className="h-4 w-4 mr-1" />
                    Approve
                  </button>
                  <button
                    onClick={async () => {
                      if (window.confirm('Are you sure you want to reject this task?')) {
                        await handleTaskMove(task, 'REJECTED')
                      }
                    }}
                    className="flex-1 flex items-center justify-center px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700 transition-colors"
                  >
                    <XCircleIcon className="h-4 w-4 mr-1" />
                    Reject
                  </button>
                </div>
              )}

              {/* Task Footer */}
              <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-100">
                <div className="flex items-center space-x-3">
                  {/* Comments */}
                  {task.comments && task.comments.length > 0 && (
                    <div className="flex items-center space-x-1">
                      <ChatBubbleLeftIcon className="w-3.5 h-3.5" />
                      <span>{task.comments.length}</span>
                    </div>
                  )}

                  {/* Files */}
                  {task.files && task.files.length > 0 && (
                    <div className="flex items-center space-x-1">
                      <PaperClipIcon className="w-3.5 h-3.5" />
                      <span>{task.files.length}</span>
                  </div>
                )}
              </div>

              {/* Due Date */}
              {task.dueDate && (
                  <div className={`flex items-center space-x-1 ${
                    new Date(task.dueDate) < new Date() ? 'text-red-600 font-medium' : ''
                  }`}>
                    <CalendarIcon className="w-3.5 h-3.5" />
                    <span>{new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            </div>
                        )}
                      </div>
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
              <div 
                key={phase.key} 
                className="flex flex-col w-80 flex-shrink-0"
              >
                {/* Column Header - Enhanced Jira Style */}
                <div 
                  className="px-4 py-3 mb-2 rounded-t-lg border-b-2"
                  style={{ 
                    backgroundColor: phase.color,
                    borderBottomColor: phase.iconColor.includes('gray') ? '#9CA3AF' : 
                                      phase.iconColor.includes('green') ? '#10B981' :
                                      phase.iconColor.includes('red') ? '#EF4444' :
                                      phase.iconColor.includes('purple') ? '#8B5CF6' :
                                      phase.iconColor.includes('blue') ? '#3B82F6' : '#9CA3AF'
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <phase.Icon className={`h-4 w-4 ${phase.iconColor}`} />
                      <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                    {phase.title}
                  </h3>
                    </div>
                    <span className="text-xs font-bold text-gray-700 bg-white/80 px-2.5 py-1 rounded-full shadow-sm">
                      {phaseTasks.length}
                    </span>
                  </div>
                </div>

                {/* Tasks Container */}
                <Droppable droppableId={phase.key}>
                  {(provided: DroppableProvided, snapshot: DroppableStateSnapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`px-3 pb-2 min-h-[500px] max-h-[calc(100vh-200px)] overflow-y-auto ${
                        snapshot.isDraggingOver ? 'bg-blue-50' : ''
                      }`}
                      style={{ backgroundColor: snapshot.isDraggingOver ? '#DEEBFF' : phase.color }}
                    >
                        {phaseTasks.map((task, index) => renderTask(task, index))}

                        {/* Empty State */}
                        {phaseTasks.length === 0 && (
                        <div className="text-center py-8 text-gray-400 text-sm">
                          Drop tasks here
                          </div>
                        )}
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