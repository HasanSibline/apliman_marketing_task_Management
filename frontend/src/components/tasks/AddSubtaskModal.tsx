import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  XMarkIcon,
  PlusIcon,
  UserIcon,
  ClockIcon,
  ChevronDownIcon,
  CheckIcon,
} from '@heroicons/react/24/outline'
import { usersApi } from '@/services/api'
import toast from 'react-hot-toast'

interface AddSubtaskModalProps {
  isOpen: boolean
  onClose: () => void
  onAdd: (subtask: {
    title: string
    description: string
    assignedToId?: string
    estimatedHours?: number
    phaseId?: string
  }) => void
  availablePhases: Array<{ id: string; name: string; color: string }>
}

interface User {
  id: string
  name: string
  email: string
  position?: string
}

const AddSubtaskModal: React.FC<AddSubtaskModalProps> = ({
  isOpen,
  onClose,
  onAdd,
  availablePhases,
}) => {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assignedToId, setAssignedToId] = useState<string>('')
  const [estimatedHours, setEstimatedHours] = useState<string>('')
  const [phaseId, setPhaseId] = useState<string>('')
  const [users, setUsers] = useState<User[]>([])
  const [showUserDropdown, setShowUserDropdown] = useState(false)
  const [showPhaseDropdown, setShowPhaseDropdown] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      loadUsers()
      // Set default phase to first phase
      if (availablePhases.length > 0 && !phaseId) {
        setPhaseId(availablePhases[0].id)
      }
    }
  }, [isOpen, availablePhases])

  const loadUsers = async () => {
    try {
      const data: any = await usersApi.getAll()
      const userList = Array.isArray(data) ? data : (data.users || [])
      setUsers(userList.filter((u: User) => u))
    } catch (error) {
      console.error('Failed to load users:', error)
    }
  }

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error('Please enter a subtask title')
      return
    }

    setIsSubmitting(true)
    try {
      onAdd({
        title: title.trim(),
        description: description.trim(),
        assignedToId: assignedToId || undefined,
        estimatedHours: estimatedHours ? parseFloat(estimatedHours) : undefined,
        phaseId: phaseId || undefined,
      })
      
      // Reset form
      setTitle('')
      setDescription('')
      setAssignedToId('')
      setEstimatedHours('')
      setPhaseId(availablePhases[0]?.id || '')
      toast.success('Subtask added successfully')
      onClose()
    } catch (error) {
      toast.error('Failed to add subtask')
    } finally {
      setIsSubmitting(false)
    }
  }

  const selectedUser = users.find(u => u.id === assignedToId)
  const selectedPhase = availablePhases.find(p => p.id === phaseId)

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex min-h-screen items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black bg-opacity-50"
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Add Subtask</h2>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Title *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter subtask title"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Enter subtask description"
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
              </div>

              {/* Assign To */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Assign To
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowUserDropdown(!showUserDropdown)}
                    className="w-full flex items-center justify-between px-4 py-2.5 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-sm text-gray-700 flex items-center gap-2">
                      {selectedUser ? (
                        <>
                          <UserIcon className="h-4 w-4" />
                          {selectedUser.name}
                        </>
                      ) : (
                        <>
                          <UserIcon className="h-4 w-4 text-gray-400" />
                          <span className="text-gray-500">Select user (optional)</span>
                        </>
                      )}
                    </span>
                    <ChevronDownIcon className={`h-4 w-4 text-gray-500 transition-transform ${showUserDropdown ? 'rotate-180' : ''}`} />
                  </button>

                  <AnimatePresence>
                    {showUserDropdown && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute z-10 mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-60 overflow-y-auto"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setAssignedToId('')
                            setShowUserDropdown(false)
                          }}
                          className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors text-sm text-gray-500"
                        >
                          Unassigned
                        </button>
                        {users.map((user) => (
                          <button
                            key={user.id}
                            type="button"
                            onClick={() => {
                              setAssignedToId(user.id)
                              setShowUserDropdown(false)
                            }}
                            className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-center gap-3 ${
                              assignedToId === user.id ? 'bg-blue-50' : ''
                            }`}
                          >
                            <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                              <span className="text-sm font-medium text-white">
                                {user.name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
                              {user.position && (
                                <p className="text-xs text-gray-500 truncate">{user.position}</p>
                              )}
                            </div>
                            {assignedToId === user.id && (
                              <CheckIcon className="h-4 w-4 text-blue-600" />
                            )}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Phase */}
              {availablePhases.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phase
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowPhaseDropdown(!showPhaseDropdown)}
                      className="w-full flex items-center justify-between px-4 py-2.5 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors"
                    >
                      <span className="text-sm text-gray-700 flex items-center gap-2">
                        {selectedPhase && (
                          <>
                            <span
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: selectedPhase.color }}
                            />
                            {selectedPhase.name}
                          </>
                        )}
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
                          {availablePhases.map((phase) => (
                            <button
                              key={phase.id}
                              type="button"
                              onClick={() => {
                                setPhaseId(phase.id)
                                setShowPhaseDropdown(false)
                              }}
                              className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-center gap-3 ${
                                phaseId === phase.id ? 'bg-blue-50' : ''
                              }`}
                            >
                              <span
                                className="w-3 h-3 rounded-full flex-shrink-0"
                                style={{ backgroundColor: phase.color }}
                              />
                              <span className="text-sm font-medium text-gray-900">{phase.name}</span>
                              {phaseId === phase.id && (
                                <CheckIcon className="h-4 w-4 text-blue-600 ml-auto" />
                              )}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              )}

              {/* Estimated Hours */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <ClockIcon className="h-4 w-4 inline mr-1" />
                  Estimated Hours
                </label>
                <input
                  type="number"
                  value={estimatedHours}
                  onChange={(e) => setEstimatedHours(e.target.value)}
                  placeholder="e.g., 2.5"
                  step="0.5"
                  min="0"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6 pt-6 border-t">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || !title.trim()}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <PlusIcon className="h-4 w-4" />
                {isSubmitting ? 'Adding...' : 'Add Subtask'}
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </AnimatePresence>
  )
}

export default AddSubtaskModal

