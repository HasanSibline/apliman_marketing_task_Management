import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  ClockIcon,
  UserCircleIcon,
  PlusIcon,
  ArrowLeftIcon,
  ChartBarIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleIconSolid } from '@heroicons/react/24/solid'
import type { Task, Subtask } from '@/types/task'
import { tasksApi } from '@/services/api'
import toast from 'react-hot-toast'
import SubtaskDetailModal from './SubtaskDetailModal'

interface SubtaskSidebarProps {
  task: Task
  onAddSubtask?: () => void
  onSubtaskUpdate?: () => void
}

const SubtaskSidebar: React.FC<SubtaskSidebarProps> = ({ task, onAddSubtask, onSubtaskUpdate }) => {
  const navigate = useNavigate()
  const [selectedSubtask, setSelectedSubtask] = useState<Subtask | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)

  const subtasks = task.subtasks || []
  const completedCount = subtasks.filter(s => s.isCompleted).length
  const totalCount = subtasks.length
  const progressPercentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0

  // If this is a subtask, show parent task info
  const isSubtask = task.taskType === 'SUBTASK' && task.parentTask

  const handleToggleSubtask = async (subtask: Subtask, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent navigation when clicking checkbox
    try {
      await tasksApi.toggleSubtaskComplete(task.id, subtask.id)
      toast.success(subtask.isCompleted ? 'Subtask marked incomplete' : 'Subtask completed!')
      if (onSubtaskUpdate) {
        onSubtaskUpdate()
      }
    } catch (error) {
      toast.error('Failed to update subtask')
    }
  }

  const handleShowDetails = (subtask: Subtask, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent navigation
    setSelectedSubtask(subtask)
    setShowDetailModal(true)
  }

  return (
    <div className="bg-white border-l border-gray-200 h-full overflow-y-auto">
      <div className="sticky top-0 bg-white border-b border-gray-200 p-4 z-10">
        {isSubtask && task.parentTask ? (
          <>
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
              <ArrowLeftIcon className="h-4 w-4" />
              <span>Parent Task</span>
            </div>
            <button
              onClick={() => navigate(`/tasks/${task.parentTask!.id}`)}
              className="w-full text-left p-3 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors group"
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2">
                  {task.parentTask.title}
                </h3>
              </div>
              {task.parentTask.workflow && task.parentTask.currentPhase && (
                <div 
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium"
                  style={{ 
                    backgroundColor: `${task.parentTask.currentPhase.color}20`,
                    color: task.parentTask.currentPhase.color
                  }}
                >
                  <span 
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: task.parentTask.currentPhase.color }}
                  />
                  {task.parentTask.workflow.name}
                </div>
              )}
            </button>

            {/* Show sibling subtasks */}
            {task.parentTask.subtasks && task.parentTask.subtasks.length > 1 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Other Subtasks</h3>
                <div className="space-y-2">
                  {task.parentTask.subtasks
                    .filter(s => s.id !== task.subtaskId)
                    .map(subtask => (
                      <button
                        key={subtask.id}
                        onClick={() => {
                          if (subtask.linkedTask) {
                            navigate(`/tasks/${subtask.linkedTask.id}`)
                          }
                        }}
                        className="w-full text-left p-2.5 rounded-lg hover:bg-gray-50 border border-gray-200 transition-all group"
                      >
                        <div className="flex items-start gap-2">
                          {subtask.isCompleted ? (
                            <CheckCircleIconSolid className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                          ) : (
                            <ClockIcon className="h-5 w-5 text-gray-400 flex-shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2">
                              {subtask.title}
                            </p>
                            {subtask.assignedTo && (
                              <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                                <UserCircleIcon className="h-3.5 w-3.5" />
                                <span>{subtask.assignedTo.name}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Subtasks ({totalCount})
              </h3>
              {onAddSubtask && (
                <button
                  onClick={onAddSubtask}
                  className="p-2 rounded-lg hover:bg-blue-50 text-blue-600 transition-colors"
                  title="Add Subtask"
                >
                  <PlusIcon className="h-5 w-5" />
                </button>
              )}
            </div>

            {/* Progress Bar */}
            {totalCount > 0 && (
              <div className="mb-4">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-gray-600 font-medium">Progress</span>
                  <span className="text-gray-900 font-semibold">
                    {completedCount}/{totalCount} completed
                  </span>
                </div>
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500 rounded-full"
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>
                <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-500">
                  <ChartBarIcon className="h-3.5 w-3.5" />
                  <span>{Math.round(progressPercentage)}% complete</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Subtask List */}
      {!isSubtask && (
        <div className="p-4">
          {subtasks.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <div className="text-4xl mb-2">📋</div>
              <p className="text-sm">No subtasks yet</p>
              {onAddSubtask && (
                <button
                  onClick={onAddSubtask}
                  className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  Add your first subtask
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {subtasks.map((subtask) => (
                <div
                  key={subtask.id}
                  className="relative p-3 rounded-lg hover:bg-gray-50 border border-gray-200 transition-all group"
                >
                  <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    <button
                      onClick={(e) => handleToggleSubtask(subtask, e)}
                      className="flex-shrink-0 mt-0.5"
                    >
                      {subtask.isCompleted ? (
                        <CheckCircleIconSolid className="h-5 w-5 text-green-500 hover:text-green-600 transition-colors" />
                      ) : (
                        <div className="h-5 w-5 rounded-full border-2 border-gray-300 hover:border-blue-500 transition-colors" />
                      )}
                    </button>
                    
                    {/* Content - Clickable */}
                    <button
                      onClick={() => {
                        if (subtask.linkedTask) {
                          navigate(`/tasks/${subtask.linkedTask.id}`)
                        }
                      }}
                      className="flex-1 min-w-0 text-left"
                    >
                      <p className={`text-sm font-medium mb-1 line-clamp-2 ${
                        subtask.isCompleted 
                          ? 'text-gray-500 line-through' 
                          : 'text-gray-900 group-hover:text-blue-600 transition-colors'
                      }`}>
                        {subtask.title}
                      </p>
                      
                      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                        {subtask.assignedTo && (
                          <div className="flex items-center gap-1">
                            <UserCircleIcon className="h-3.5 w-3.5" />
                            <span>{subtask.assignedTo.name}</span>
                          </div>
                        )}
                        
                        {subtask.phase && (
                          <div 
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded"
                            style={{ 
                              backgroundColor: `${subtask.phase.color}20`,
                              color: subtask.phase.color
                            }}
                          >
                            <span className="w-1 h-1 rounded-full" style={{ backgroundColor: subtask.phase.color }} />
                            {subtask.phase.name}
                          </div>
                        )}

                        {subtask.estimatedHours && (
                          <div className="flex items-center gap-1">
                            <ClockIcon className="h-3.5 w-3.5" />
                            <span>{subtask.estimatedHours}h</span>
                          </div>
                        )}
                      </div>
                    </button>

                    {/* Info Button */}
                    {subtask.description && (
                      <button
                        onClick={(e) => handleShowDetails(subtask, e)}
                        className="flex-shrink-0 p-1 rounded hover:bg-blue-50 text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="View details"
                      >
                        <InformationCircleIcon className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Subtask Detail Modal */}
      {selectedSubtask && (
        <SubtaskDetailModal
          subtask={selectedSubtask}
          task={task}
          isOpen={showDetailModal}
          onClose={() => {
            setShowDetailModal(false)
            setSelectedSubtask(null)
          }}
          onUpdate={() => {
            if (onSubtaskUpdate) {
              onSubtaskUpdate()
            }
          }}
        />
      )}
    </div>
  )
}

export default SubtaskSidebar

