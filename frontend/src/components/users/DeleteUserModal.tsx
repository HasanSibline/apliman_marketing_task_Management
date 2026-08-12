import React, { useState } from 'react'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import FormDialog from '@/components/ui/FormDialog'
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
    <FormDialog
      isOpen={isOpen}
      onClose={onClose}
      busy={isLoading}
      width="sm"
      title={`Delete ${user?.name ?? 'this person'}?`}
      description="This cannot be undone."
      icon={
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
          <ExclamationTriangleIcon className="h-5 w-5 text-red-600 dark:text-red-400" />
        </div>
      }
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary" disabled={isLoading}>
            Cancel
          </button>
          <button type="button" onClick={handleDelete} className="btn-danger" disabled={isLoading}>
            {isLoading ? 'Deleting…' : 'Delete account'}
          </button>
        </>
      }
    >
      <p className="text-sm text-gray-700 dark:text-gray-200">
        The account and everything recorded against it goes with it. Tasks currently assigned to
        {user?.name ? ` ${user.name.split(' ')[0]}` : ' them'} are left unassigned rather than deleted.
      </p>
    </FormDialog>
  )
}

export default DeleteUserModal
