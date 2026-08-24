import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { changePassword, updateUser } from '@/store/slices/authSlice'
import { usersApi, filesApi } from '@/services/api'
import Avatar from '@/components/common/Avatar'

import toast from 'react-hot-toast'

const profileSchema = yup.object({
  name: yup.string().required('Name is required'),
  email: yup.string().email('Invalid email').required('Email is required'),
  position: yup.string(),
})

const passwordSchema = yup.object({
  oldPassword: yup.string().required('Current password is required'),
  newPassword: yup.string().min(8, 'Password must be at least 8 characters').required('New password is required'),
  confirmPassword: yup.string()
    .oneOf([yup.ref('newPassword')], 'Passwords must match')
    .required('Confirm password is required'),
})

type ProfileFormData = yup.InferType<typeof profileSchema>
type PasswordFormData = yup.InferType<typeof passwordSchema>

/** The same wording the rest of the app uses for a role. */
const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'Platform Administrator',
  COMPANY_ADMIN: 'System Administrator',
  ADMIN: 'Administrator',
  MANAGER: 'Department Manager',
  EMPLOYEE: 'Employee',
}

const ProfilePage: React.FC = () => {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { user, isLoading } = useAppSelector((state) => state.auth)
  const [activeTab, setActiveTab] = useState<'profile' | 'password'>('profile')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [showPasswords, setShowPasswords] = useState({
    old: false,
    new: false,
    confirm: false,
  })

  const profileForm = useForm<ProfileFormData>({
    resolver: yupResolver(profileSchema),
    defaultValues: {
      name: user?.name || '',
      email: user?.email || '',
      position: user?.position || '',
    },
  })

  const passwordForm = useForm<PasswordFormData>({
    resolver: yupResolver(passwordSchema),
  })

  // defaultValues are captured on the first render only. On a cold start the profile
  // arrives after mount, and the fields sat empty until someone reloaded the page.
  useEffect(() => {
    if (!user) return
    profileForm.reset({
      name: user.name ?? '',
      email: user.email ?? '',
      position: user.position ?? '',
    })
  }, [user?.id, user?.name, user?.email, user?.position])

  /**
   * This form's own in-flight flag.
   *
   * The submit button was wired to `isLoading` off the auth slice, which only the
   * login, getMe and changePassword thunks ever set. This save calls
   * `usersApi.updateProfile` directly and never touches redux, so the button never
   * disabled and never said "Updating", and stayed clickable for the whole request.
   * The shared flag was wrong in the other direction too: submitting the password
   * form disabled this button, on a form that was not being submitted.
   */
  const [savingProfile, setSavingProfile] = useState(false)

  const onProfileSubmit = async (data: ProfileFormData) => {
    setSavingProfile(true)
    try {
      const updatedUser = await usersApi.updateProfile(data)
      dispatch(updateUser(updatedUser))
      toast.success('Profile updated successfully!')
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update profile')
    } finally {
      setSavingProfile(false)
    }
  }

  const onPasswordSubmit = async (data: PasswordFormData) => {
    // Cleared on the next line regardless of outcome, so a wrong current password
    // took the error toast and the typed input with it. Only a success empties it.
    const result = await dispatch(changePassword({
      oldPassword: data.oldPassword,
      newPassword: data.newPassword,
    }))

    if (changePassword.fulfilled.match(result)) passwordForm.reset()
  }

  const togglePasswordVisibility = (field: 'old' | 'new' | 'confirm') => {
    setShowPasswords(prev => ({
      ...prev,
      [field]: !prev[field],
    }))
  }

  const onAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Checked here rather than only by the accept attribute, which is a filter on the
    // file picker and not a rule: dragging or a mobile picker gets past it. Rejecting
    // a 20MB photo now beats uploading it and failing after the wait.
    if (!file.type.startsWith('image/')) {
      toast.error('Choose an image file.')
      e.target.value = ''
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('That image is over 5MB. Please choose a smaller one.')
      e.target.value = ''
      return
    }

    setUploadingAvatar(true)
    try {
      const result = await filesApi.uploadAvatar(file)
      dispatch(updateUser({ avatar: result.avatar }))
      toast.success('Photo updated')
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Could not upload that photo')
    } finally {
      setUploadingAvatar(false)
      // Without this, choosing the same file twice in a row fires no change event.
      e.target.value = ''
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition"
      >
        <ArrowLeftIcon className="h-4 w-4 mr-2" />
        Back
      </button>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card overflow-hidden"
      >
        <div className="flex items-center space-x-6 p-2">
          <div className="relative group">
              <Avatar
                src={user?.avatar}
                name={user?.name}
                className="h-24 w-24 border-4 border-gray-50 dark:border-gray-700 shadow-lg"
                size="lg"
                rounded="2xl"
              />
              <label
                className={`absolute inset-0 flex items-center justify-center rounded-xl text-white transition-opacity ${
                  uploadingAvatar
                    ? 'bg-black/60 opacity-100'
                    : 'cursor-pointer bg-black/40 opacity-0 group-hover:opacity-100 focus-within:opacity-100'
                }`}
              >
                <span className="text-xs font-semibold tracking-wide">
                  {uploadingAvatar ? 'Uploading…' : 'Update'}
                </span>
                <input
                  type="file"
                  className="sr-only"
                  accept="image/*"
                  disabled={uploadingAvatar}
                  onChange={onAvatarChange}
                  aria-label="Upload a profile photo"
                />
              </label>
          </div>

          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white tracking-tight">{user?.name}</h1>
            <p className="text-gray-500 dark:text-gray-400 font-bold text-sm tracking-tight">{user?.email}</p>
            {/* What this account actually is. All of it was already on the user
                object, and the users table showed a colleague more about you than
                your own profile did. */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="status-badge bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                {ROLE_LABEL[user?.role ?? ''] ?? user?.role?.replace('_', ' ')}
              </span>
              {user?.position && (
                <span className="status-badge bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                  {user.position}
                </span>
              )}
              {user?.strategyAccess && user.strategyAccess !== 'NONE' && (
                <span className="status-badge bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                  Strategy {user.strategyAccess === 'EDIT' ? 'Admin' : 'Reader'}
                </span>
              )}
              <span
                className={`status-badge ${
                  user?.isMicrosoftSynced
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                }`}
              >
                {user?.isMicrosoftSynced ? 'Microsoft connected' : 'Microsoft not connected'}
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('profile')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'profile'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
          >
            Profile Information
          </button>
          <button
            onClick={() => setActiveTab('password')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'password'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
          >
            Change Password
          </button>
        </nav>
      </div>

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="card"
        >
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Profile Information</h2>
          <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                  Full Name
                </label>
                <input
                  {...profileForm.register('name')}
                  className={`input-field ${profileForm.formState.errors.name ? 'border-red-300' : ''}`}
                  placeholder="Enter your full name"
                />
                {profileForm.formState.errors.name && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    {profileForm.formState.errors.name.message}
                  </p>
                )}
              </div>

              {/* Read-only, because the server has always discarded it: PATCH /users/me
                  keeps only name and position. An editable box that saves nothing and
                  then reports success is worse than no box, and this one also carries
                  the address people sign in with, which cannot change without a way to
                  prove the new one belongs to them. */}
              <div>
                <label htmlFor="profile-email" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                  Email address
                </label>
                <input
                  id="profile-email"
                  type="email"
                  value={user?.email ?? ''}
                  readOnly
                  disabled
                  className="input-field cursor-not-allowed opacity-70"
                />
                <p className="form-hint">
                  This is the address you sign in with. Ask an administrator to change it.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                  Position
                </label>
                <input
                  {...profileForm.register('position')}
                  className="input-field"
                  placeholder="Enter your position"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                  Role
                </label>
                <input
                  value={user?.role?.replace('_', ' ') || ''}
                  disabled
                  className="input-field bg-gray-50 dark:bg-gray-900/40 text-gray-500 dark:text-gray-400"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Role cannot be changed. Contact your administrator.
                </p>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingProfile}
                className="btn-primary"
              >
                {savingProfile ? 'Updating…' : 'Update Profile'}
              </button>
            </div>
          </form>
        </motion.div>
      )}

      {/* Password Tab */}
      {activeTab === 'password' && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="card"
        >
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Change Password</h2>
          <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                Current Password
              </label>
              <div className="relative">
                <input
                  {...passwordForm.register('oldPassword')}
                  type={showPasswords.old ? 'text' : 'password'}
                  className={`input-field pr-10 ${passwordForm.formState.errors.oldPassword ? 'border-red-300' : ''}`}
                  placeholder="Enter your current password"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => togglePasswordVisibility('old')}
                >
                  {showPasswords.old ? (
                    <EyeSlashIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                  ) : (
                    <EyeIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                  )}
                </button>
              </div>
              {passwordForm.formState.errors.oldPassword && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                  {passwordForm.formState.errors.oldPassword.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                New Password
              </label>
              <div className="relative">
                <input
                  {...passwordForm.register('newPassword')}
                  type={showPasswords.new ? 'text' : 'password'}
                  className={`input-field pr-10 ${passwordForm.formState.errors.newPassword ? 'border-red-300' : ''}`}
                  placeholder="Enter your new password"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => togglePasswordVisibility('new')}
                >
                  {showPasswords.new ? (
                    <EyeSlashIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                  ) : (
                    <EyeIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                  )}
                </button>
              </div>
              {passwordForm.formState.errors.newPassword && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                  {passwordForm.formState.errors.newPassword.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  {...passwordForm.register('confirmPassword')}
                  type={showPasswords.confirm ? 'text' : 'password'}
                  className={`input-field pr-10 ${passwordForm.formState.errors.confirmPassword ? 'border-red-300' : ''}`}
                  placeholder="Confirm your new password"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => togglePasswordVisibility('confirm')}
                >
                  {showPasswords.confirm ? (
                    <EyeSlashIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                  ) : (
                    <EyeIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                  )}
                </button>
              </div>
              {passwordForm.formState.errors.confirmPassword && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                  {passwordForm.formState.errors.confirmPassword.message}
                </p>
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary"
              >
                {isLoading ? 'Changing...' : 'Change Password'}
              </button>
            </div>
          </form>
        </motion.div>
      )}
    </div>
  )
}

export default ProfilePage