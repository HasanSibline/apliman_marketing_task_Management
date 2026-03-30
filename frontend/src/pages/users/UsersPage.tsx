import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { 
  PlusIcon, 
  UserIcon, 
  PencilIcon, 
  TrashIcon, 
  KeyIcon,
  EllipsisVerticalIcon,
  UserGroupIcon
} from '@heroicons/react/24/outline'
import { Menu } from '@headlessui/react'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { fetchUsers } from '@/store/slices/usersSlice'
import api, { usersApi } from '@/services/api'
import Avatar from '@/components/common/Avatar'

import ActionModal from '@/components/ui/ActionModal'
import toast from 'react-hot-toast'
import CreateUserModal from '@/components/users/CreateUserModal'
import EditUserModal from '@/components/users/EditUserModal'
import DepartmentsManagement from '@/components/users/DepartmentsManagement'
import TeamsManagement from '@/components/users/TeamsManagement'

type Tab = 'users' | 'departments' | 'teams'

const UsersPage: React.FC = () => {
  const dispatch = useAppDispatch()
  const { users, isLoading } = useAppSelector((state) => state.users)
  const { user } = useAppSelector((state) => state.auth)
  const [activeTab, setActiveTab] = useState<Tab>('users')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedUser, setSelectedUser] = useState<any>(null)
  const [companyName, setCompanyName] = useState<string>('Your Company')
  
  // Tactical Modal State
  const [actionModal, setActionModal] = useState<{
    isOpen: boolean;
    type: 'delete' | 'reset_password';
    title: string;
    description: string;
    targetId?: string;
  }>({
    isOpen: false,
    type: 'delete',
    title: '',
    description: '',
  })

  useEffect(() => {
    if (activeTab === 'users') {
      dispatch(fetchUsers({}))
    }
  }, [dispatch, activeTab])

  useEffect(() => {
    const fetchCompanyDetails = async () => {
      if (!user?.companyId) return

      try {
        const response = await api.get('/companies/my-company')
        setCompanyName(response.data?.name ?? 'Your Company')
      } catch (error) {
        console.error('Failed to fetch company details:', error)
      }
    }

    fetchCompanyDetails()
  }, [user?.companyId])

  const handleEdit = (user: any) => {
    setSelectedUser(user)
    setShowEditModal(true)
  }

  const handleDelete = (user: any) => {
    setSelectedUser(user)
    setActionModal({
      isOpen: true,
      type: 'delete',
      title: 'Strategic Personnel Deletion',
      description: `SYSTEM REMOVAL: Are you sure you want to permanently delete ${user.name}? This action is irreversible and distinct from retirement.`,
      targetId: user.id
    })
  }

  const handleResetPassword = (user: any) => {
    setSelectedUser(user)
    setActionModal({
      isOpen: true,
      type: 'reset_password',
      title: 'Credential Reset Log',
      description: `Initiate a secure password reset for ${user.name}? This will send a reset link to their verified email.`,
      targetId: user.id
    })
  }

  const handleConfirmAction = async () => {
    const { type, targetId } = actionModal
    setActionModal(p => ({ ...p, isOpen: false }))

    try {
      if (type === 'delete') {
        await usersApi.delete(targetId!)
        toast.success(`${selectedUser?.name || 'Personnel'} removed from active logs`)
        dispatch(fetchUsers({}))
      } else if (type === 'reset_password') {
        await usersApi.resetPassword(targetId!)
        toast.success('Credential reset broadcasted successfully')
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Operation synchronization failure')
    }
  }

  const canManageUser = (targetUser: any) => {
    if (!user) return false

    if (user.role === 'SUPER_ADMIN') {
      return true
    }

    if (user.role === 'COMPANY_ADMIN') {
      if (targetUser.role === 'SUPER_ADMIN') return false
      if (user.companyId && targetUser.companyId && user.companyId !== targetUser.companyId) return false
      return true
    }

    if (user.role === 'ADMIN') {
      if (user.companyId && targetUser.companyId && user.companyId !== targetUser.companyId) return false
      return targetUser.role === 'EMPLOYEE' || targetUser.role === 'MANAGER'
    }

    return false
  }

  const statusColors = {
    ACTIVE: 'bg-green-100 text-green-800',
    AWAY: 'bg-yellow-100 text-yellow-800',
    OFFLINE: 'bg-gray-100 text-gray-800',
    RETIRED: 'bg-rose-100 text-rose-800 border border-rose-100',
  }

  const roleColors: Record<string, string> = {
    SUPER_ADMIN: 'bg-purple-100 text-purple-800',
    COMPANY_ADMIN: 'bg-indigo-100 text-indigo-800',
    ADMIN: 'bg-blue-100 text-blue-800',
    MANAGER: 'bg-primary-100 text-primary-700 border border-primary-100 shadow-sm shadow-primary-50',
    EMPLOYEE: 'bg-gray-100 text-gray-800',
  }

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'SUPER_ADMIN':
        return 'Platform Administrator'
      case 'COMPANY_ADMIN':
        return 'System Administrator'
      case 'ADMIN':
        return `${companyName} Admin`
      case 'MANAGER':
        return 'Department Manager'
      case 'EMPLOYEE':
        return 'Employee'
      default:
        return role
    }
  }

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'users', label: 'Users', icon: UserIcon },
    { id: 'departments', label: 'Departments', icon: UserGroupIcon },
    { id: 'teams', label: 'Teams', icon: UserGroupIcon },
  ]

  return (
    <div className="space-y-6">
      {/* Strategic Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight font-outfit">Identity & Logistics</h1>
          <p className="text-[10px] font-black text-gray-400 mt-1 uppercase tracking-[0.2em] italic underline decoration-gray-100 italic">
            Company Personnel Hub & Tactical Structure
          </p>
        </div>
        
        {/* Tab Selection Facility */}
        <div className="flex p-1 bg-gray-50 border border-gray-100 rounded-xl w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center px-6 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${
                activeTab === tab.id
                  ? 'bg-white text-primary-600 border border-gray-100'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <tab.icon className="h-4 w-4 mr-2" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'users' && (
        <div className="flex justify-end">
          {(user?.role === 'SUPER_ADMIN' || user?.role === 'COMPANY_ADMIN' || user?.role === 'ADMIN') && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-3 bg-primary-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary-700 flex items-center transition-all"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              Onboard Personnel
            </button>
          )}
        </div>
      )}

      {activeTab === 'users' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {isLoading ? (
            <div className="col-span-full flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : users.length === 0 ? (
            <div className="col-span-full text-center py-8">
              <p className="text-gray-500">No users found</p>
            </div>
          ) : (
            users.map((userItem: any, index: number) => (
              <motion.div
                key={userItem.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                className="bg-white rounded-2xl border border-gray-100 p-6 flex flex-col justify-between hover:border-primary-100 transition-all font-outfit"
              >
                <div className="flex items-center space-x-4">
                  <Avatar
                    src={userItem.avatar}
                    name={userItem.name}
                    className="h-12 w-12 border-4 border-primary-50"
                    size="md"
                    rounded="2xl"
                  />
                  <div className="flex-1">
                    <h3 className="text-lg font-black text-gray-900 tracking-tight uppercase">
                      {userItem.name}
                    </h3>
                    <p className="text-gray-600">{userItem.email}</p>
                    {userItem.position && (
                      <p className="text-sm text-gray-500">{userItem.position}</p>
                    )}
                    {userItem.department && (
                      <p className="text-xs text-primary-600 font-medium">{userItem.department.name}</p>
                    )}
                  </div>
                  {canManageUser(userItem) && (
                    <Menu as="div" className="relative">
                      <Menu.Button className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <EllipsisVerticalIcon className="h-5 w-5 text-gray-500" />
                      </Menu.Button>
                      <Menu.Items className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border border-gray-200 focus:outline-none z-10">
                        <div className="py-1">
                          <Menu.Item>
                            {({ active }) => (
                              <button
                                onClick={() => handleEdit(userItem)}
                                className={`${
                                  active ? 'bg-gray-100' : ''
                                } flex items-center w-full px-4 py-2 text-sm text-gray-700`}
                              >
                                <PencilIcon className="h-4 w-4 mr-3" />
                                Edit User
                              </button>
                            )}
                          </Menu.Item>
                          <Menu.Item>
                            {({ active }) => (
                              <button
                                onClick={() => handleResetPassword(userItem)}
                                className={`${
                                  active ? 'bg-gray-100' : ''
                                } flex items-center w-full px-4 py-2 text-sm text-gray-700`}
                              >
                                <KeyIcon className="h-4 w-4 mr-3" />
                                Reset Password
                              </button>
                            )}
                          </Menu.Item>
                          <Menu.Item>
                            {({ active }) => (
                              <button
                                onClick={() => handleDelete(userItem)}
                                className={`${
                                  active ? 'bg-gray-100' : ''
                                } flex items-center w-full px-4 py-2 text-sm text-red-600`}
                              >
                                <TrashIcon className="h-4 w-4 mr-3" />
                                Delete User
                              </button>
                            )}
                          </Menu.Item>
                        </div>
                      </Menu.Items>
                    </Menu>
                  )}
                </div>
                
                <div className="mt-4 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className={`status-badge ${roleColors[userItem.role] || 'bg-gray-100 text-gray-800'}`}>
                      {getRoleLabel(userItem.role)}
                    </span>
                    <span className={`status-badge ${statusColors[userItem.status as keyof typeof statusColors]}`}>
                      {userItem.status}
                    </span>
                    {userItem.strategyAccess && userItem.strategyAccess !== 'NONE' && (
                      <span className={`status-badge ${userItem.strategyAccess === 'EDIT' ? 'bg-amber-100 text-amber-800' : 'bg-blue-50 text-blue-700'}`}>
                        Strategy {userItem.strategyAccess === 'EDIT' ? 'Admin' : 'Reader'}
                      </span>
                    )}
                  </div>
                  
                  <div className="text-sm text-gray-500">
                    {userItem._count && (
                      <span>{userItem._count.assignedTasks} tasks</span>
                    )}
                  </div>
                </div>
                
                <div className="mt-4 text-xs text-gray-500">
                  Joined {new Date(userItem.createdAt).toLocaleDateString()}
                </div>
              </motion.div>
            ))
          )}
        </div>
      ) : activeTab === 'departments' ? (
        <DepartmentsManagement />
      ) : (
        <TeamsManagement />
      )}

      {/* Create User Modal */}
      <CreateUserModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        companyName={companyName}
      />

      {/* Edit User Modal */}
      {selectedUser && (
        <EditUserModal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false)
            setSelectedUser(null)
          }}
          user={selectedUser}
          companyName={companyName}
        />
      )}

      <ActionModal
        isOpen={actionModal.isOpen}
        onClose={() => setActionModal(p => ({ ...p, isOpen: false }))}
        onConfirm={handleConfirmAction}
        title={actionModal.title}
        description={actionModal.description}
        variant={actionModal.type === 'delete' ? 'danger' : 'info'}
        confirmText={actionModal.type === 'delete' ? 'Delete Permanently' : 'Reset Credentials'}
      />
    </div>
  )
}

export default UsersPage
