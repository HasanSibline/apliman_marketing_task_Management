import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { changePassword, updateUser } from '@/store/slices/authSlice'
import { usersApi, filesApi, formatAssetUrl } from '@/services/api'
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

const ProfilePage: React.FC = () => {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { user, isLoading } = useAppSelector((state) => state.auth)
  const [activeTab, setActiveTab] = useState<'profile' | 'password'>('profile')
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

  const onProfileSubmit = async (data: ProfileFormData) => {
    try {
      const updatedUser = await usersApi.updateProfile(data)
      dispatch(updateUser(updatedUser))
      toast.success('Profile updated successfully!')
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update profile')
    }
  }

  const onPasswordSubmit = (data: PasswordFormData) => {
    dispatch(changePassword({
      oldPassword: data.oldPassword,
      newPassword: data.newPassword,
    }))
    passwordForm.reset()
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

    try {
      const result = await filesApi.uploadAvatar(file)
      dispatch(updateUser({ avatar: result.avatar }))
      toast.success('Avatar updated successfully!')
    } catch (error: any) {
      toast.error('Failed to upload avatar')
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center text-sm font-medium text-gray-500 hover:text-gray-700 transition"
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
            <div className="h-24 w-24 rounded-3xl bg-primary-600 flex items-center justify-center overflow-hidden border-4 border-gray-50 shadow-lg">
              {user?.avatar ? (
                <img src={formatAssetUrl(user.avatar)} className="h-full w-full object-cover" alt={user.name} />
              ) : (
                <span className="text-3xl font-black text-white">
                  {user?.name?.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <label className="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity rounded-3xl">
              <span className="text-[10px] font-black uppercase tracking-widest">Update</span>
              <input type="file" className="hidden" accept="image/*" onChange={onAvatarChange} />
            </label>
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">{user?.name}</h1>
            <p className="text-gray-500 font-bold text-sm tracking-tight">{user?.email}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className="bg-primary-50 text-primary-700 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border border-primary-100">
                {user?.role?.replace('_', ' ')}
              </span>
              {user?.position && (
                <span className="bg-gray-50 text-gray-600 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border border-gray-100">
                  {user.position}
                </span>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('profile')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'profile'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            Profile Information
          </button>
          <button
            onClick={() => setActiveTab('password')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'password'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
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
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Profile Information</h2>
          <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Full Name
                </label>
                <input
                  {...profileForm.register('name')}
                  className={`input-field ${profileForm.formState.errors.name ? 'border-red-300' : ''}`}
                  placeholder="Enter your full name"
                />
                {profileForm.formState.errors.name && (
                  <p className="mt-1 text-sm text-red-600">
                    {profileForm.formState.errors.name.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <input
                  {...profileForm.register('email')}
                  type="email"
                  className={`input-field ${profileForm.formState.errors.email ? 'border-red-300' : ''}`}
                  placeholder="Enter your email"
                />
                {profileForm.formState.errors.email && (
                  <p className="mt-1 text-sm text-red-600">
                    {profileForm.formState.errors.email.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Position
                </label>
                <input
                  {...profileForm.register('position')}
                  className="input-field"
                  placeholder="Enter your position"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Role
                </label>
                <input
                  value={user?.role?.replace('_', ' ') || ''}
                  disabled
                  className="input-field bg-gray-50 text-gray-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Role cannot be changed. Contact your administrator.
                </p>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary"
              >
                {isLoading ? 'Updating...' : 'Update Profile'}
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
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Change Password</h2>
          <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
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
                    <EyeSlashIcon className="h-5 w-5 text-gray-400" />
                  ) : (
                    <EyeIcon className="h-5 w-5 text-gray-400" />
                  )}
                </button>
              </div>
              {passwordForm.formState.errors.oldPassword && (
                <p className="mt-1 text-sm text-red-600">
                  {passwordForm.formState.errors.oldPassword.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
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
                    <EyeSlashIcon className="h-5 w-5 text-gray-400" />
                  ) : (
                    <EyeIcon className="h-5 w-5 text-gray-400" />
                  )}
                </button>
              </div>
              {passwordForm.formState.errors.newPassword && (
                <p className="mt-1 text-sm text-red-600">
                  {passwordForm.formState.errors.newPassword.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
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
                    <EyeSlashIcon className="h-5 w-5 text-gray-400" />
                  ) : (
                    <EyeIcon className="h-5 w-5 text-gray-400" />
                  )}
                </button>
              </div>
              {passwordForm.formState.errors.confirmPassword && (
                <p className="mt-1 text-sm text-red-600">
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