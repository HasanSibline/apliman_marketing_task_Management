import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { XMarkIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { useAppDispatch } from '@/hooks/redux'
import { usersApi } from '@/services/api'
import { fetchUsers } from '@/store/slices/usersSlice'
import toast from 'react-hot-toast'

interface DeleteUserModalProps {
  isOpen: boolean
  onClose: () => void
  user: any
}

const DeleteUserModal: React.FC<DeleteUserModalProps> = ({ isOpen, onClose, user }) => {
  const dispatch = useAppDispatch()
  const [isLoading, setIsLoading] = useState(false)

  const handleDelete = async () => {
    setIsLoading(true)
    try {
      await usersApi.delete(user.id)
      toast.success('User deleted successfully!')
      dispatch(fetchUsers({}))
      onClose()
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to delete user'
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

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
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-white rounded-lg shadow-xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <div className="flex items-center space-x-3">
                  <ExclamationTriangleIcon className="h-6 w-6 text-red-500" />
                  <h2 className="text-xl font-semibold text-gray-900">Delete User</h2>
                </div>
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6">
                <p className="text-gray-700">
                  Are you sure you want to delete <span className="font-semibold">{user?.name}</span>? This action cannot be undone.
                </p>

                <div className="mt-4 p-4 bg-red-50 rounded-lg">
                  <p className="text-sm text-red-700">
                    This will permanently delete the user account and all associated data. Tasks assigned to this user will be unassigned.
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end space-x-3 mt-6">
                  <button
                    type="button"
                    onClick={onClose}
                    className="btn-secondary"
                    disabled={isLoading}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="btn-danger"
                    disabled={isLoading}
                  >
                    {isLoading ? 'Deleting...' : 'Delete User'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  )
}

export default DeleteUserModal
