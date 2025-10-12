import React from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  UserCircleIcon, 
  ClockIcon, 
  CalendarIcon,
  FlagIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  BoltIcon,
  FireIcon,
  ChevronUpIcon,
  ChatBubbleLeftIcon,
  PaperClipIcon
} from '@heroicons/react/24/outline'
import { Task } from '@/types/task'

interface TaskListItemProps {
  task: Task
}

const TaskListItem: React.FC<TaskListItemProps> = ({ task }) => {
  const navigate = useNavigate()

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
          icon: ChevronUpIcon,
          label: 'Normal'
        }
    }
  }

  const priorityConfig = getPriorityConfig(task.priority)
  const PriorityIcon = priorityConfig.icon
  
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && !task.completedAt
  const subtaskProgress = task.subtasks ? 
    `${task.subtasks.filter(s => s.isCompleted).length}/${task.subtasks.length}` : null

  const getTaskTypeBadge = () => {
    if (task.taskType === 'COORDINATION') {
      return {
        label: 'Coordination',
        bg: 'bg-indigo-100',
        text: 'text-indigo-700'
      }
    }
    if (task.taskType === 'SUBTASK') {
      return {
        label: 'Subtask',
        bg: 'bg-purple-100',
        text: 'text-purple-700'
      }
    }
    return null
  }

  const taskTypeBadge = getTaskTypeBadge()

  return (
    <div
      onClick={() => navigate(`/tasks/${task.id}`)}
      className="group bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-lg transition-all duration-200 cursor-pointer overflow-hidden"
    >
      {/* Priority Bar */}
      <div 
        className="h-1 w-full"
        style={{ backgroundColor: priorityConfig.color }}
      />

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-lg font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                {task.title}
              </h3>
              {taskTypeBadge && (
                <span className={`px-2 py-0.5 text-xs font-medium rounded ${taskTypeBadge.bg} ${taskTypeBadge.text}`}>
                  {taskTypeBadge.label}
                </span>
              )}
            </div>
            
            {/* Description Preview */}
            <p className="text-sm text-gray-600 line-clamp-2 mb-3">
              {task.description}
            </p>

            {/* Meta Info */}
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
              {task.assignedTo && (
                <div className="flex items-center gap-1.5">
                  <UserCircleIcon className="h-4 w-4" />
                  <span className="font-medium text-gray-700">{task.assignedTo.name}</span>
                  {task.assignedTo.position && (
                    <span className="text-xs">• {task.assignedTo.position}</span>
                  )}
                </div>
              )}
              
              {task.createdBy && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs">Created by {task.createdBy.name}</span>
                </div>
              )}

              {task.dueDate && (
                <div className={`flex items-center gap-1.5 ${isOverdue ? 'text-red-600 font-medium' : ''}`}>
                  <CalendarIcon className="h-4 w-4" />
                  <span>{new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tags & Badges */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {/* Priority Badge */}
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${priorityConfig.bg} ${priorityConfig.text}`}>
            <PriorityIcon className="h-3.5 w-3.5" />
            <span className="text-xs font-semibold">{priorityConfig.label}</span>
          </div>

          {/* Workflow Phase Tag */}
          {task.currentPhase && (
            <div 
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium"
              style={{ 
                backgroundColor: `${task.currentPhase.color}20`,
                color: task.currentPhase.color,
                border: `1px solid ${task.currentPhase.color}40`
              }}
            >
              <span 
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: task.currentPhase.color }}
              />
              {task.workflow?.name && (
                <span className="opacity-75">{task.workflow.name} •</span>
              )}
              {task.currentPhase.name}
            </div>
          )}

          {/* Subtask Progress */}
          {subtaskProgress && (
            <div className="inline-flex items-center gap-1.5 bg-purple-100 text-purple-700 px-2.5 py-1 rounded-lg">
              <FlagIcon className="h-3.5 w-3.5" />
              <span className="text-xs font-semibold">{subtaskProgress} subtasks</span>
            </div>
          )}

          {/* Overdue Warning */}
          {isOverdue && (
            <div className="inline-flex items-center gap-1.5 bg-red-100 text-red-700 px-2.5 py-1 rounded-lg">
              <ExclamationTriangleIcon className="h-3.5 w-3.5" />
              <span className="text-xs font-semibold">Overdue</span>
            </div>
          )}

          {/* Completed Badge */}
          {task.completedAt && (
            <div className="inline-flex items-center gap-1.5 bg-green-100 text-green-700 px-2.5 py-1 rounded-lg">
              <CheckCircleIcon className="h-3.5 w-3.5" />
              <span className="text-xs font-semibold">Completed</span>
            </div>
          )}
        </div>

        {/* Footer - Activity Indicators */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
          <div className="flex items-center gap-4 text-sm text-gray-500">
            {task.comments && task.comments.length > 0 && (
              <div className="flex items-center gap-1.5">
                <ChatBubbleLeftIcon className="h-4 w-4" />
                <span>{task.comments.length}</span>
              </div>
            )}

            {task.files && task.files.length > 0 && (
              <div className="flex items-center gap-1.5">
                <PaperClipIcon className="h-4 w-4" />
                <span>{task.files.length}</span>
              </div>
            )}

            {task.timeTracked && task.timeTracked > 0 && (
              <div className="flex items-center gap-1.5">
                <ClockIcon className="h-4 w-4" />
                <span>{Math.floor(task.timeTracked / 60)}h {task.timeTracked % 60}m</span>
              </div>
            )}
          </div>

          <div className="text-xs text-gray-400">
            {new Date(task.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
      </div>
    </div>
  )
}

export default TaskListItem

