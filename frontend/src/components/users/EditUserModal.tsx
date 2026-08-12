import React, { useState, useEffect } from 'react'
import FormDialog from '@/components/ui/FormDialog'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { usersApi } from '@/services/api'
import { fetchUsers } from '@/store/slices/usersSlice'
import toast from 'react-hot-toast'

interface EditUserModalProps {
  isOpen: boolean
  onClose: () => void
  user: any
  companyName?: string
}

const EditUserModal: React.FC<EditUserModalProps> = ({ isOpen, onClose, user, companyName }) => {
  const dispatch = useAppDispatch()
  const currentUser = useAppSelector((state) => state.auth.user)
  const [isLoading, setIsLoading] = useState(false)
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: '' as 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'ADMIN' | 'MANAGER' | 'EMPLOYEE',
    position: '',
    status: '' as 'ACTIVE' | 'AWAY' | 'OFFLINE' | 'RETIRED',
    departmentId: '',
    managerId: '',
    isTicketApprover: false,
    strategyAccess: 'NONE' as 'NONE' | 'READ' | 'EDIT',
  })

  const [departments, setDepartments] = useState<any[]>([])
  const [potentialManagers, setPotentialManagers] = useState<any[]>([])

  useEffect(() => {
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

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name,
        email: user.email,
        role: user.role,
        position: user.position,
        status: user.status,
        departmentId: user.departmentId || '',
        managerId: user.managerId || '',
        isTicketApprover: user.isTicketApprover || false,
        strategyAccess: user.strategyAccess || 'NONE',
      })
    }
  }, [user])

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

    if (!formData.position.trim()) {
      newErrors.position = 'Position is required'
    }

    if (formData.role === 'EMPLOYEE' && !formData.managerId) {
      newErrors.managerId = 'Manager is required for standard personnel'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) return

    setIsLoading(true)
    try {
      await usersApi.update(user.id, {
        name: formData.name.trim(),
        email: formData.email.trim(),
        role: formData.role,
        position: formData.position.trim(),
        status: formData.status,
        departmentId: formData.departmentId || null,
        managerId: formData.managerId || null,
        isTicketApprover: formData.isTicketApprover,
        strategyAccess: formData.strategyAccess,
      })
      
      toast.success('User updated successfully!')
      dispatch(fetchUsers({}))
      onClose()
      setErrors({})
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to update user'
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target as HTMLInputElement
    setFormData(prev => {
      const newData = {
        ...prev,
        [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
      };
      return newData;
    });
    
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }))
    }
  }

  const canEditRole = () => {
    if (!currentUser) return false

    if (currentUser.role === 'SUPER_ADMIN') {
      return true
    }

    if (currentUser.role === 'COMPANY_ADMIN') {
      return user.role !== 'SUPER_ADMIN'
    }

    if (currentUser.role === 'ADMIN') {
      return user.role === 'EMPLOYEE'
    }

    return false
  }

  type RoleOption = 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'ADMIN' | 'MANAGER' | 'EMPLOYEE'

  const roleOptions = (): RoleOption[] => {
    if (!currentUser) return []

    if (currentUser.role === 'SUPER_ADMIN') {
      return ['SUPER_ADMIN', 'COMPANY_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE']
    }

    if (currentUser.role === 'COMPANY_ADMIN') {
      return ['ADMIN', 'MANAGER', 'EMPLOYEE']
    }

    if (currentUser.role === 'ADMIN') {
      return ['MANAGER', 'EMPLOYEE']
    }

    return []
  }

  const getRoleOptionLabel = (role: RoleOption) => {
    switch (role) {
      case 'SUPER_ADMIN':
        return 'Platform Administrator'
      case 'COMPANY_ADMIN':
        return 'System Administrator'
      case 'ADMIN':
        return companyName ? `${companyName} Admin` : 'Company Admin'
      case 'MANAGER':
        return 'Department Manager'
      case 'EMPLOYEE':
        return 'Employee'
      default:
        return role as string
    }
  }

  const handleResetPassword = async () => {
    try {
      setIsLoading(true)
      await usersApi.resetPassword(user.id)
      toast.success('Password reset email sent successfully!')
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to reset password'
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <FormDialog
      isOpen={isOpen}
      onClose={onClose}
      onSubmit={handleSubmit}
      busy={isLoading}
      width="md"
      title={user?.name ? `Edit ${user.name}` : 'Edit person'}
      description="Changes take effect the next time they load a page."
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary" disabled={isLoading}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={isLoading}>
            {isLoading ? 'Saving…' : 'Save changes'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
                {/* Name */}
                <div>
                  <label htmlFor="name" className="form-label">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    className={`input-field ${
                      errors.name ? 'border-red-400 dark:border-red-500' : ''
                    }`}
                    placeholder="Enter full name"
                  />
                  {errors.name && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.name}</p>
                  )}
                </div>

                {/* Email */}
                <div>
                  <label htmlFor="email" className="form-label">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className={`input-field ${
                      errors.email ? 'border-red-400 dark:border-red-500' : ''
                    }`}
                    placeholder="Enter email address"
                  />
                  {errors.email && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.email}</p>
                  )}
                </div>

                {/* Role */}
                {canEditRole() && (
                  <div>
                    <label htmlFor="role" className="form-label">
                      Role *
                    </label>
                    <select
                      id="role"
                      name="role"
                      value={formData.role}
                      onChange={(e) => {
                        const newRole = e.target.value as any;
                        setFormData(prev => ({
                          ...prev,
                          role: newRole,
                          isTicketApprover: newRole === 'MANAGER' ? true : prev.isTicketApprover
                        }));
                      }}
                      className="select-field w-full text-sm"
                    >
                      {roleOptions().map((roleOption) => (
                        <option key={roleOption} value={roleOption}>
                          {getRoleOptionLabel(roleOption)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Position */}
                <div>
                  <label htmlFor="position" className="form-label">
                    Position *
                  </label>
                  <input
                    type="text"
                    id="position"
                    name="position"
                    value={formData.position}
                    onChange={handleChange}
                    className={`input-field ${
                      errors.position ? 'border-red-400 dark:border-red-500' : ''
                    }`}
                    placeholder="Enter job position"
                  />
                  {errors.position && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.position}</p>
                  )}
                </div>

                {/* Department Mapping */}
                <div>
                  <label htmlFor="departmentId" className="block text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-wide mb-2 ml-1">
                    Organizational Department
                  </label>
                  <select
                    id="departmentId"
                    name="departmentId"
                    value={formData.departmentId}
                    onChange={handleChange}
                    className="select-field w-full text-sm"
                  >
                    <option value="">No Department Mapping</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>{dept.name}</option>
                    ))}
                  </select>
                </div>

                {/* Direct Manager Selector */}
                <div>
                  <label htmlFor="managerId" className="block text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-wide mb-2 ml-1">
                    Direct Reporting Manager
                  </label>
                  <select
                    id="managerId"
                    name="managerId"
                    value={formData.managerId}
                    onChange={handleChange}
                    className="select-field w-full text-sm"
                  >
                    <option value="">No Direct Manager Mapping</option>
                    {potentialManagers.filter(m => m.id !== user.id).map((m) => (
                      <option key={m.id} value={m.id}>{m.name} ({m.position || 'Standard Personnel'})</option>
                    ))}
                  </select>
                </div>

                {/* Additional Permissions */}
                <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-900/40 rounded-xl border border-gray-200 dark:border-gray-700">
                  <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 tracking-wide">Permissions</h3>
                  
                  {/* Ticket Approver */}
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="isTicketApprover"
                      name="isTicketApprover"
                      checked={formData.isTicketApprover}
                      onChange={handleChange}
                      className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 dark:text-primary-400 focus:ring-primary-600 transition-all cursor-pointer"
                    />
                    <label htmlFor="isTicketApprover" className="flex flex-col cursor-pointer">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white leading-none">Ticket Approver / Manager Role</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">Allow this user to approve departmental tickets</span>
                    </label>
                  </div>

                  {/* Strategy Access */}
                  <div className="flex flex-col gap-2">
                    <label htmlFor="strategyAccess" className="text-sm font-semibold text-gray-900 dark:text-white leading-none">Strategy Access</label>
                    <select
                      id="strategyAccess"
                      name="strategyAccess"
                      value={formData.strategyAccess}
                      onChange={handleChange}
                      className="select-field w-full text-sm"
                    >
                      <option value="NONE">No Access</option>
                      <option value="READ">Read Only (View strategy)</option>
                      <option value="EDIT">Full Edit (Manage strategy)</option>
                    </select>
                    <span className="text-xs text-gray-500 dark:text-gray-400">Determines visibility and control over Quarters and Objectives</span>
                  </div>
                </div>

                {/* Status */}
                <div>
                  <label htmlFor="status" className="form-label">
                    Status *
                  </label>
                  <select
                    id="status"
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                    className="select-field w-full"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="AWAY">Away</option>
                    <option value="OFFLINE">Offline</option>
                    <option value="RETIRED">Retired</option>
                  </select>
                </div>

                {/* Reset Password Button */}
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    className="w-full btn-secondary"
                    disabled={isLoading}
                  >
                    Reset Password
                  </button>
                </div>

      </div>
    </FormDialog>
  )
}

export default EditUserModal
