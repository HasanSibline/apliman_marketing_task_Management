import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  XMarkIcon,
  ChevronDownIcon,
  CheckIcon,
  ClockIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleIconSolid } from '@heroicons/react/24/solid'
import type { Subtask, Task } from '@/types/task'
import { usersApi, tasksApi } from '@/services/api'
import toast from 'react-hot-toast'
import { useAppSelector } from '@/hooks/redux'

interface SubtaskDetailModalProps {
  subtask: Subtask
  task: Task
  isOpen: boolean
  onClose: () => void
  onUpdate: () => void
}

interface User {
  id: string
  name: string
  email: string
  position?: string
  role: string
}

const SubtaskDetailModal: React.FC<SubtaskDetailModalProps> = ({ 
  subtask, 
  task,
  isOpen, 
  onClose, 
  onUpdate 
}) => {
  const { user: currentUser } = useAppSelector((state) => state.auth)
  const [users, setUsers] = useState<User[]>([])
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [selectedPhase, setSelectedPhase] = useState<string>('')
  const [isUpdating, setIsUpdating] = useState(false)
  const [showUserDropdown, setShowUserDropdown] = useState(false)
  const [showPhaseDropdown, setShowPhaseDropdown] = useState(false)

  const isAdmin = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'ADMIN'
  const isAssignedUser = subtask.linkedTask?.assignedToId === currentUser?.id

  useEffect(() => {
    if (isOpen) {
      loadUsers()
      // Initialize selected users from subtask
      if (subtask.linkedTask?.assignedToId) {
        setSelectedUsers([subtask.linkedTask.assignedToId])
      }
      // Initialize selected phase
      if (subtask.linkedTask?.currentPhase?.id) {
        setSelectedPhase(subtask.linkedTask.currentPhase.id)
      }
    }
  }, [isOpen, subtask])

  const loadUsers = async () => {
    try {
      const data: any = await usersApi.getAll()
      const userList = Array.isArray(data) ? data : (data.users || [])
      setUsers(userList)
    } catch (error) {
      console.error('Failed to load users:', error)
    }
  }

  const toggleUserSelection = (userId: string) => {
    setSelectedUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    )
  }

  const handleUpdateAssignment = async () => {
    if (!subtask.linkedTask) {
      toast.error('This subtask is not linked to a task')
      return
    }

    if (selectedUsers.length === 0) {
      toast.error('Please select at least one user')
      return
    }

    try {
      setIsUpdating(true)
      // Use the primary selected user (first in array)
      await tasksApi.updateAssignment(subtask.linkedTask.id, selectedUsers[0])
      toast.success('Assignment updated successfully')
      onUpdate()
      onClose()
    } catch (error) {
      toast.error('Failed to update assignment')
    } finally {
      setIsUpdating(false)
    }
  }

  const handleUpdatePhase = async () => {
    if (!subtask.linkedTask || !selectedPhase) {
      return
    }

    try {
      setIsUpdating(true)
      await tasksApi.moveToPhase(subtask.linkedTask.id, selectedPhase)
      
      // If moving to completed phase, auto-check the subtask
      const newPhase = task.workflow?.phases.find(p => p.id === selectedPhase)
      if (newPhase?.name.toLowerCase().includes('complet') || newPhase?.isEndPhase) {
        if (!subtask.isCompleted) {
          await tasksApi.toggleSubtaskComplete(task.id, subtask.id)
        }
      }
      
      toast.success('Phase updated successfully')
      onUpdate()
    } catch (error) {
      toast.error('Failed to update phase')
    } finally {
      setIsUpdating(false)
    }
  }

  const handleToggleCompletion = async () => {
    try {
      setIsUpdating(true)
      await tasksApi.toggleSubtaskComplete(task.id, subtask.id)
      toast.success(subtask.isCompleted ? 'Marked incomplete' : 'Marked complete')
      onUpdate()
    } catch (error) {
      toast.error('Failed to update status')
    } finally {
      setIsUpdating(false)
    }
  }

  const currentPhase = subtask.linkedTask?.currentPhase || subtask.phase
  const availablePhases = task.workflow?.phases || []
  const assignedUser = users.find(u => u.id === subtask.linkedTask?.assignedToId)

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black bg-opacity-50"
              onClick={onClose}
            />
            
            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-lg shadow-xl max-h-[85vh] overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="flex items-start justify-between p-6 border-b border-gray-200">
                <div className="flex-1 pr-4">
                  <h2 className="text-xl font-semibold text-gray-900 mb-2">{subtask.title}</h2>
                  <div className="flex items-center gap-2">
                    {currentPhase && (
                      <span 
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                        style={{ 
                          backgroundColor: `${currentPhase.color}20`,
                          color: currentPhase.color
                        }}
                      >
                        <span 
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: currentPhase.color }}
                        />
                        {currentPhase.name}
                      </span>
                    )}
                    {subtask.isCompleted && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        <CheckCircleIconSolid className="h-3.5 w-3.5" />
                        Completed
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Description */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Description</h3>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">{subtask.description}</p>
                </div>

                {/* Current Assignment */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Currently Assigned To</h3>
                  {assignedUser ? (
                    <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                      <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center">
                        <span className="text-sm font-medium text-white">
                          {assignedUser.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{assignedUser.name}</p>
                        {assignedUser.position && (
                          <p className="text-xs text-gray-500">{assignedUser.position}</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">Not assigned</p>
                  )}
                </div>

                {/* Reassign Users (Admin or Assigned User) */}
                {(isAdmin || isAssignedUser) && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">
                      Reassign to Team Member
                    </h3>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowUserDropdown(!showUserDropdown)}
                        className="w-full flex items-center justify-between px-4 py-2.5 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors"
                      >
                        <span className="text-sm text-gray-700">
                          {selectedUsers.length === 0 
                            ? 'Select user(s)' 
                            : `${selectedUsers.length} user(s) selected`}
                        </span>
                        <ChevronDownIcon className={`h-4 w-4 text-gray-500 transition-transform ${showUserDropdown ? 'rotate-180' : ''}`} />
                      </button>

                      <AnimatePresence>
                        {showUserDropdown && (
                          <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="absolute z-10 mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto"
                          >
                            {users.map(user => (
                              <label
                                key={user.id}
                                className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer transition-colors"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedUsers.includes(user.id)}
                                  onChange={() => toggleUserSelection(user.id)}
                                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center">
                                  <span className="text-sm font-medium text-white">
                                    {user.name.charAt(0).toUpperCase()}
                                  </span>
                                </div>
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-gray-900">{user.name}</p>
                                  {user.position && (
                                    <p className="text-xs text-gray-500">{user.position}</p>
                                  )}
                                </div>
                                <span className="text-xs text-gray-400">{user.role}</span>
                              </label>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {selectedUsers.length > 0 && selectedUsers[0] !== subtask.linkedTask?.assignedToId && (
                      <button
                        onClick={handleUpdateAssignment}
                        disabled={isUpdating}
                        className="mt-3 w-full btn-primary flex items-center justify-center gap-2"
                      >
                        {isUpdating ? (
                          <>
                            <ArrowPathIcon className="h-4 w-4 animate-spin" />
                            Updating...
                          </>
                        ) : (
                          <>
                            <CheckIcon className="h-4 w-4" />
                            Update Assignment
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )}

                {/* Change Phase */}
                {(isAdmin || isAssignedUser) && availablePhases.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">
                      Change Status / Phase
                    </h3>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowPhaseDropdown(!showPhaseDropdown)}
                        className="w-full flex items-center justify-between px-4 py-2.5 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors"
                      >
                        <span className="text-sm text-gray-700">
                          {currentPhase ? currentPhase.name : 'Select phase'}
                        </span>
                        <ChevronDownIcon className={`h-4 w-4 text-gray-500 transition-transform ${showPhaseDropdown ? 'rotate-180' : ''}`} />
                      </button>

                      <AnimatePresence>
                        {showPhaseDropdown && (
                          <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="absolute z-10 mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden"
                          >
                            {availablePhases.map(phase => (
                              <button
                                key={phase.id}
                                type="button"
                                onClick={() => {
                                  setSelectedPhase(phase.id)
                                  setShowPhaseDropdown(false)
                                }}
                                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left ${
                                  selectedPhase === phase.id ? 'bg-blue-50' : ''
                                }`}
                              >
                                <span 
                                  className="w-3 h-3 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: phase.color }}
                                />
                                <span className="text-sm font-medium text-gray-900">{phase.name}</span>
                                {selectedPhase === phase.id && (
                                  <CheckIcon className="h-4 w-4 text-blue-600 ml-auto" />
                                )}
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {selectedPhase && selectedPhase !== currentPhase?.id && (
                      <button
                        onClick={handleUpdatePhase}
                        disabled={isUpdating}
                        className="mt-3 w-full btn-primary flex items-center justify-center gap-2"
                      >
                        {isUpdating ? (
                          <>
                            <ArrowPathIcon className="h-4 w-4 animate-spin" />
                            Updating...
                          </>
                        ) : (
                          <>
                            <CheckIcon className="h-4 w-4" />
                            Update Phase
                          </>
                        )}
                      </button>
                    )}
                    
                    <p className="text-xs text-gray-500 mt-2">
                      {availablePhases.find(p => p.id === selectedPhase)?.isEndPhase && 
                        '✓ Moving to this phase will auto-complete the subtask'}
                    </p>
                  </div>
                )}

                {/* Completion Toggle */}
                <div className="pt-4 border-t border-gray-200">
                  <button
                    onClick={handleToggleCompletion}
                    disabled={isUpdating}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors ${
                      subtask.isCompleted
                        ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        : 'bg-green-600 text-white hover:bg-green-700'
                    }`}
                  >
                    {isUpdating ? (
                      <>
                        <ArrowPathIcon className="h-5 w-5 animate-spin" />
                        Updating...
                      </>
                    ) : subtask.isCompleted ? (
                      <>
                        <XMarkIcon className="h-5 w-5" />
                        Mark as Incomplete
                      </>
                    ) : (
                      <>
                        <CheckCircleIconSolid className="h-5 w-5" />
                        Mark as Complete
                      </>
                    )}
                  </button>
                </div>

                {/* Metadata */}
                {subtask.estimatedHours && (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <ClockIcon className="h-4 w-4" />
                    <span>Estimated: {subtask.estimatedHours}h</span>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  )
}

export default SubtaskDetailModal

