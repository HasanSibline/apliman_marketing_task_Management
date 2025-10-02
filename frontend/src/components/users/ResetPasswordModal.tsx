import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { XMarkIcon, KeyIcon } from '@heroicons/react/24/outline'
import { usersApi } from '@/services/api'
import toast from 'react-hot-toast'

interface ResetPasswordModalProps {
  isOpen: boolean
  onClose: () => void
  user: any
}

const ResetPasswordModal: React.FC<ResetPasswordModalProps> = ({ isOpen, onClose, user }) => {
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    newPassword: '',
    confirmPassword: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }))
    }
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.newPassword) {
      newErrors.newPassword = 'New password is required'
    } else if (formData.newPassword.length < 6) {
      newErrors.newPassword = 'Password must be at least 6 characters'
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm the password'
    } else if (formData.newPassword !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }

    setIsLoading(true)
    try {
      await usersApi.resetPasswordManual(user.id, formData.newPassword)
      toast.success('Password reset successfully!')
      onClose()
      setFormData({ newPassword: '', confirmPassword: '' })
      setErrors({})
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to reset password'
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    if (!isLoading) {
      onClose()
      setFormData({ newPassword: '', confirmPassword: '' })
      setErrors({})
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
              onClick={handleClose}
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
                  <div className="h-10 w-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                    <KeyIcon className="h-6 w-6 text-yellow-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Reset Password</h2>
                    <p className="text-sm text-gray-500">Set a new password for {user?.name}</p>
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  disabled={isLoading}
                  className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-2">
                    New Password
                  </label>
                  <input
                    type="password"
                    id="newPassword"
                    name="newPassword"
                    value={formData.newPassword}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                      errors.newPassword ? 'border-red-300' : 'border-gray-300'
                    }`}
                    placeholder="Enter new password"
                    disabled={isLoading}
                  />
                  {errors.newPassword && (
                    <p className="mt-1 text-sm text-red-600">{errors.newPassword}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    id="confirmPassword"
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                      errors.confirmPassword ? 'border-red-300' : 'border-gray-300'
                    }`}
                    placeholder="Confirm new password"
                    disabled={isLoading}
                  />
                  {errors.confirmPassword && (
                    <p className="mt-1 text-sm text-red-600">{errors.confirmPassword}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={isLoading}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
                  >
                    {isLoading ? 'Resetting...' : 'Reset Password'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  )
}

export default ResetPasswordModal
