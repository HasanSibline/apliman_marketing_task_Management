import React, { useEffect, useState } from 'react'
import ResetPasswordModal from '@/components/users/ResetPasswordModal'
import { confirmDialog } from '@/components/ui/confirm'
import { 
  PlusIcon, 
  UserIcon, 
  PencilIcon, 
  TrashIcon, 
  KeyIcon,
  EllipsisVerticalIcon,
  LinkSlashIcon,
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
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedUser, setSelectedUser] = useState<any>(null)
  const [companyName, setCompanyName] = useState<string>('Your Company')
  
  // Confirmation dialog state
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
      title: 'Delete this user?',
      description: `${user.name} is removed permanently, along with their access. Their completed work stays on record. To keep the account but revoke access, set their status to Retired instead.`,
      targetId: user.id
    })
  }

  /**
   * Set the password directly rather than mailing a link.
   *
   * The confirmation this replaced promised "a reset link to their verified email",
   * which is a promise about email delivery that nothing here can keep, and it left
   * the admin with no way to tell whether it had worked. Typing the password means
   * the admin knows the credential and can hand it over, which is what actually
   * happens in a company anyway.
   *
   * The dialog it opens was already written and simply had nothing calling it.
   */
  const handleResetPassword = (user: any) => {
    setSelectedUser(user)
    setResetPasswordOpen(true)
  }

  /**
   * Release a Microsoft link on someone's behalf.
   *
   * The link is unique to one account, so a person who has left, or who connected an
   * account a colleague now needs, blocks that Microsoft account for everyone. Before
   * this the only way to free it was editing the database.
   */
  const handleDisconnectMicrosoft = async (target: any) => {
    if (!(await confirmDialog({
      title: `Disconnect Microsoft for ${target.name}?`,
      description:
        'Their meetings stop syncing and the Microsoft account becomes free for someone else to connect. Nothing already in Aura is removed, and they can reconnect themselves.',
      confirmText: 'Disconnect',
      variant: 'warning',
    }))) return

    try {
      const { data } = await api.post(`/microsoft/disconnect/${target.id}`)
      toast.success(data?.message ?? 'Microsoft disconnected')
      dispatch(fetchUsers({}))
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Could not disconnect that account')
    }
  }

  const handleConfirmAction = async () => {
    const { type, targetId } = actionModal
    setActionModal(p => ({ ...p, isOpen: false }))

    try {
      if (type === 'delete') {
        await usersApi.delete(targetId!)
        toast.success(`${selectedUser?.name || 'User'} removed`)
        dispatch(fetchUsers({}))
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Something went wrong. Please try again.')
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
    ACTIVE: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
    AWAY: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300',
    OFFLINE: 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100',
    RETIRED: 'bg-rose-100 text-rose-800 border border-rose-100',
  }

  const roleColors: Record<string, string> = {
    SUPER_ADMIN: 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300',
    COMPANY_ADMIN: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300',
    ADMIN: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
    MANAGER: 'bg-primary-100 text-primary-700 border border-primary-100 shadow-sm shadow-primary-50',
    EMPLOYEE: 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100',
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
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="page-title">Users</h1>
          <p className="page-subtitle">
            People in your company, the departments they sit in, and the teams they work in.
          </p>
        </div>
        
        {/* Tabs */}
        <div role="group" aria-label="Section" className="surface-muted inline-flex w-fit p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              aria-pressed={activeTab === tab.id}
              className={`flex items-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
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
              className="btn-primary"
            >
              <PlusIcon className="mr-2 h-4 w-4" />
              Add user
            </button>
          )}
        </div>
      )}

      {activeTab === 'users' ? (
        /*
         * A table, not cards. This is the same six facts about every person, and a
         * grid of cards makes six facts look like six different shapes: the eye has to
         * re-find the task count in each one. Columns let a name be read against a
         * name and a number against a number, which is the reason anyone opens this
         * page. It also stops costing a full card of height per person.
         */
        <div className="surface overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-600" />
            </div>
          ) : users.length === 0 ? (
            <p className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">No users found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    {['Name', 'Role', 'Status', 'Department', 'Tasks', 'Joined'].map((head) => (
                      <th
                        key={head}
                        scope="col"
                        className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 ${
                          head === 'Tasks' ? 'text-right' : 'text-left'
                        }`}
                      >
                        {head}
                      </th>
                    ))}
                    <th scope="col" className="px-4 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {users.map((userItem: any) => (
                    <tr
                      key={userItem.id}
                      className="border-b border-gray-100 last:border-0 hover:bg-gray-50 dark:border-gray-700/60 dark:hover:bg-gray-700/30"
                    >
                      {/* One cell for identity: a name, the address it belongs to and
                          the job title are one fact about a person, not three. */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar
                            src={userItem.avatar}
                            name={userItem.name}
                            className="h-9 w-9 shrink-0"
                            size="sm"
                            rounded="xl"
                          />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-gray-900 dark:text-white">
                              {userItem.name}
                            </p>
                            <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                              {userItem.email}
                            </p>
                            {userItem.position && (
                              <p className="truncate text-xs text-gray-400 dark:text-gray-500">
                                {userItem.position}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`status-badge ${roleColors[userItem.role] || 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100'}`}>
                            {getRoleLabel(userItem.role)}
                          </span>
                          {userItem.strategyAccess && userItem.strategyAccess !== 'NONE' && (
                            <span
                              className={`status-badge ${
                                userItem.strategyAccess === 'EDIT'
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                                  : 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                              }`}
                            >
                              Strategy {userItem.strategyAccess === 'EDIT' ? 'Admin' : 'Reader'}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <span className={`status-badge ${statusColors[userItem.status as keyof typeof statusColors]}`}>
                          {userItem.status}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                        {userItem.department?.name ?? <span className="text-gray-400">Not set</span>}
                      </td>

                      <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-200">
                        {userItem._count?.assignedTasks ?? 0}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 text-gray-500 dark:text-gray-400">
                        {new Date(userItem.createdAt).toLocaleDateString()}
                      </td>

                      <td className="px-4 py-3 text-right">
                        {canManageUser(userItem) && (
                          <Menu as="div" className="relative inline-block text-left">
                            <Menu.Button
                              aria-label={`Actions for ${userItem.name}`}
                              className="rounded-full p-1.5 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                              <EllipsisVerticalIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                            </Menu.Button>
                            <Menu.Items className="absolute right-0 z-20 mt-2 w-52 rounded-lg border border-gray-200 bg-white py-1 shadow-lg focus:outline-none dark:border-gray-700 dark:bg-gray-800">
                              <Menu.Item>
                                {({ active }) => (
                                  <button
                                    onClick={() => handleEdit(userItem)}
                                    className={`flex w-full items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-200 ${active ? 'bg-gray-100 dark:bg-gray-700' : ''}`}
                                  >
                                    <PencilIcon className="mr-3 h-4 w-4" />
                                    Edit user
                                  </button>
                                )}
                              </Menu.Item>
                              <Menu.Item>
                                {({ active }) => (
                                  <button
                                    onClick={() => handleResetPassword(userItem)}
                                    className={`flex w-full items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-200 ${active ? 'bg-gray-100 dark:bg-gray-700' : ''}`}
                                  >
                                    <KeyIcon className="mr-3 h-4 w-4" />
                                    Set a password
                                  </button>
                                )}
                              </Menu.Item>
                              {userItem.isMicrosoftSynced && (
                                <Menu.Item>
                                  {({ active }) => (
                                    <button
                                      onClick={() => handleDisconnectMicrosoft(userItem)}
                                      className={`flex w-full items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-200 ${active ? 'bg-gray-100 dark:bg-gray-700' : ''}`}
                                    >
                                      <LinkSlashIcon className="mr-3 h-4 w-4" />
                                      Disconnect Microsoft
                                    </button>
                                  )}
                                </Menu.Item>
                              )}
                              <Menu.Item>
                                {({ active }) => (
                                  <button
                                    onClick={() => handleDelete(userItem)}
                                    className={`flex w-full items-center px-4 py-2 text-sm text-red-600 dark:text-red-400 ${active ? 'bg-gray-100 dark:bg-gray-700' : ''}`}
                                  >
                                    <TrashIcon className="mr-3 h-4 w-4" />
                                    Delete user
                                  </button>
                                )}
                              </Menu.Item>
                            </Menu.Items>
                          </Menu>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

      {selectedUser && (
        <ResetPasswordModal
          isOpen={resetPasswordOpen}
          onClose={() => {
            setResetPasswordOpen(false)
            setSelectedUser(null)
          }}
          user={selectedUser}
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
