import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { usersApi } from '@/services/api'
import { fetchUsers } from '@/store/slices/usersSlice'

interface CreateUserModalProps {
  isOpen: boolean
  onClose: () => void
  companyName?: string
}

const CreateUserModal: React.FC<CreateUserModalProps> = ({ isOpen, onClose, companyName }) => {
  const dispatch = useAppDispatch()
  const { user } = useAppSelector((state) => state.auth)
  const [isLoading, setIsLoading] = useState(false)
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'EMPLOYEE' as 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'ADMIN' | 'EMPLOYEE',
    position: '',
    departmentId: '',
    managerId: '',
    isTicketApprover: false,
    strategyAccess: 'NONE' as 'NONE' | 'READ' | 'EDIT',
  })

  const [departments, setDepartments] = useState<any[]>([])
  const [potentialManagers, setPotentialManagers] = useState<any[]>([])

  React.useEffect(() => {
    if (isOpen) {
      const fetchData = async () => {
        try {
          const [deptsRes, usersRes] = await Promise.all([
            usersApi.getDepartments?.() || Promise.resolve([]),
            usersApi.getAll?.() || Promise.resolve([])
          ])
          if (deptsRes) setDepartments(deptsRes)
          if (usersRes) setPotentialManagers(usersRes)
        } catch (error) {
          console.error('Error fetching modal data:', error)
        }
      }
      fetchData()
    }
  }, [isOpen])

  const [errors, setErrors] = useState<Record<string, string>>({})

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required'
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid'
    }

    if (!formData.password) {
      newErrors.password = 'Password is required'
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters'
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match'
    }

    if (!formData.position.trim()) {
      newErrors.position = 'Position is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) return

    setIsLoading(true)
    try {
      await usersApi.create({
        name: formData.name.trim(),
        email: formData.email.trim(),
        password: formData.password,
        role: formData.role,
        position: formData.position.trim(),
        departmentId: formData.departmentId || undefined,
        managerId: formData.managerId || undefined,
        isTicketApprover: formData.isTicketApprover,
        strategyAccess: formData.strategyAccess,
      })
      
      console.log('User created successfully!')
      dispatch(fetchUsers({}))
      onClose()
      setFormData({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
        role: 'EMPLOYEE',
        position: '',
        departmentId: '',
        managerId: '',
        isTicketApprover: false,
        strategyAccess: 'NONE',
      })
      setErrors({})
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to create user'
      console.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target as HTMLInputElement
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }))
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }))
    }
  }

  const canCreateRole = (role: 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'ADMIN' | 'EMPLOYEE') => {
    if (user?.role === 'SUPER_ADMIN') {
      return true // Platform Admin can create any role
    }
    if (user?.role === 'COMPANY_ADMIN') {
      // System Administrator can create Company Admins and Employees only
      return role === 'ADMIN' || role === 'EMPLOYEE'
    }
    if (user?.role === 'ADMIN') {
      return role === 'EMPLOYEE' // Company Admin can only create employees
    }
    return false
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
                <h2 className="text-xl font-semibold text-gray-900">Create New User</h2>
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {/* Name */}
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                      errors.name ? 'border-red-300' : 'border-gray-300'
                    }`}
                    placeholder="Enter full name"
                  />
                  {errors.name && (
                    <p className="mt-1 text-sm text-red-600">{errors.name}</p>
                  )}
                </div>

                {/* Email */}
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                      errors.email ? 'border-red-300' : 'border-gray-300'
                    }`}
                    placeholder="Enter email address"
                  />
                  {errors.email && (
                    <p className="mt-1 text-sm text-red-600">{errors.email}</p>
                  )}
                </div>

                {/* Role */}
                <div>
                  <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">
                    Role *
                  </label>
                  <select
                    id="role"
                    name="role"
                    value={formData.role}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    {canCreateRole('EMPLOYEE') && <option value="EMPLOYEE">Employee</option>}
                    {canCreateRole('ADMIN') && (
                      <option value="ADMIN">
                        {companyName ? `${companyName} Admin` : 'Company Admin'}
                      </option>
                    )}
                    {canCreateRole('SUPER_ADMIN') && <option value="SUPER_ADMIN">Platform Administrator</option>}
                  </select>
                </div>

                {/* Additional Permissions */}
                <div className="space-y-3 p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Permissions</h3>
                  
                  {/* Ticket Approver */}
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="isTicketApprover"
                      name="isTicketApprover"
                      checked={formData.isTicketApprover}
                      onChange={handleChange}
                      className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600 transition-all cursor-pointer"
                    />
                    <label htmlFor="isTicketApprover" className="flex flex-col cursor-pointer">
                      <span className="text-sm font-semibold text-gray-900 leading-none">Ticket Approver</span>
                      <span className="text-[10px] text-gray-500 mt-1">Can approve departmental requests</span>
                    </label>
                  </div>

                  {/* Strategy Access */}
                  <div className="flex flex-col gap-2">
                    <label htmlFor="strategyAccess" className="text-sm font-semibold text-gray-900 leading-none">Strategy Access</label>
                    <select
                      id="strategyAccess"
                      name="strategyAccess"
                      value={formData.strategyAccess}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="NONE">No Access</option>
                      <option value="READ">Read Only (View strategy)</option>
                      <option value="EDIT">Full Edit (Manage strategy)</option>
                    </select>
                    <span className="text-[10px] text-gray-500">Determines visibility and control over Quarters and Objectives</span>
                  </div>
                </div>

                {/* Position */}
                <div>
                  <label htmlFor="position" className="block text-sm font-medium text-gray-700 mb-1">
                    Position *
                  </label>
                  <input
                    type="text"
                    id="position"
                    name="position"
                    value={formData.position}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                      errors.position ? 'border-red-300' : 'border-gray-300'
                    }`}
                    placeholder="Enter job position"
                  />
                  {errors.position && (
                    <p className="mt-1 text-sm text-red-600">{errors.position}</p>
                  )}
                </div>

                {/* Department */}
                <div>
                  <label htmlFor="departmentId" className="block text-sm font-medium text-gray-700 mb-1">
                    Department
                  </label>
                  <select
                    id="departmentId"
                    name="departmentId"
                    value={formData.departmentId}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">No Department</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>{dept.name}</option>
                    ))}
                  </select>
                </div>

                {/* Manager */}
                <div>
                  <label htmlFor="managerId" className="block text-sm font-medium text-gray-700 mb-1">
                    Direct Manager
                  </label>
                  <select
                    id="managerId"
                    name="managerId"
                    value={formData.managerId}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">No Manager</option>
                    {potentialManagers.map((m) => (
                      <option key={m.id} value={m.id}>{m.name} ({m.position || 'No Position'})</option>
                    ))}
                  </select>
                </div>

                {/* Password */}
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                    Password *
                  </label>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                      errors.password ? 'border-red-300' : 'border-gray-300'
                    }`}
                    placeholder="Enter password (min 8 characters)"
                  />
                  {errors.password && (
                    <p className="mt-1 text-sm text-red-600">{errors.password}</p>
                  )}
                </div>

                {/* Confirm Password */}
                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                    Confirm Password *
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
                    placeholder="Confirm password"
                  />
                  {errors.confirmPassword && (
                    <p className="mt-1 text-sm text-red-600">{errors.confirmPassword}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={onClose}
                    className="btn-secondary"
                    disabled={isLoading}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={isLoading}
                  >
                    {isLoading ? 'Creating...' : 'Create User'}
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

export default CreateUserModal
