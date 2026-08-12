import React, { useState } from 'react'
import { KeyIcon } from '@heroicons/react/24/outline'
import FormDialog from '@/components/ui/FormDialog'
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
    <FormDialog
      isOpen={isOpen}
      onClose={handleClose}
      onSubmit={handleSubmit}
      busy={isLoading}
      width="sm"
      title="Reset password"
      description={`Set a new password for ${user?.name ?? 'this person'}. They can sign in with it straight away.`}
      icon={
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
          <KeyIcon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        </div>
      }
      footer={
        <>
          <button type="button" onClick={handleClose} disabled={isLoading} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={isLoading} className="btn-primary">
            {isLoading ? 'Resetting…' : 'Reset password'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="newPassword" className="form-label">
            New password
          </label>
          <input
            type="password"
            id="newPassword"
            name="newPassword"
            value={formData.newPassword}
            onChange={handleChange}
            className={`input-field ${errors.newPassword ? 'border-red-400 dark:border-red-500' : ''}`}
            placeholder="At least 6 characters"
            disabled={isLoading}
            aria-invalid={!!errors.newPassword}
          />
          {errors.newPassword && (
            <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">{errors.newPassword}</p>
          )}
        </div>

        <div>
          <label htmlFor="confirmPassword" className="form-label">
            Confirm password
          </label>
          <input
            type="password"
            id="confirmPassword"
            name="confirmPassword"
            value={formData.confirmPassword}
            onChange={handleChange}
            className={`input-field ${errors.confirmPassword ? 'border-red-400 dark:border-red-500' : ''}`}
            placeholder="Type it again"
            disabled={isLoading}
            aria-invalid={!!errors.confirmPassword}
          />
          {errors.confirmPassword && (
            <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">{errors.confirmPassword}</p>
          )}
        </div>
      </div>
    </FormDialog>
  )
}

export default ResetPasswordModal
