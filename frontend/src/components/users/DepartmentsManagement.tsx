import React, { useState, useEffect } from 'react'
import { PlusIcon, UserGroupIcon, UserIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline'
import api from '@/services/api'
import { toast } from 'react-hot-toast'

import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { fetchUsers } from '@/store/slices/usersSlice'
import ActionModal from '@/components/ui/ActionModal'

const DepartmentsManagement: React.FC = () => {
  const dispatch = useAppDispatch()
  const { users: availableUsers } = useAppSelector((state) => state.users)
  const [departments, setDepartments] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newDeptName, setNewDeptName] = useState('')
  const [selectedManagerId, setSelectedManagerId] = useState('')
  const [actionModal, setActionModal] = useState<{
    isOpen: boolean;
    variant: 'danger' | 'warning' | 'info' | 'success';
    title: string;
    description: string;
    targetId?: string;
  }>({
    isOpen: false,
    variant: 'info',
    title: '',
    description: ''
  })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setIsLoading(true)
    try {
      // allSettled: the users thunk failing is no reason to claim this company has
      // no departments, which invites someone to create a duplicate of one that is
      // sitting there perfectly fine.
      const [deptsRes] = await Promise.allSettled([
        api.get('/departments'),
        dispatch(fetchUsers({})).unwrap()
      ])

      if (deptsRes.status === 'fulfilled') {
        setDepartments(deptsRes.value.data ?? [])
        setLoadFailed(false)
      } else {
        setLoadFailed(true)
        toast.error('Could not load departments')
      }
    } catch (error) {
      setLoadFailed(true)
      toast.error('Could not load departments')
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

  const [newCategory, setNewCategory] = useState<Record<string, string>>({})

  const saveCategories = async (dept: any, next: string[]) => {
    try {
      await api.patch(`/departments/${dept.id}`, { ticketCategories: next })
      setDepartments((prev: any[]) =>
        prev.map((d) => (d.id === dept.id ? { ...d, ticketCategories: next } : d)),
      )
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Could not save those request types')
    }
  }

  const handleDelete = (id: string) => {
    setActionModal({
      isOpen: true,
      variant: 'danger',
      title: 'Decommission Department',
      description: 'Are you sure you want to permanently delete this organizational department? This action cannot be reversed.',
      targetId: id
    })
  }

  const confirmDelete = async () => {
    if (!actionModal.targetId) return
    try {
      await api.delete(`/departments/${actionModal.targetId}`)
      toast.success('Department deleted')
      fetchData()
    } catch (error) {
      toast.error('Failed to delete department')
    } finally {
      setActionModal(prev => ({ ...prev, isOpen: false }))
    }
  }

  if (isLoading) return <div className="text-center py-8">Loading departments...</div>

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Departments</h2>
        <button onClick={() => setShowCreateModal(true)} className="btn-primary">
          <PlusIcon className="h-4 w-4 mr-2" />
          Add Department
        </button>
      </div>

      {/* An empty list and a failed request rendered identically: both showed
          nothing at all, so "none created yet" was indistinguishable from "the
          request failed", and the only clue was a toast that had already gone. */}
      {loadFailed ? (
        <div className="surface px-6 py-12 text-center">
          <p className="text-sm font-medium text-gray-900 dark:text-white">Could not load departments</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500 dark:text-gray-400">
            Nothing is missing, we just could not reach the server. Try again in a moment.
          </p>
        </div>
      ) : departments.length === 0 ? (
        <div className="surface px-6 py-12 text-center">
          <p className="text-sm font-medium text-gray-900 dark:text-white">No departments yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500 dark:text-gray-400">
            A department groups people so a request can be routed to a team rather than to one person.
          </p>
        </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {departments.map((dept) => (
          <div key={dept.id} className="card p-4 border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <UserGroupIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white">{dept.name}</h3>
                  <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center mt-1">
                    <UserIcon className="h-3 w-3 mr-1" />
                    {dept.manager?.name || 'No Manager Assigned'}
                  </div>
                </div>
              </div>
              <button 
                onClick={() => handleDelete(dept.id)}
                className="p-1 text-gray-500 dark:text-gray-400 hover:text-red-600 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-50 dark:border-gray-700">
              <div className="flex justify-between items-center text-sm text-gray-600 dark:text-gray-300">
                <span>Team Members</span>
                <span className="font-semibold">{dept.users?.length || 0}</span>
              </div>
            </div>

            {/* What this department can be asked for. One list used to serve every
                department, so Finance was offered "QA / Bug" and Design was offered
                "Purchase Order". Set here, and only these appear when someone raises
                a ticket against this department. */}
            <div className="mt-3 border-t border-gray-50 pt-3 dark:border-gray-700">
              <p className="eyebrow mb-2">Request types</p>

              {dept.ticketCategories?.length ? (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {dept.ticketCategories.map((c: string) => (
                    <span
                      key={c}
                      className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-200"
                    >
                      {c}
                      <button
                        onClick={() => saveCategories(dept, dept.ticketCategories.filter((x: string) => x !== c))}
                        aria-label={`Remove ${c}`}
                        className="text-gray-400 hover:text-red-600"
                      >
                        <XMarkIcon className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                  Not set yet, so people raising a ticket here see a general list.
                </p>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  const value = (newCategory[dept.id] ?? '').trim()
                  if (!value) return
                  saveCategories(dept, [...(dept.ticketCategories ?? []), value])
                  setNewCategory((p) => ({ ...p, [dept.id]: '' }))
                }}
                className="flex gap-2"
              >
                <input
                  value={newCategory[dept.id] ?? ''}
                  onChange={(e) => setNewCategory((p) => ({ ...p, [dept.id]: e.target.value }))}
                  placeholder="Add a request type"
                  aria-label={`Add a request type for ${dept.name}`}
                  className="input-field py-1.5 text-xs"
                />
                <button type="submit" className="btn-secondary shrink-0 px-3 py-1.5 text-xs">
                  Add
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">Create Department</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">Department Name</label>
                <input 
                  type="text" 
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                  className="input-field mt-1" 
                  placeholder="e.g. Sales, Development" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">Manager (Optional)</label>
                <select 
                  value={selectedManagerId}
                  onChange={(e) => setSelectedManagerId(e.target.value)}
                  className="input-field mt-1"
                >
                  <option value="">Select a manager</option>
                  {availableUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancel</button>
              <button onClick={handleCreate} className="btn-primary">Create</button>
            </div>
          </div>
        </div>
      )}

      <ActionModal
        isOpen={actionModal.isOpen}
        onClose={() => setActionModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDelete}
        title={actionModal.title}
        description={actionModal.description}
        variant={actionModal.variant}
      />
    </div>
  )
}

export default DepartmentsManagement
