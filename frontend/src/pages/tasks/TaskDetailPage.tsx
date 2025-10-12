import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { 
  ArrowLeftIcon,
  PaperClipIcon, 
  ChatBubbleLeftIcon,
  CalendarIcon,
  UserIcon,
  ClockIcon,
  FlagIcon,
  PlayIcon,
  PauseIcon,
  CheckCircleIcon,
  PencilIcon,
  TrashIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  BoltIcon,
  FireIcon,
  ChevronUpIcon,
  ArrowRightIcon,
  XMarkIcon
} from '@heroicons/react/24/outline'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { fetchTaskById } from '@/store/slices/tasksSlice'
import { startTimer, pauseTimer, stopTimer } from '@/store/slices/timeTrackingSlice'
import { tasksApi } from '@/services/api'
import FileUpload from '@/components/tasks/FileUpload'
import TaskComments from '@/components/tasks/TaskComments'
import SubtaskSidebar from '@/components/tasks/SubtaskSidebar'
import EditTaskModal from '@/components/tasks/EditTaskModal'
import toast from 'react-hot-toast'

const TaskDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { currentTask, isLoading } = useAppSelector((state) => state.tasks)
  const { user } = useAppSelector((state) => state.auth)
  const timeTracking = useAppSelector((state) => state.timeTracking)
  const [currentTime, setCurrentTime] = useState(0)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  
  const isThisTaskTracking = timeTracking.activeTaskId === id
  const isTimerRunning = isThisTaskTracking && timeTracking.isRunning

  useEffect(() => {
    if (id) {
      dispatch(fetchTaskById(id))
    }
  }, [dispatch, id])

  // Update current time from Redux state
  useEffect(() => {
    if (isThisTaskTracking) {
      let baseTime = timeTracking.elapsedTime
      if (timeTracking.isRunning && timeTracking.startTime) {
        const elapsed = Math.floor((Date.now() - timeTracking.startTime) / 1000)
        setCurrentTime(baseTime + elapsed)
      } else {
        setCurrentTime(baseTime)
      }
    } else {
      setCurrentTime(0)
    }
  }, [isThisTaskTracking, timeTracking.elapsedTime, timeTracking.isRunning, timeTracking.startTime])

  // Real-time timer tick
  useEffect(() => {
    let interval: NodeJS.Timeout
    if (isTimerRunning) {
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - timeTracking.startTime!) / 1000)
        setCurrentTime(timeTracking.elapsedTime + elapsed)
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [isTimerRunning, timeTracking.elapsedTime, timeTracking.startTime])

  const handleStartTimer = () => {
    if (id) {
      dispatch(startTimer(id))
    }
  }

  const handlePauseTimer = () => {
    dispatch(pauseTimer())
  }

  const handleStopTimer = () => {
    if (window.confirm('Stop tracking and reset time?')) {
      dispatch(stopTimer())
    }
  }

  const getPriorityConfig = (priority: number) => {
    switch (priority) {
      case 1: 
        return { 
          color: '#6B7280',
          bg: 'bg-gray-100',
          text: 'text-gray-700',
          icon: ArrowDownIcon,
          label: 'Low Priority'
        }
      case 2: 
        return { 
          color: '#3B82F6',
          bg: 'bg-blue-100',
          text: 'text-blue-700',
          icon: ChevronUpIcon,
          label: 'Medium Priority'
        }
      case 3: 
        return { 
          color: '#F59E0B',
          bg: 'bg-amber-100',
          text: 'text-amber-700',
          icon: ArrowUpIcon,
          label: 'High Priority'
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

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const handleDeleteTask = async () => {
    if (!currentTask) return
    
    if (window.confirm('Are you sure you want to delete this task? This action cannot be undone.')) {
      try {
        await tasksApi.delete(currentTask.id)
        toast.success('Task deleted successfully')
        navigate('/tasks')
      } catch (error: any) {
        toast.error(error.response?.data?.message || 'Failed to delete task')
      }
    }
  }

  const handlePhaseChange = async (toPhaseId: string) => {
    if (!currentTask) return
    
    try {
      await tasksApi.moveToPhase(currentTask.id, toPhaseId)
      toast.success('Task phase updated successfully')
      dispatch(fetchTaskById(currentTask.id))
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update task phase')
    }
  }

  const handleRefreshTask = () => {
    if (id) {
      dispatch(fetchTaskById(id))
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
        <p className="text-gray-600">Loading task details...</p>
      </div>
    )
  }

  if (!currentTask) {
    return (
      <div className="text-center py-16">
        <div className="text-6xl mb-4">❌</div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">Task not found</h3>
        <p className="text-gray-500 mb-6">The task you're looking for doesn't exist or has been deleted.</p>
        <button
          onClick={() => navigate('/tasks')}
          className="btn-primary"
        >
          <ArrowLeftIcon className="h-4 w-4 mr-2" />
          Back to Tasks
        </button>
      </div>
    )
  }

  const priorityConfig = getPriorityConfig(currentTask.priority)
  const PriorityIcon = priorityConfig.icon
  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN'
  const canEdit = isAdmin || currentTask.assignedToId === user?.id || currentTask.createdById === user?.id

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-6">
      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl space-y-6">
          {/* Back Button */}
          <button
            onClick={() => navigate('/tasks')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            <span className="font-medium">Back to Tasks</span>
          </button>

          {/* Header Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="bg-white rounded-xl border border-gray-200 shadow-sm p-6"
          >
            {/* Title & Actions */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h1 className="text-3xl font-bold text-gray-900 mb-3">
                  {currentTask.title}
                </h1>
                
                {/* Meta Info */}
                <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-4">
                  <div className="flex items-center gap-1.5">
                    <UserIcon className="h-4 w-4" />
                    <span>Created by <strong>{currentTask.createdBy?.name || 'Unknown'}</strong></span>
                  </div>
                  {currentTask.assignedTo && (
                    <div className="flex items-center gap-1.5">
                      <UserIcon className="h-4 w-4" />
                      <span>Assigned to <strong>{currentTask.assignedTo.name}</strong></span>
                      {currentTask.assignedTo.position && (
                        <span className="text-xs text-gray-500">• {currentTask.assignedTo.position}</span>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <CalendarIcon className="h-4 w-4" />
                    <span>Created {new Date(currentTask.createdAt).toLocaleDateString('en-US', { 
                      month: 'long', 
                      day: 'numeric', 
                      year: 'numeric' 
                    })}</span>
                  </div>
                </div>

                {/* Tags & Badges */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Priority Badge */}
                  <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${priorityConfig.bg} ${priorityConfig.text}`}>
                    <PriorityIcon className="h-4 w-4" />
                    <span className="text-sm font-semibold">{priorityConfig.label}</span>
                  </div>

                  {/* Workflow Phase Tag */}
                  {currentTask.currentPhase && (
                    <div 
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
                      style={{ 
                        backgroundColor: `${currentTask.currentPhase.color}20`,
                        color: currentTask.currentPhase.color,
                        border: `1px solid ${currentTask.currentPhase.color}40`
                      }}
                    >
                      <span 
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: currentTask.currentPhase.color }}
                      />
                      {currentTask.workflow?.name && (
                        <span className="opacity-75">{currentTask.workflow.name} •</span>
                      )}
                      {currentTask.currentPhase.name}
                    </div>
                  )}

                  {/* Task Type Badge */}
                  {currentTask.taskType && currentTask.taskType !== 'GENERAL' && (
                    <span className={`px-3 py-1.5 text-sm font-medium rounded-lg ${
                      currentTask.taskType === 'COORDINATION' 
                        ? 'bg-indigo-100 text-indigo-700' 
                        : currentTask.taskType === 'SUBTASK'
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {currentTask.taskType}
                    </span>
                  )}

                  {/* Due Date */}
                  {currentTask.dueDate && (
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${
                      new Date(currentTask.dueDate) < new Date() && !currentTask.completedAt
                        ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      <CalendarIcon className="h-4 w-4" />
                      <span className="text-sm font-medium">
                        Due {new Date(currentTask.dueDate).toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric' 
                        })}
                      </span>
                    </div>
                  )}

                  {/* Completed Badge */}
                  {currentTask.completedAt && (
                    <div className="inline-flex items-center gap-1.5 bg-green-100 text-green-700 px-3 py-1.5 rounded-lg">
                      <CheckCircleIcon className="h-4 w-4" />
                      <span className="text-sm font-semibold">Completed</span>
                    </div>
                  )}

                  {/* Deadline Badge */}
                  {currentTask.dueDate && !currentTask.completedAt && (
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${
                      new Date(currentTask.dueDate) < new Date()
                        ? 'bg-red-100 text-red-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      <CalendarIcon className="w-4 h-4" />
                      Due {new Date(currentTask.dueDate).toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric',
                        year: new Date(currentTask.dueDate).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
                      })}
                    </div>
                  )}

                  {/* Compact Time Tracking */}
                  <div className="flex items-center gap-2">
                    {isTimerRunning ? (
                      <>
                        <button
                          onClick={handlePauseTimer}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 transition-colors"
                        >
                          <PauseIcon className="w-4 h-4" />
                          {formatTime(currentTime)}
                        </button>
                        <button
                          onClick={handleStopTimer}
                          className="p-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition-colors"
                          title="Stop and reset"
                        >
                          <XMarkIcon className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={handleStartTimer}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm font-medium hover:bg-green-200 transition-colors"
                      >
                        <PlayIcon className="w-4 h-4" />
                        {currentTime > 0 ? formatTime(currentTime) : 'Start Timer'}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              {canEdit && (
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => setIsEditModalOpen(true)}
                    className="p-2 rounded-lg hover:bg-blue-50 text-blue-600 transition-colors"
                    title="Edit Task"
                  >
                    <PencilIcon className="h-5 w-5" />
                  </button>
                  {isAdmin && (
                    <button
                      onClick={handleDeleteTask}
                      className="p-2 rounded-lg hover:bg-red-50 text-red-600 transition-colors"
                      title="Delete Task"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Description */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <FlagIcon className="h-5 w-5 text-blue-600" />
                Description
              </h2>
              <div className="prose max-w-none text-gray-700">
                <p className="whitespace-pre-wrap">{currentTask.description}</p>
              </div>
            </div>

            {/* Goals */}
            {currentTask.goals && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <CheckCircleIcon className="h-5 w-5 text-green-600" />
                  Goals & Objectives
                </h2>
                <div className="prose max-w-none text-gray-700">
                  <p className="whitespace-pre-wrap">{currentTask.goals}</p>
                </div>
              </div>
            )}

            {/* Phase Transitions */}
            {currentTask.workflow && currentTask.currentPhase && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <ArrowRightIcon className="h-5 w-5 text-blue-600" />
                  Change Phase
                </h2>
                <div className="flex flex-wrap gap-3">
                  {currentTask.workflow.phases
                    ?.filter((phase: any) => phase.id !== currentTask.currentPhaseId)
                    .map((phase: any) => (
                      <button
                        key={phase.id}
                        onClick={() => handlePhaseChange(phase.id)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg border-2 hover:shadow-md transition-all"
                        style={{
                          borderColor: phase.color,
                          backgroundColor: `${phase.color}10`,
                          color: phase.color
                        }}
                      >
                        <ArrowRightIcon className="h-4 w-4" />
                        <span className="font-medium">Move to {phase.name}</span>
                      </button>
                    ))}
                </div>
                {currentTask.workflow.phases && currentTask.workflow.phases.length === 1 && (
                  <p className="text-sm text-gray-500 mt-2">No other phases available in this workflow</p>
                )}
              </div>
            )}
          </motion.div>

          {/* Time Tracking */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="bg-white rounded-xl border border-gray-200 shadow-sm p-6"
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <ClockIcon className="h-5 w-5 text-blue-600" />
              Time Tracking
            </h2>
            <div className="flex items-center gap-6">
              <div className="flex-1">
                <div className="text-4xl font-mono font-bold text-gray-900 mb-2">
                  {formatTime(currentTime)}
                </div>
                <div className="text-sm text-gray-500">
                  Current session time
                </div>
              </div>
              <button
                onClick={() => isTimerRunning ? handlePauseTimer() : handleStartTimer()}
                className={`px-6 py-3 rounded-lg font-semibold flex items-center gap-2 transition-colors ${
                  isTimerRunning
                    ? 'bg-red-100 text-red-700 hover:bg-red-200'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {isTimerRunning ? (
                  <>
                    <PauseIcon className="h-5 w-5" />
                    Pause Timer
                  </>
                ) : (
                  <>
                    <PlayIcon className="h-5 w-5" />
                    Start Timer
                  </>
                )}
              </button>
            </div>
          </motion.div>

          {/* Files */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="bg-white rounded-xl border border-gray-200 shadow-sm p-6"
          >
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <PaperClipIcon className="h-5 w-5 text-blue-600" />
              Files ({(currentTask as any).files?.length || 0})
            </h2>
            
            <FileUpload 
              taskId={currentTask.id}
              files={(currentTask as any).files || []}
              onFilesUpdated={() => dispatch(fetchTaskById(currentTask.id))}
            />
          </motion.div>

          {/* Comments */}
          <motion.div
            id="comments-section"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="bg-white rounded-xl border border-gray-200 shadow-sm p-6"
          >
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <ChatBubbleLeftIcon className="h-5 w-5 text-blue-600" />
              Comments ({(currentTask as any).comments?.length || 0})
            </h2>
            
            <TaskComments 
              taskId={currentTask.id}
              comments={(currentTask as any).comments || []}
              subtasks={currentTask.subtasks || []}
              onCommentsUpdated={() => dispatch(fetchTaskById(currentTask.id))}
            />
          </motion.div>
        </div>
      </div>

      {/* Right Sidebar */}
      <div className="w-96 flex-shrink-0">
        <SubtaskSidebar 
          task={currentTask}
          onAddSubtask={() => toast('Add subtask functionality coming soon', { icon: 'ℹ️' })}
          onSubtaskUpdate={handleRefreshTask}
        />
      </div>

      {/* Edit Task Modal */}
      <EditTaskModal
        task={currentTask}
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onTaskUpdated={handleRefreshTask}
      />
    </div>
  )
}

export default TaskDetailPage
