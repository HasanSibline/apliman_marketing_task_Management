import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeftIcon,
  PaperClipIcon,
  ChatBubbleLeftIcon,
  CalendarIcon,
  UserIcon,
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
  ChevronDownIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  CogIcon,
  PlusIcon,
  InformationCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { fetchTaskById } from '@/store/slices/tasksSlice'
import { startTimer, pauseTimer, stopTimer } from '@/store/slices/timeTrackingSlice'
import { tasksApi } from '@/services/api'
import FileUpload from '@/components/tasks/FileUpload'
import TaskComments from '@/components/tasks/TaskComments'
import SubtaskSidebar from '@/components/tasks/SubtaskSidebar'
import EditTaskModal from '@/components/tasks/EditTaskModal'
import AddSubtaskModal from '@/components/tasks/AddSubtaskModal'
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
  const [isAddSubtaskModalOpen, setIsAddSubtaskModalOpen] = useState(false)
  const [isAddDependencyModalOpen, setIsAddDependencyModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])

  const isThisTaskTracking = timeTracking.activeTaskId === id
  const isTimerRunning = isThisTaskTracking && timeTracking.isRunning

  useEffect(() => {
    if (id) {
      dispatch(fetchTaskById(id))
    }
  }, [dispatch, id])

  // Update time display in real-time
  useEffect(() => {
    const updateTime = () => {
      if (!id) {
        setCurrentTime(0)
        return
      }
      let baseTime = (timeTracking.taskTimes && id ? timeTracking.taskTimes[id] : 0) || 0
      if (isThisTaskTracking && timeTracking.isRunning && timeTracking.startTime) {
        const elapsed = Math.floor((Date.now() - timeTracking.startTime) / 1000)
        setCurrentTime(baseTime + elapsed)
      } else {
        setCurrentTime(baseTime)
      }
    }

    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [id, isThisTaskTracking, timeTracking.taskTimes, timeTracking.isRunning, timeTracking.startTime])

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

  const handlePhaseChange = async (newPhaseId: string) => {
    if (!id) return

    try {
      await tasksApi.moveToPhase(id, newPhaseId, 'Phase changed by user')
      
      // Timer automation
      const targetPhase = currentTask?.workflow?.phases.find(p => p.id === newPhaseId);
      if (targetPhase) {
        const name = targetPhase.name.toLowerCase();
        // Broader matching for "In Progress"
        const isInProgress = name.includes('progress') || 
                            name.includes('working') || 
                            name.includes('active') || 
                            name.includes('doing') ||
                            name.includes('started') ||
                            name.includes('production');
                            
        // Broader matching for "Completed"
        const isCompleted = name.includes('completed') || 
                           name.includes('done') || 
                           name.includes('finished') ||
                           name.includes('shipped') ||
                           name.includes('archived');

        if (isInProgress) {
          if (!isTimerRunning) {
            dispatch(startTimer(id));
            toast('Timer started automatically', { 
              icon: <PlayIcon className="h-5 w-5 text-green-500" /> 
            });
          }
        } else if (isCompleted) {
          if (isThisTaskTracking) {
            dispatch(stopTimer());
            toast('Timer stopped automatically', { 
              icon: <CheckCircleIcon className="h-5 w-5 text-blue-500" /> 
            });
          }
        }
      }

      dispatch(fetchTaskById(id))
      toast.success('Phase updated successfully!')
    } catch (error: any) {
      console.error('Failed to change phase:', error)
      if (error.response?.data?.pendingApproval) {
        toast('Approval request sent to admin', { 
          icon: <InformationCircleIcon className="h-5 w-5 text-blue-500" /> 
        })
      } else {
        toast.error(error.response?.data?.message || 'Failed to change phase')
      }
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

  const handleRefreshTask = () => {
    if (id) {
      dispatch(fetchTaskById(id))
    }
  }

  const handleAddDependency = async (blockerId: string) => {
    if (!id) return
    try {
      await tasksApi.addDependency(id, blockerId)
      toast.success('Dependency added')
      handleRefreshTask()
      setIsAddDependencyModalOpen(false)
      setSearchQuery('')
      setSearchResults([])
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to add dependency')
    }
  }

  const handleRemoveDependency = async (blockerId: string) => {
    if (!id) return
    if (!window.confirm('Remove this dependency?')) return
    try {
      await tasksApi.removeDependency(id, blockerId)
      toast.success('Dependency removed')
      handleRefreshTask()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to remove dependency')
    }
  }

  useEffect(() => {
    const searchTasks = async () => {
      if (searchQuery.length < 2) {
        setSearchResults([])
        return
      }
      try {
        const results = await tasksApi.getAll({ search: searchQuery, limit: 10 })
        setSearchResults((results as any).tasks || [])
      } catch (error) {
        console.error('Search failed:', error)
      }
    }

    const timer = setTimeout(searchTasks, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const handleAddSubtask = async (subtaskData: any) => {
    if (!id) return

    try {
      await tasksApi.addSubtask(id, subtaskData)
      toast.success('Subtask added successfully!')
      handleRefreshTask()
      setIsAddSubtaskModalOpen(false)
    } catch (error: any) {
      console.error('Failed to add subtask:', error)
      toast.error(error.response?.data?.message || 'Failed to add subtask')
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
        <div className="flex justify-center mb-4">
          <XCircleIcon className="h-16 w-16 text-red-500" />
        </div>
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
                <h1 className="text-3xl font-bold text-gray-900 mb-3 flex items-center gap-3">
                  {currentTask.taskNumber && (
                    <span className="text-primary-600 font-mono text-2xl">{currentTask.taskNumber}</span>
                  )}
                  {currentTask.title}
                </h1>

                {/* Meta Info - Simplified */}
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-600 mb-6 py-3 border-y border-gray-50 bg-gray-50/30 px-4 rounded-xl">
                  <div className="flex items-center gap-2 group">
                    <UserIcon className="h-4 w-4 text-gray-400 group-hover:text-blue-500 transition-colors" />
                    <span>Assignee: <strong className="text-gray-900">{currentTask.assignedTo?.name || 'Unassigned'}</strong></span>
                  </div>
                  
                  {currentTask.dueDate && (
                    <div className="flex items-center gap-2 group">
                      <CalendarIcon className="h-4 w-4 text-gray-400 group-hover:text-amber-500 transition-colors" />
                      <span>Due: <strong className="text-gray-900">{new Date(currentTask.dueDate).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}</strong></span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 group">
                    <UserIcon className="h-4 w-4 text-gray-400 group-hover:text-blue-500 transition-colors" />
                    <span>Owner: <strong className="text-gray-700 font-medium">{currentTask.createdBy?.name || 'Unknown'}</strong></span>
                  </div>
                </div>

                {/* Tags & Badges */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Priority Badge */}
                  <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${priorityConfig.bg} ${priorityConfig.text}`}>
                    <PriorityIcon className="h-4 w-4" />
                    <span className="text-sm font-semibold">{priorityConfig.label}</span>
                  </div>

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

                  {/* Phase Dropdown */}
                  {currentTask.workflow?.phases && currentTask.workflow.phases.length > 0 && (
                    <div className="relative">
                      <select
                        value={currentTask.currentPhase?.id || ''}
                        onChange={(e) => {
                          const newPhaseId = e.target.value
                          if (newPhaseId && newPhaseId !== currentTask.currentPhase?.id) {
                            handlePhaseChange(newPhaseId)
                          }
                        }}
                        className="appearance-none px-3 py-1.5 pr-8 rounded-lg text-sm font-medium border-2 cursor-pointer transition-colors"
                        style={{
                          backgroundColor: `${currentTask.currentPhase?.color}20`,
                          color: currentTask.currentPhase?.color,
                          borderColor: `${currentTask.currentPhase?.color}40`
                        }}
                      >
                        {currentTask.workflow.phases.map((phase) => (
                          <option key={phase.id} value={phase.id}>
                            {phase.name}
                          </option>
                        ))}
                      </select>
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                        <ChevronDownIcon className="w-4 h-4" style={{ color: currentTask.currentPhase?.color }} />
                      </div>
                    </div>
                  )}
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

            {/* Dependencies */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <CogIcon className="h-5 w-5 text-purple-600" />
                  Dependencies
                </h2>
                {canEdit && (
                  <button
                    onClick={() => setIsAddDependencyModalOpen(true)}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    + Add Blocker
                  </button>
                )}
              </div>

              <div className="space-y-4">
                {/* Blocked By */}
                <div>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                    Blocked By
                  </h3>
                  {currentTask.blockedBy && currentTask.blockedBy.length > 0 ? (
                    <div className="grid grid-cols-1 gap-2">
                      {currentTask.blockedBy.map((dep) => (
                        <div
                          key={dep.id}
                          className="flex items-center justify-between p-3 bg-red-50 border border-red-100 rounded-lg group"
                        >
                          <div
                            className="flex items-center gap-3 cursor-pointer"
                            onClick={() => navigate(`/tasks/${dep.blocker.id}`)}
                          >
                            <ExclamationTriangleIcon className="h-4 w-4 text-red-500" />
                            <span className="text-sm font-medium text-red-700 hover:underline line-clamp-1">
                              {dep.blocker.title}
                            </span>
                          </div>
                          {canEdit && (
                            <button
                              onClick={() => handleRemoveDependency(dep.blockerId)}
                              className="p-1 text-red-400 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <XMarkIcon className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 italic">No blockers</p>
                  )}
                </div>

                {/* Blocking */}
                <div>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                    Blocking
                  </h3>
                  {currentTask.blocking && currentTask.blocking.length > 0 ? (
                    <div className="grid grid-cols-1 gap-2">
                      {currentTask.blocking.map((dep) => (
                        <div
                          key={dep.id}
                          className="flex items-center justify-between p-3 bg-blue-50 border border-blue-100 rounded-lg group"
                        >
                          <div
                            className="flex items-center gap-3 cursor-pointer"
                            onClick={() => navigate(`/tasks/${dep.dependent.id}`)}
                          >
                            <CheckCircleIcon className="h-4 w-4 text-blue-500" />
                            <span className="text-sm font-medium text-blue-700 hover:underline line-clamp-1">
                              {dep.dependent.title}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 italic">Not blocking any tasks</p>
                  )}
                </div>
              </div>
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
          onAddSubtask={() => setIsAddSubtaskModalOpen(true)}
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

      {/* Add Subtask Modal */}
      <AddSubtaskModal
        isOpen={isAddSubtaskModalOpen}
        onClose={() => setIsAddSubtaskModalOpen(false)}
        onAdd={handleAddSubtask}
        availablePhases={currentTask.workflow?.phases || []}
      />

      {/* Add Dependency Modal */}
      <AnimatePresence>
        {isAddDependencyModalOpen && (
          <div className="fixed inset-0 z-[100] overflow-y-auto">
            <div className="flex min-h-screen items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsAddDependencyModalOpen(false)}
                className="fixed inset-0 bg-black/50 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl p-6"
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold text-gray-900">Add Task Blocker</h3>
                  <button onClick={() => setIsAddDependencyModalOpen(false)}>
                    <XMarkIcon className="w-6 h-6 text-gray-400 hover:text-gray-600" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search tasks to add as blocker..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      autoFocus
                    />
                  </div>

                  <div className="max-h-60 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-100">
                    {searchResults.length > 0 ? (
                      searchResults
                        .filter(t => t.id !== id)
                        .map((task) => (
                          <button
                            key={task.id}
                            onClick={() => handleAddDependency(task.id)}
                            className="w-full flex items-center justify-between p-3 hover:bg-blue-50 transition-colors text-left"
                          >
                            <div>
                              <p className="text-sm font-medium text-gray-900 line-clamp-1">{task.title}</p>
                              <p className="text-xs text-gray-500">
                                {task.currentPhase?.name || 'No Phase'} • {task.assignedTo?.name || 'Unassigned'}
                              </p>
                            </div>
                            <PlusIcon className="w-5 h-5 text-blue-500" />
                          </button>
                        ))
                    ) : searchQuery.length >= 2 ? (
                      <div className="p-8 text-center">
                        <p className="text-sm text-gray-500 italic">No tasks found matching "{searchQuery}"</p>
                      </div>
                    ) : (
                      <div className="p-8 text-center">
                        <p className="text-sm text-gray-500">Type at least 2 characters to search...</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-6 flex justify-end">
                  <button
                    onClick={() => setIsAddDependencyModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default TaskDetailPage
