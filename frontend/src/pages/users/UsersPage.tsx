import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { 
  PlusIcon, 
  UserIcon, 
  PencilIcon, 
  TrashIcon, 
  KeyIcon,
  EllipsisVerticalIcon 
} from '@heroicons/react/24/outline'
import { Menu } from '@headlessui/react'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { fetchUsers } from '@/store/slices/usersSlice'
import CreateUserModal from '@/components/users/CreateUserModal'
import EditUserModal from '@/components/users/EditUserModal'
import DeleteUserModal from '@/components/users/DeleteUserModal'
import ResetPasswordModal from '@/components/users/ResetPasswordModal'

const UsersPage: React.FC = () => {
  const dispatch = useAppDispatch()
  const { users, isLoading } = useAppSelector((state) => state.users)
  const { user } = useAppSelector((state) => state.auth)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false)
  const [selectedUser, setSelectedUser] = useState<any>(null)

  useEffect(() => {
    dispatch(fetchUsers({}))
  }, [dispatch])

  const handleEdit = (user: any) => {
    setSelectedUser(user)
    setShowEditModal(true)
  }

  const handleDelete = (user: any) => {
    setSelectedUser(user)
    setShowDeleteModal(true)
  }

  const handleResetPassword = (user: any) => {
    setSelectedUser(user)
    setShowResetPasswordModal(true)
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
      return targetUser.role === 'EMPLOYEE'
    }

    return false
  }

  const statusColors = {
    ACTIVE: 'bg-green-100 text-green-800',
    AWAY: 'bg-yellow-100 text-yellow-800',
    OFFLINE: 'bg-gray-100 text-gray-800',
    RETIRED: 'bg-red-100 text-red-800',
  }

  const roleColors: Record<string, string> = {
    SUPER_ADMIN: 'bg-purple-100 text-purple-800',
    COMPANY_ADMIN: 'bg-indigo-100 text-indigo-800',
    ADMIN: 'bg-blue-100 text-blue-800',
    EMPLOYEE: 'bg-gray-100 text-gray-800',
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-gray-600 mt-1">
            Manage team members and their roles
          </p>
        </div>
        {(user?.role === 'SUPER_ADMIN' || user?.role === 'COMPANY_ADMIN' || user?.role === 'ADMIN') && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary"
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            Add User
          </button>
        )}
      </div>

      {/* Users Grid */}
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
              className="card hover:shadow-md transition-shadow duration-200"
            >
              <div className="flex items-center space-x-4">
                <div className="h-12 w-12 rounded-full bg-primary-600 flex items-center justify-center">
                  <UserIcon className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {userItem.name}
                  </h3>
                  <p className="text-gray-600">{userItem.email}</p>
                  {userItem.position && (
                    <p className="text-sm text-gray-500">{userItem.position}</p>
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
                    {userItem.role.replace('_', ' ')}
                  </span>
                  <span className={`status-badge ${statusColors[userItem.status as keyof typeof statusColors]}`}>
                    {userItem.status}
                  </span>
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

      {/* Create User Modal */}
      <CreateUserModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
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
        />
      )}

      {/* Delete User Modal */}
      {selectedUser && (
        <DeleteUserModal
          isOpen={showDeleteModal}
          onClose={() => {
            setShowDeleteModal(false)
            setSelectedUser(null)
          }}
          user={selectedUser}
        />
      )}

      {/* Reset Password Modal */}
      {selectedUser && (
        <ResetPasswordModal
          isOpen={showResetPasswordModal}
          onClose={() => {
            setShowResetPasswordModal(false)
            setSelectedUser(null)
          }}
          user={selectedUser}
        />
      )}
    </div>
  )
}

export default UsersPage
