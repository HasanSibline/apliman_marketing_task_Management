import React, { useState, useEffect } from 'react'
import { Menu } from '@headlessui/react'
import { 
  EllipsisVerticalIcon, 
  PencilIcon, 
  TrashIcon,
  CalendarIcon,
  ChatBubbleLeftIcon,
  PaperClipIcon,
  ClockIcon,
  UserIcon,
  UserCircleIcon as UserCircleIconOutline,
  FlagIcon,
  BoltIcon,
  FireIcon,
  ChevronUpIcon,
  ArrowUpIcon,
  ArrowDownIcon
} from '@heroicons/react/24/outline'
import { 
  ExclamationTriangleIcon,
  SparklesIcon
} from '@heroicons/react/24/solid'
import type { DraggableProvided, DroppableProvided, DraggableStateSnapshot, DroppableStateSnapshot, DropResult } from '@hello-pangea/dnd'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { fetchTasks } from '@/store/slices/tasksSlice'
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
  const visiblePhases = phases.filter((phase: Phase) => {
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
        const legacyPhase = phases.find((p: Phase) => 
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
          color: '#6B7280',
          bg: 'bg-gray-100',
          text: 'text-gray-700',
          icon: ArrowDownIcon,
          label: 'Low'
        }
      case 2: 
        return { 
          color: '#3B82F6',
          bg: 'bg-blue-100',
          text: 'text-blue-700',
          icon: ChevronUpIcon,
          label: 'Medium'
        }
      case 3: 
        return { 
          color: '#F59E0B',
          bg: 'bg-amber-100',
          text: 'text-amber-700',
          icon: ArrowUpIcon,
          label: 'High'
        }
      case 4: 
        return { 
          color: '#EF4444',
          bg: 'bg-red-100',
          text: 'text-red-700',
          icon: BoltIcon,
          label: 'Urgent'
        }
      case 5: 
        return { 
          color: '#DC2626',
          bg: 'bg-red-200',
          text: 'text-red-800',
          icon: FireIcon,
          label: 'Critical'
        }
      default: 
        return { 
          color: '#6B7280',
          bg: 'bg-gray-100',
          text: 'text-gray-700',
          icon: ArrowUpIcon,
          label: 'Normal'
        }
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
    const toPhase = phases.find((p: Phase) => p.id === toPhaseId)
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
    const PriorityIcon = priorityConfig.icon
    const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && !task.completedAt
    const subtaskProgress = task.subtasks ? 
      `${task.subtasks.filter(s => s.isCompleted).length}/${task.subtasks.length}` : null
    
    return (
      <Draggable key={task.id} draggableId={task.id} index={index}>
        {(provided: DraggableProvided, snapshot: DraggableStateSnapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            className={`group relative bg-white rounded-2xl border transition-all duration-300 cursor-pointer mb-4 overflow-hidden ${
              snapshot.isDragging 
                ? 'shadow-2xl scale-105 rotate-2 border-blue-300 ring-2 ring-blue-200' 
                : 'shadow-md hover:shadow-xl border-gray-200 hover:border-blue-300'
            }`}
            style={{
              ...provided.draggableProps.style,
            }}
          >
            {/* Priority Indicator Bar */}
            <div 
              className="absolute top-0 left-0 right-0 h-1"
              style={{ backgroundColor: priorityConfig.color }}
            />

            {/* Task Type Badge */}
            {task.taskType && task.taskType !== 'GENERAL' && (
              <div className="absolute top-3 right-3">
                <span className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium ${
                  task.taskType === 'SUBTASK' 
                    ? 'bg-purple-100 text-purple-700' 
                    : 'bg-blue-100 text-blue-700'
                }`}>
                  {task.taskType === 'SUBTASK' && <SparklesIcon className="h-3 w-3 mr-1" />}
                  {task.taskType}
                </span>
              </div>
            )}

            <div className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1 min-w-0">
                  <h4 
                    className="text-lg font-semibold text-gray-900 line-clamp-2 leading-tight hover:text-blue-600 transition-colors cursor-pointer mb-2"
                        onClick={() => onTaskClick(task)}
                  title={task.title}
                      >
                        {task.title}
                      </h4>
                  
                  {/* Task Meta Info */}
                  <div className="flex items-center space-x-3 text-sm text-gray-500">
                    <div className="flex items-center space-x-1">
                      <UserIcon className="h-4 w-4" />
                      <span>{task.createdBy?.name || 'Unknown'}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <ClockIcon className="h-4 w-4" />
                      <span>{getPhaseDuration(task)}</span>
                    </div>
                  </div>
                </div>

                {/* Actions Menu */}
                <Menu as="div" className="relative flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Menu.Button className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
                    <EllipsisVerticalIcon className="h-5 w-5 text-gray-500" />
                        </Menu.Button>
                  <Menu.Items className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-2xl border border-gray-200 py-2 z-50 ring-1 ring-black ring-opacity-5">
                          <Menu.Item>
                            {({ active }) => (
                              <button
                                onClick={() => onTaskClick(task)}
                                className={`${
                            active ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                          } flex items-center w-full px-4 py-3 text-sm font-medium transition-colors`}
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
                              } flex items-center w-full px-4 py-3 text-sm font-medium transition-colors`}
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

                {/* Assigned To */}
                {task.assignedTo && (
                <div className="flex items-center space-x-2 mb-4 p-3 bg-blue-50 rounded-xl">
                  <UserCircleIconOutline className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="text-sm font-medium text-blue-900">{task.assignedTo.name}</p>
                    {task.assignedTo.position && (
                      <p className="text-xs text-blue-600">{task.assignedTo.position}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Progress & Metrics */}
              <div className="flex flex-wrap items-center gap-2 mb-4">
                {/* Priority */}
                <div className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg ${priorityConfig.bg} ${priorityConfig.text}`}>
                  <PriorityIcon className="h-4 w-4" />
                  <span className="text-xs font-semibold">{priorityConfig.label}</span>
                    </div>

                {/* Subtasks Progress */}
                {subtaskProgress && (
                  <div className="inline-flex items-center space-x-1.5 bg-purple-100 text-purple-700 px-3 py-1.5 rounded-lg">
                    <FlagIcon className="h-4 w-4" />
                    <span className="text-xs font-semibold">{subtaskProgress}</span>
                  </div>
                )}

                {/* Workflow Phase */}
                {task.currentPhase && (
                  <div 
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                    style={{ 
                      backgroundColor: `${task.currentPhase.color}20`,
                      color: task.currentPhase.color
                    }}
                  >
                    <div 
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: task.currentPhase.color }}
                    />
                    {task.currentPhase.name}
                  </div>
                )}
              </div>

              {/* Due Date Warning */}
              {isOverdue && (
                <div className="flex items-center space-x-2 mb-4 p-3 bg-red-50 rounded-xl border border-red-200">
                  <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />
                  <div>
                    <p className="text-sm font-medium text-red-900">Overdue</p>
                    <p className="text-xs text-red-600">
                      Due {new Date(task.dueDate!).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              )}

              {/* Task Footer */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                <div className="flex items-center space-x-4">
                  {/* Comments */}
                  {task.comments && task.comments.length > 0 && (
                    <div className="flex items-center space-x-1 text-gray-500">
                      <ChatBubbleLeftIcon className="w-4 h-4" />
                      <span className="text-sm font-medium">{task.comments.length}</span>
                    </div>
                  )}

                  {/* Files */}
                  {task.files && task.files.length > 0 && (
                    <div className="flex items-center space-x-1 text-gray-500">
                      <PaperClipIcon className="w-4 h-4" />
                      <span className="text-sm font-medium">{task.files.length}</span>
                  </div>
                )}
              </div>

              {/* Due Date */}
                {task.dueDate && !isOverdue && (
                  <div className="flex items-center space-x-1 text-gray-500">
                    <CalendarIcon className="w-4 h-4" />
                    <span className="text-sm font-medium">
                      {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
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
          {visiblePhases.map((phase: Phase) => {
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