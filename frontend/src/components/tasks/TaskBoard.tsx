import React, { useState, useEffect } from 'react'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import type { DropResult } from '@hello-pangea/dnd'
import { 
  ChevronDownIcon,
  ChevronUpIcon,
  UserIcon,
  CalendarIcon,
  ClockIcon,
  BoltIcon,
  FireIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  FlagIcon
} from '@heroicons/react/24/outline'
import { useAppDispatch } from '@/hooks/redux'
import { fetchTasks } from '@/store/slices/tasksSlice'
import { tasksApi, workflowsApi } from '@/services/api'
import { Task, Workflow } from '@/types/task'
import toast from 'react-hot-toast'

interface TaskBoardProps {
  tasks: Task[]
  onTaskClick: (task: Task) => void
}

interface ConsolidatedPhase {
  id: string
  name: string
  color: string
  workflows: {
    workflowId: string
    workflowName: string
    originalPhaseName: string
    color: string
  }[]
  tasks: Task[]
}

const TaskBoard: React.FC<TaskBoardProps> = ({ tasks, onTaskClick }) => {
  const dispatch = useAppDispatch()
  const [consolidatedPhases, setConsolidatedPhases] = useState<ConsolidatedPhase[]>([])
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)

  // Phase consolidation mapping
  const PHASE_MAPPING = {
    'Planning': ['Research', 'Strategy', 'Pre-production', 'Analysis', 'Discovery', 'To Do', 'Research & Strategy'],
    'Creation': ['Content Creation', 'Development', 'Production', 'Design', 'Writing', 'In Progress'],
    'Review': ['Review', 'Approval', 'Quality Check', 'Testing', 'Validation', 'Review & Approval'],
    'Complete': ['Published', 'Done', 'Deployed', 'Completed', 'Live']
  }

  useEffect(() => {
    loadAndConsolidatePhases()
  }, [tasks])

  const loadAndConsolidatePhases = async () => {
    try {
      setIsLoading(true)
      const workflows = await workflowsApi.getAll()
      
      const consolidated = consolidatePhases(workflows, tasks)
      setConsolidatedPhases(consolidated)
    } catch (error) {
      console.error('Error loading phases:', error)
      toast.error('Failed to load workflow phases')
      // Create fallback consolidated phases
      setConsolidatedPhases(createFallbackPhases(tasks))
    } finally {
      setIsLoading(false)
    }
  }

  const consolidatePhases = (workflows: Workflow[], tasks: Task[]): ConsolidatedPhase[] => {
    const consolidated: ConsolidatedPhase[] = []
    
    // Create consolidated phase structure
    Object.entries(PHASE_MAPPING).forEach(([consolidatedName, phaseNames], index) => {
      const consolidatedPhase: ConsolidatedPhase = {
        id: `consolidated-${consolidatedName.toLowerCase()}`,
        name: consolidatedName,
        color: getConsolidatedPhaseColor(consolidatedName),
        workflows: [],
        tasks: []
      }

      // Find all workflows and phases that map to this consolidated phase
      workflows.forEach(workflow => {
        workflow.phases?.forEach(phase => {
          if (phaseNames.some(name => phase.name.toLowerCase().includes(name.toLowerCase()))) {
            consolidatedPhase.workflows.push({
              workflowId: workflow.id,
              workflowName: workflow.name,
              originalPhaseName: phase.name,
              color: workflow.color || '#6B7280'
            })
          }
        })
      })

      // Add tasks that belong to this consolidated phase
      consolidatedPhase.tasks = tasks.filter(task => {
        if (!task.currentPhase) return consolidatedName === 'Planning' // Default to Planning
        return phaseNames.some(name => 
          task.currentPhase?.name.toLowerCase().includes(name.toLowerCase())
        )
      })

      consolidated.push(consolidatedPhase)
    })

    return consolidated
  }

  const createFallbackPhases = (tasks: Task[]): ConsolidatedPhase[] => {
    return [
      {
        id: 'fallback-planning',
        name: 'Planning',
        color: '#8B5CF6',
        workflows: [],
        tasks: tasks.filter(t => !t.currentPhase || t.currentPhase.name.includes('To Do') || t.currentPhase.name.includes('Research'))
      },
      {
        id: 'fallback-creation',
        name: 'Creation',
        color: '#3B82F6',
        workflows: [],
        tasks: tasks.filter(t => t.currentPhase?.name.includes('Progress') || t.currentPhase?.name.includes('Creation'))
      },
      {
        id: 'fallback-review',
        name: 'Review',
        color: '#F59E0B',
        workflows: [],
        tasks: tasks.filter(t => t.currentPhase?.name.includes('Review') || t.currentPhase?.name.includes('Approval'))
      },
      {
        id: 'fallback-complete',
        name: 'Complete',
        color: '#10B981',
        workflows: [],
        tasks: tasks.filter(t => t.currentPhase?.name.includes('Complete') || t.currentPhase?.name.includes('Published'))
      }
    ]
  }

  const getConsolidatedPhaseColor = (phaseName: string): string => {
    const colors = {
      'Planning': '#8B5CF6',
      'Creation': '#3B82F6', 
      'Review': '#F59E0B',
      'Complete': '#10B981'
    }
    return colors[phaseName as keyof typeof colors] || '#6B7280'
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

  const getSubtaskProgress = (task: Task) => {
    if (!task.subtasks || task.subtasks.length === 0) return null
    
    const completed = task.subtasks.filter(s => s.isCompleted).length
    const total = task.subtasks.length
    const percentage = Math.round((completed / total) * 100)
    
    return {
      completed,
      total,
      percentage,
      text: `${completed}/${total} subtasks`
    }
  }

  const toggleTaskExpansion = (taskId: string) => {
    setExpandedTasks(prev => {
      const newSet = new Set(prev)
      if (newSet.has(taskId)) {
        newSet.delete(taskId)
      } else {
        newSet.add(taskId)
      }
      return newSet
    })
  }

  const handleDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result

    if (!destination) return
    if (destination.droppableId === source.droppableId && destination.index === source.index) return

    const task = tasks.find(t => t.id === draggableId)
    if (!task) return

    // Find the target consolidated phase
    const targetPhase = consolidatedPhases.find(p => p.id === destination.droppableId)
    if (!targetPhase) return

    // For now, we'll use the first workflow's phase in the consolidated phase
    // In a real implementation, you'd want to let the user choose which specific workflow phase
    const targetWorkflowPhase = targetPhase.workflows[0]
    if (!targetWorkflowPhase) return

    try {
      // Move task to new phase
      await tasksApi.moveToPhase(task.id, targetWorkflowPhase.workflowId, task.currentPhaseId || '')
      
      // Refresh tasks
      dispatch(fetchTasks({}))
      toast.success(`Task moved to ${targetPhase.name}`)
    } catch (error) {
      console.error('Error moving task:', error)
      toast.error('Failed to move task')
    }
  }

  const renderCompactTaskCard = (task: Task, index: number) => {
    const priorityConfig = getPriorityConfig(task.priority)
    const subtaskProgress = getSubtaskProgress(task)
    const isExpanded = expandedTasks.has(task.id)
    const PriorityIcon = priorityConfig.icon
    
    return (
      <Draggable key={task.id} draggableId={task.id} index={index}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            className={`bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 mb-2 ${
              snapshot.isDragging ? 'rotate-2 shadow-lg' : ''
            } ${isExpanded ? 'ring-2 ring-blue-500' : ''}`}
            style={provided.draggableProps.style}
          >
            {/* Compact View */}
            <div className="p-3">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                <h4 
                    className="text-sm font-medium text-gray-900 truncate cursor-pointer hover:text-blue-600"
                        onClick={() => onTaskClick(task)}
                      >
                        {task.title}
                      </h4>
                  {task.taskType === 'SUBTASK' && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 mt-1">
                      SUBTASK
                    </span>
                  )}
                    </div>

                <div className="flex items-center space-x-1 ml-2">
                {/* Priority */}
                  <div className={`inline-flex items-center px-2 py-1 rounded ${priorityConfig.bg} ${priorityConfig.text}`}>
                    <PriorityIcon className="h-3 w-3" />
                    </div>

                  {/* Expand/Collapse */}
                  <button
                    onClick={() => toggleTaskExpansion(task.id)}
                    className="p-1 hover:bg-gray-100 rounded"
                  >
                    {isExpanded ? (
                      <ChevronUpIcon className="h-4 w-4 text-gray-500" />
                    ) : (
                      <ChevronDownIcon className="h-4 w-4 text-gray-500" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {/* Workflow Badge */}
                  {task.workflow && (
                    <span 
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white"
                      style={{ backgroundColor: task.workflow.color }}
                    >
                      {task.workflow.name}
                    </span>
                  )}
                  
                  {/* Subtask Progress */}
                  {subtaskProgress && (
                    <div className="flex items-center space-x-1 bg-purple-50 px-2 py-0.5 rounded">
                      <FlagIcon className="h-3 w-3 text-purple-600" />
                      <span className="text-xs font-medium text-purple-700">
                        {subtaskProgress.text}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  {/* Assignee */}
                  {task.assignedTo && (
                    <div className="flex items-center space-x-1">
                      <UserIcon className="h-3 w-3 text-gray-500" />
                      <span className="text-xs text-gray-600 truncate max-w-20">
                        {task.assignedTo.name}
                      </span>
                    </div>
                  )}

                  {/* Due Date */}
                  {task.dueDate && (
                    <div className="flex items-center space-x-1">
                      <CalendarIcon className="h-3 w-3 text-gray-500" />
                      <span className="text-xs text-gray-600">
                        {new Date(task.dueDate).toLocaleDateString()}
                      </span>
                  </div>
                )}
                </div>
              </div>
            </div>

            {/* Expanded View */}
            {isExpanded && (
              <div className="border-t border-gray-100 p-3 bg-gray-50">
                <p className="text-sm text-gray-700 mb-3">{task.description}</p>
                
                {task.goals && (
                  <div className="mb-3">
                    <h5 className="text-xs font-medium text-gray-900 mb-1">Goals:</h5>
                    <p className="text-xs text-gray-600">{task.goals}</p>
            </div>
                        )}

                {subtaskProgress && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-700">Progress</span>
                      <span className="text-xs text-gray-600">{subtaskProgress.percentage}%</span>
                      </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${subtaskProgress.percentage}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3 text-xs text-gray-500">
                    <span>Created: {new Date(task.createdAt).toLocaleDateString()}</span>
                    {(task as any).actualHours && (
                      <span className="flex items-center space-x-1">
                        <ClockIcon className="h-3 w-3" />
                        <span>{(task as any).actualHours}h logged</span>
                      </span>
                    )}
                  </div>
                  
                  <button
                    onClick={() => onTaskClick(task)}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    View Details
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Draggable>
    )
  }

  const renderPhaseColumn = (phase: ConsolidatedPhase) => (
    <div key={phase.id} className="flex-1 min-w-80 max-w-sm">
      <div className="bg-white rounded-lg border border-gray-200 h-full">
        {/* Column Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-900">{phase.name}</h3>
            <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full text-sm font-medium">
              {phase.tasks.length}
            </span>
          </div>
          
          {/* Workflow indicators */}
          {phase.workflows.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {phase.workflows.slice(0, 3).map((workflow, index) => (
                <span
                  key={`${workflow.workflowId}-${index}`}
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs text-white"
                  style={{ backgroundColor: workflow.color }}
                  title={`${workflow.workflowName}: ${workflow.originalPhaseName}`}
                >
                  {workflow.workflowName}
                </span>
              ))}
              {phase.workflows.length > 3 && (
                <span className="text-xs text-gray-500">
                  +{phase.workflows.length - 3} more
                    </span>
              )}
                  </div>
          )}
                </div>

        {/* Tasks List */}
        <Droppable droppableId={phase.id} type="task">
          {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
              className={`p-3 min-h-96 max-h-screen overflow-y-auto ${
                        snapshot.isDraggingOver ? 'bg-blue-50' : ''
                      }`}
            >
              {phase.tasks.map((task, index) => renderCompactTaskCard(task, index))}
              {provided.placeholder}
              
              {phase.tasks.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <FlagIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No tasks in {phase.name}</p>
                          </div>
                        )}
                    </div>
                  )}
                </Droppable>
              </div>
    </div>
  )

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            )
  }

  return (
    <div className="h-full">
      {/* Controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setExpandedTasks(new Set())}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Collapse All
          </button>
          <span className="text-gray-300">|</span>
          <button
            onClick={() => setExpandedTasks(new Set(tasks.map(t => t.id)))}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Expand All
          </button>
        </div>
        
        <div className="text-sm text-gray-500">
          {tasks.length} tasks across {consolidatedPhases.length} phases
        </div>
      </div>

      {/* Board */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex space-x-4 overflow-x-auto pb-4">
          {consolidatedPhases.map(phase => renderPhaseColumn(phase))}
                </div>
    </DragDropContext>
    </div>
  )
}

export default TaskBoard