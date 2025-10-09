import React, { useState, useEffect } from 'react'
import { Menu } from '@headlessui/react'
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
import type { DraggableProvided, DroppableProvided, DraggableStateSnapshot, DroppableStateSnapshot, DropResult } from '@hello-pangea/dnd'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { updateTask, fetchTasks } from '@/store/slices/tasksSlice'
import { tasksApi, workflowsApi } from '@/services/api'
import { Task, Phase } from '@/types/task'
import toast from 'react-hot-toast'

interface TaskBoardProps {
  tasks: Task[]
  onTaskClick: (task: Task) => void
}

const TaskBoard: React.FC<TaskBoardProps> = ({ tasks, onTaskClick }) => {
  const dispatch = useAppDispatch()
  const { user } = useAppSelector((state) => state.auth)
  const [phases, setPhases] = useState<Phase[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadPhases()
  }, [])

  const loadPhases = async () => {
    try {
      setIsLoading(true)
      const workflows = await workflowsApi.getAll()
      
      // Extract all unique phases from all workflows
      const allPhases: Phase[] = []
      const phaseMap = new Map<string, Phase>()
      
      workflows.forEach(workflow => {
        workflow.phases?.forEach((phase: Phase) => {
          if (!phaseMap.has(phase.id)) {
            phaseMap.set(phase.id, phase)
            allPhases.push(phase)
          }
        })
      })
      
      // Sort phases by workflow order
      allPhases.sort((a, b) => a.order - b.order)
      setPhases(allPhases)
    } catch (error) {
      console.error('Error loading phases:', error)
      toast.error('Failed to load workflow phases')
      // Fallback to legacy phases if workflows fail
      setPhases(getLegacyPhases())
    } finally {
      setIsLoading(false)
    }
  }

  // Fallback legacy phases for backward compatibility
  const getLegacyPhases = (): Phase[] => [
    { 
      id: 'legacy-pending',
      name: 'PENDING APPROVAL',
      order: 0,
      color: '#DFE1E6',
      allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'],
      isStartPhase: true,
      isEndPhase: false,
      requiresApproval: false,
      workflowId: 'legacy'
    },
    { 
      id: 'legacy-approved',
      name: 'APPROVED',
      order: 1,
      color: '#E6F7FF',
      allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'],
      isStartPhase: false,
      isEndPhase: false,
      requiresApproval: false,
      workflowId: 'legacy'
    },
    { 
      id: 'legacy-rejected',
      name: 'REJECTED',
      order: 2,
      color: '#FFEBE6',
      allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
      isStartPhase: false,
      isEndPhase: false,
      requiresApproval: false,
      workflowId: 'legacy'
    },
    { 
      id: 'legacy-assigned',
      name: 'ASSIGNED',
      order: 3,
      color: '#EAE6FF',
      allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'],
      isStartPhase: false,
      isEndPhase: false,
      requiresApproval: false,
      workflowId: 'legacy'
    },
    { 
      id: 'legacy-progress',
      name: 'IN PROGRESS',
      order: 4,
      color: '#FFF0B3',
      allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'],
      isStartPhase: false,
      isEndPhase: false,
      requiresApproval: false,
      workflowId: 'legacy'
    },
    { 
      id: 'legacy-completed',
      name: 'COMPLETED',
      order: 5,
      color: '#E3FCEF',
      allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'],
      isStartPhase: false,
      isEndPhase: true,
      requiresApproval: false,
      workflowId: 'legacy'
    },
    { 
      id: 'legacy-archived',
      name: 'ARCHIVED',
      order: 6,
      color: '#F4F5F7',
      allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
      isStartPhase: false,
      isEndPhase: true,
      requiresApproval: false,
      workflowId: 'legacy'
    },
  ]

  // Filter phases based on user role
  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN'
  const visiblePhases = phases.filter(phase => {
    // Hide archived phases for employees
    if (!isAdmin && phase.name.toLowerCase().includes('archived')) {
      return false
    }
    return true
  })

  const getTasksByPhase = (phaseId: string) => {
    return tasks.filter(task => {
      // Try new workflow system first
      if (task.currentPhaseId) {
        return task.currentPhaseId === phaseId
      }
      // Fallback to legacy phase matching
      if (task.phase) {
        const legacyPhase = phases.find(p => 
          p.name.toLowerCase().replace(/\s+/g, '_') === task.phase?.toLowerCase()
        )
        return legacyPhase?.id === phaseId
      }
      return false
    })
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


  const canMoveTask = (task: Task, toPhaseId: string) => {
    const toPhase = phases.find(p => p.id === toPhaseId)
    if (!toPhase) return false

    // Check if user has permission for this phase
    const userRole = user?.role || 'EMPLOYEE'
    if (!toPhase.allowedRoles.includes(userRole)) {
      return false
    }

    // Admins can move any task to any allowed phase
    if (user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN') return true
    
    // Employees can only move their assigned tasks
    if (task.assignedToId !== user?.id) return false

    return true
  }

  const handleTaskMove = async (task: Task, toPhaseId: string) => {
    if (!canMoveTask(task, toPhaseId)) {
      toast.error('You do not have permission to move this task')
      return
    }

    try {
      // Use new workflow API if task has workflow info
      if (task.currentPhaseId && task.workflowId) {
        await tasksApi.moveToPhase(task.id, toPhaseId)
      } else {
        // Fallback: For tasks without workflow, we can't move them
        toast.error('Cannot move tasks without a workflow. Please assign a workflow first.')
        return
      }
      
      toast.success('Task moved successfully')
      dispatch(fetchTasks({})) // Refresh tasks
      
      // Dispatch custom event to notify NotificationBell
      window.dispatchEvent(new CustomEvent('taskUpdated'))
    } catch (error) {
      console.error('Failed to move task:', error)
      toast.error('Failed to move task')
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

    // Move the task
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Loading workflow phases...</span>
      </div>
    )
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="w-full overflow-x-auto">
        <div className="flex space-x-6 min-w-max pb-4">
          {visiblePhases.map((phase) => {
            const phaseTasks = getTasksByPhase(phase.id)
            
            return (
              <div 
                key={phase.id} 
                className="flex flex-col w-80 flex-shrink-0"
              >
                {/* Column Header - Enhanced Workflow Style */}
                <div 
                  className="px-4 py-3 mb-2 rounded-t-lg border-b-2"
                  style={{ 
                    backgroundColor: phase.color,
                    borderBottomColor: phase.color
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div 
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: phase.color === '#FFFFFF' ? '#6B7280' : '#FFFFFF' }}
                      />
                      <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                        {phase.name}
                      </h3>
                      {phase.requiresApproval && (
                        <span className="text-xs bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded">
                          Approval
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-bold text-gray-700 bg-white/80 px-2.5 py-1 rounded-full shadow-sm">
                      {phaseTasks.length}
                    </span>
                  </div>
                  {phase.description && (
                    <p className="text-xs text-gray-600 mt-1">{phase.description}</p>
                  )}
                </div>

                {/* Tasks Container */}
                <Droppable droppableId={phase.id}>
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
                          <div className="text-center py-8 text-gray-500">
                            <div className="text-2xl mb-2">📋</div>
                            <p className="text-sm">No tasks in {phase.name}</p>
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
    </DragDropContext>
  )
}

export default TaskBoard