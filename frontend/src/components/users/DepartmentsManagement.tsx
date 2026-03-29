import React, { useState, useEffect } from 'react'
import { PlusIcon, UserGroupIcon, UserIcon, TrashIcon } from '@heroicons/react/24/outline'
import api from '@/services/api'
import { toast } from 'react-hot-toast'

import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { fetchUsers } from '@/store/slices/usersSlice'

const DepartmentsManagement: React.FC = () => {
  const dispatch = useAppDispatch()
  const { users: availableUsers } = useAppSelector((state) => state.users)
  const [departments, setDepartments] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newDeptName, setNewDeptName] = useState('')
  const [selectedManagerId, setSelectedManagerId] = useState('')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const [deptsRes] = await Promise.all([
        api.get('/departments'),
        dispatch(fetchUsers({})).unwrap()
      ])
      setDepartments(deptsRes.data)
    } catch (error) {
      toast.error('Failed to fetch departments data')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!newDeptName) return
    try {
      await api.post('/departments', {
        name: newDeptName,
        managerId: selectedManagerId || undefined
      })
      toast.success('Department created')
      setNewDeptName('')
      setSelectedManagerId('')
      setShowCreateModal(false)
      fetchData()
    } catch (error) {
      toast.error('Failed to create department')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this department?')) return
    try {
      await api.delete(`/departments/${id}`)
      toast.success('Department deleted')
      fetchData()
    } catch (error) {
      toast.error('Failed to delete department')
    }
  }

  if (isLoading) return <div className="text-center py-8">Loading departments...</div>

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-800">Departments</h2>
        <button onClick={() => setShowCreateModal(true)} className="btn-primary">
          <PlusIcon className="h-4 w-4 mr-2" />
          Add Department
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {departments.map((dept) => (
          <div key={dept.id} className="card p-4 border border-gray-100 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <UserGroupIcon className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">{dept.name}</h3>
                  <div className="text-sm text-gray-500 flex items-center mt-1">
                    <UserIcon className="h-3 w-3 mr-1" />
                    {dept.manager?.name || 'No Manager Assigned'}
                  </div>
                </div>
              </div>
              <button 
                onClick={() => handleDelete(dept.id)}
                className="p-1 text-gray-400 hover:text-red-600 rounded-full hover:bg-gray-100"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-50">
              <div className="flex justify-between items-center text-sm text-gray-600">
                <span>Team Members</span>
                <span className="font-semibold">{dept.users?.length || 0}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">Create Department</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Department Name</label>
                <input 
                  type="text" 
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                  className="input mt-1" 
                  placeholder="e.g. Sales, Development" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Manager (Optional)</label>
                <select 
                  value={selectedManagerId}
                  onChange={(e) => setSelectedManagerId(e.target.value)}
                  className="input mt-1"
                >
                  <option value="">Select a manager</option>
                  {availableUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={handleCreate} className="btn-primary">Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default DepartmentsManagement
