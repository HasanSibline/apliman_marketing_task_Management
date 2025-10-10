import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  XMarkIcon, 
  PlayIcon,
  StopIcon,
  ClockIcon,
  ChatBubbleLeftIcon,
  PaperClipIcon,
  ListBulletIcon,
  CalendarIcon,
  UserIcon,
  TagIcon
} from '@heroicons/react/24/outline'
import { useAppDispatch } from '@/hooks/redux'
import { fetchTasks } from '@/store/slices/tasksSlice'
import { tasksApi } from '@/services/api'
import SubtaskList from './SubtaskList'
import toast from 'react-hot-toast'

interface TaskDetailModalProps {
  isOpen: boolean
  onClose: () => void
  task: any
}

interface TimeEntry {
  id: string
  description?: string
  startTime: string
  endTime?: string
  duration: number
  isActive: boolean
}

interface Comment {
  id: string
  comment: string
  createdAt: string
  user: {
    id: string
    name: string
    email: string
    position?: string
  }
}

interface TaskFile {
  id: string
  fileName: string
  filePath: string
  fileSize: number
  mimeType: string
  uploadedAt: string
}

const TaskDetailModal: React.FC<TaskDetailModalProps> = ({ isOpen, onClose, task }) => {
  const dispatch = useAppDispatch()
  const [activeTab, setActiveTab] = useState<'overview' | 'time' | 'comments' | 'files' | 'activity'>('overview')
  const [isTracking, setIsTracking] = useState(false)
  const [currentSession, setCurrentSession] = useState<TimeEntry | null>(null)
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [files, setFiles] = useState<TaskFile[]>([])
  const [newComment, setNewComment] = useState('')

  useEffect(() => {
    if (isOpen && task) {
      loadTaskData()
    }
  }, [isOpen, task])

  const loadTaskData = async () => {
    try {
      // Load time entries
      const timeResponse = await fetch(`/api/time-tracking?taskId=${task.id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
      if (timeResponse.ok) {
        setTimeEntries(await timeResponse.json())
      }

      // Load active session
      const activeResponse = await fetch('/api/time-tracking/active', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
      if (activeResponse.ok) {
        const activeSession = await activeResponse.json()
        if (activeSession && activeSession.taskId === task.id) {
          setCurrentSession(activeSession)
          setIsTracking(true)
        }
      }

      // Load comments
      if (task.comments) {
        setComments(task.comments)
      }

      // Load files
      if (task.files) {
        setFiles(task.files)
      }
    } catch (error) {
      console.error('Error loading task data:', error)
    }
  }

  const startTracking = async () => {
    try {
      const response = await fetch('/api/time-tracking/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          taskId: task.id,
          description: `Working on: ${task.title}`
        })
      })

      if (response.ok) {
        const session = await response.json()
        setCurrentSession(session)
        setIsTracking(true)
        toast.success('Time tracking started')
      }
    } catch (error) {
      console.error('Error starting time tracking:', error)
      toast.error('Failed to start time tracking')
    }
  }

  const stopTracking = async () => {
    if (!currentSession) return

    try {
      const response = await fetch(`/api/time-tracking/${currentSession.id}/stop`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })

      if (response.ok) {
        setIsTracking(false)
        setCurrentSession(null)
        loadTaskData() // Reload to get updated entries
        toast.success('Time tracking stopped')
      }
    } catch (error) {
      console.error('Error stopping time tracking:', error)
      toast.error('Failed to stop time tracking')
    }
  }

  const submitComment = async () => {
    if (!newComment.trim()) return

    try {
      const response = await tasksApi.addComment(task.id, newComment.trim())
      setComments(prev => [...prev, response])
      setNewComment('')
      toast.success('Comment added')
    } catch (error) {
      console.error('Error adding comment:', error)
      toast.error('Failed to add comment')
    }
  }

  const handleFileUpload = async (files: FileList) => {
    if (!files.length) return

    try {
      for (const file of Array.from(files)) {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('taskId', task.id)

        const response = await fetch('/api/files/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
          body: formData
        })

        if (response.ok) {
          const uploadedFile = await response.json()
          setFiles(prev => [...prev, uploadedFile])
        }
      }
      toast.success('Files uploaded successfully')
    } catch (error) {
      console.error('Error uploading files:', error)
      toast.error('Failed to upload files')
    }
  }

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return `${hours}h ${minutes}m`
  }

  const getTotalTimeLogged = () => {
    return timeEntries.reduce((total, entry) => total + entry.duration, 0)
  }

  const getPriorityColor = (priority: number) => {
    const colors = {
      1: 'bg-gray-100 text-gray-800',
      2: 'bg-blue-100 text-blue-800',
      3: 'bg-yellow-100 text-yellow-800',
      4: 'bg-orange-100 text-orange-800',
      5: 'bg-red-100 text-red-800'
    }
    return colors[priority as keyof typeof colors] || 'bg-gray-100 text-gray-800'
  }

  const getSubtaskProgress = () => {
    if (!task.subtasks || task.subtasks.length === 0) return null
    const completed = task.subtasks.filter((s: any) => s.isCompleted).length
    const total = task.subtasks.length
    return { completed, total, percentage: Math.round((completed / total) * 100) }
  }

  if (!isOpen || !task) return null

  const subtaskProgress = getSubtaskProgress()

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black bg-opacity-50"
              onClick={onClose}
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
          className="relative bg-white rounded-lg shadow-xl w-full max-w-4xl h-[90vh] flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div className="flex-1">
              <div className="flex items-center space-x-3 mb-2">
                <h2 className="text-xl font-semibold text-gray-900">{task.title}</h2>
                {task.taskType === 'SUBTASK' && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                    SUBTASK
                  </span>
                )}
              </div>
              
              <div className="flex items-center space-x-4 text-sm text-gray-500">
                <div className="flex items-center space-x-1">
                  <UserIcon className="h-4 w-4" />
                  <span>{task.assignedTo?.name || 'Unassigned'}</span>
                </div>
                
                <div className="flex items-center space-x-1">
                  <CalendarIcon className="h-4 w-4" />
                  <span>Created {new Date(task.createdAt).toLocaleDateString()}</span>
                </div>
                
                <div className="flex items-center space-x-1">
                  <TagIcon className="h-4 w-4" />
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(task.priority)}`}>
                    Priority {task.priority}
                  </span>
                </div>

                {task.workflow && (
                  <div className="flex items-center space-x-1">
                    <span 
                      className="inline-flex items-center px-2 py-1 rounded text-xs font-medium text-white"
                      style={{ backgroundColor: task.workflow.color }}
                    >
                      {task.workflow.name}
                    </span>
                  </div>
                )}
              </div>
            </div>
            
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            {[
              { id: 'overview', label: 'Overview', icon: ListBulletIcon },
              { id: 'time', label: 'Time Tracking', icon: ClockIcon },
              { id: 'comments', label: `Comments (${comments.length})`, icon: ChatBubbleLeftIcon },
              { id: 'files', label: `Files (${files.length})`, icon: PaperClipIcon },
            ].map(tab => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center space-x-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                    </button>
              )
            })}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Description */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Description</h3>
                  <p className="text-gray-700">{task.description}</p>
                </div>

                {/* Goals */}
                {task.goals && (
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Goals</h3>
                    <p className="text-gray-700">{task.goals}</p>
                  </div>
                )}

                {/* Progress */}
                {subtaskProgress && (
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Progress</h3>
                    <div className="bg-gray-200 rounded-full h-3 mb-2">
                      <div 
                        className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                        style={{ width: `${subtaskProgress.percentage}%` }}
                      />
                    </div>
                    <p className="text-sm text-gray-600">
                      {subtaskProgress.completed} of {subtaskProgress.total} subtasks completed ({subtaskProgress.percentage}%)
                    </p>
                  </div>
                )}

                {/* Subtasks */}
                {task.subtasks && task.subtasks.length > 0 && (
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Subtasks</h3>
                    <SubtaskList
                      taskId={task.id}
                      subtasks={task.subtasks}
                      onSubtasksUpdated={() => dispatch(fetchTasks({}))}
                    />
                  </div>
                )}
              </div>
            )}

            {activeTab === 'time' && (
              <div className="space-y-6">
                {/* Timer Controls */}
                <div className="bg-gray-50 rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-gray-900">Time Tracker</h3>
                    <div className="text-2xl font-mono text-gray-900">
                      {currentSession ? formatDuration(Math.floor((new Date().getTime() - new Date(currentSession.startTime).getTime()) / 1000)) : '0h 0m'}
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    {!isTracking ? (
                      <button
                        onClick={startTracking}
                        className="flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
                      >
                        <PlayIcon className="h-4 w-4" />
                        <span>Start Timer</span>
                      </button>
                    ) : (
                      <button
                        onClick={stopTracking}
                        className="flex items-center space-x-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
                      >
                        <StopIcon className="h-4 w-4" />
                        <span>Stop Timer</span>
                      </button>
                    )}
                </div>
              </div>

                {/* Time Summary */}
                <div className="bg-blue-50 rounded-lg p-4">
                  <h4 className="font-medium text-blue-900 mb-2">Total Time Logged</h4>
                  <p className="text-2xl font-semibold text-blue-700">
                    {formatDuration(getTotalTimeLogged())}
                  </p>
                        </div>

                {/* Time Entries */}
                        <div>
                  <h4 className="font-medium text-gray-900 mb-4">Time Entries</h4>
                  <div className="space-y-2">
                    {timeEntries.map(entry => (
                      <div key={entry.id} className="bg-white border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-gray-900">{entry.description || 'No description'}</p>
                            <p className="text-xs text-gray-500">
                              {new Date(entry.startTime).toLocaleString()}
                              {entry.endTime && ` - ${new Date(entry.endTime).toLocaleString()}`}
                            </p>
                          </div>
                          <div className="text-sm font-medium text-gray-900">
                            {formatDuration(entry.duration)}
                          </div>
                        </div>
                      </div>
                    ))}
                    
                    {timeEntries.length === 0 && (
                      <p className="text-gray-500 text-center py-4">No time entries yet</p>
                    )}
                  </div>
                </div>
                        </div>
            )}

            {activeTab === 'comments' && (
                      <div className="space-y-6">
                {/* Add Comment */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Add a comment..."
                    className="w-full p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    rows={3}
                  />
                  <div className="flex justify-end mt-3">
                              <button
                      onClick={submitComment}
                      disabled={!newComment.trim()}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Post Comment
                              </button>
                  </div>
                          </div>

                {/* Comments List */}
                <div className="space-y-4">
                  {comments.map(comment => (
                    <div key={comment.id} className="bg-white border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0">
                          <div className="h-8 w-8 bg-blue-500 rounded-full flex items-center justify-center">
                            <span className="text-white text-sm font-medium">
                              {comment.user.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-1">
                            <span className="font-medium text-gray-900">{comment.user.name}</span>
                            {comment.user.position && (
                              <span className="text-xs text-gray-500">({comment.user.position})</span>
                            )}
                            <span className="text-xs text-gray-500">
                              {new Date(comment.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-gray-700">{comment.comment}</p>
                        </div>
                              </div>
                            </div>
                  ))}
                  
                  {comments.length === 0 && (
                    <p className="text-gray-500 text-center py-4">No comments yet</p>
                          )}
                        </div>
                      </div>
                    )}

            {activeTab === 'files' && (
              <div className="space-y-6">
                {/* File Upload */}
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                  <PaperClipIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 mb-4">Drag and drop files here, or click to browse</p>
                  <input
                    type="file"
                    multiple
                    onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
                    className="hidden"
                    id="file-upload"
                  />
                  <label
                    htmlFor="file-upload"
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 cursor-pointer"
                  >
                    Choose Files
                  </label>
                  </div>

                {/* Files List */}
                <div className="space-y-2">
                  {files.map(file => (
                    <div key={file.id} className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <PaperClipIcon className="h-5 w-5 text-gray-400" />
                      <div>
                          <p className="text-sm font-medium text-gray-900">{file.fileName}</p>
                          <p className="text-xs text-gray-500">
                            {(file.fileSize / 1024 / 1024).toFixed(2)} MB • {new Date(file.uploadedAt).toLocaleDateString()}
                          </p>
                              </div>
                      </div>
                      <button
                        onClick={() => window.open(file.filePath, '_blank')}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        Download
                      </button>
                    </div>
                  ))}
                  
                  {files.length === 0 && (
                    <p className="text-gray-500 text-center py-4">No files attached</p>
                  )}
                </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
    </AnimatePresence>
  )
}

export default TaskDetailModal