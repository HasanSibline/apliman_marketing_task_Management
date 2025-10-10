import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  UserIcon,
  CheckIcon,
  SparklesIcon,
  UserGroupIcon
} from '@heroicons/react/24/outline'
import { useAppSelector } from '@/hooks/redux'

interface UserAssignmentPickerProps {
  selectedUsers: string[]
  onUsersChange: (users: string[]) => void
  aiSuggestions?: string[]
  label?: string
  maxUsers?: number
}

const UserAssignmentPicker: React.FC<UserAssignmentPickerProps> = ({
  selectedUsers,
  onUsersChange,
  aiSuggestions = [],
  label = "Assign Team Members",
  maxUsers = 10
}) => {
  const { users } = useAppSelector((state) => state.users)
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (user.position && user.position.toLowerCase().includes(searchTerm.toLowerCase()))
    
    const matchesRole = !roleFilter || user.position?.toLowerCase().includes(roleFilter.toLowerCase())
    
    return matchesSearch && matchesRole && user.status === 'ACTIVE'
  })

  const suggestedUsers = users.filter(user => aiSuggestions.includes(user.id))
  const selectedUserObjects = users.filter(user => selectedUsers.includes(user.id))

  const toggleUser = (userId: string) => {
    if (selectedUsers.includes(userId)) {
      onUsersChange(selectedUsers.filter(id => id !== userId))
    } else if (selectedUsers.length < maxUsers) {
      onUsersChange([...selectedUsers, userId])
    }
  }

  const addSuggestedTeam = (userIds: string[]) => {
    const newUsers = [...new Set([...selectedUsers, ...userIds])]
    onUsersChange(newUsers.slice(0, maxUsers))
  }

  const clearAll = () => {
    onUsersChange([])
  }

  const roleOptions = [
    { value: '', label: 'All Roles' },
    { value: 'manager', label: 'Managers' },
    { value: 'designer', label: 'Designers' },
    { value: 'developer', label: 'Developers' },
    { value: 'writer', label: 'Writers' },
    { value: 'marketing', label: 'Marketing' },
    { value: 'analyst', label: 'Analysts' }
  ]

  const teamTemplates = [
    {
      id: 'frontend',
      name: 'Frontend Team',
      description: 'UI/UX designers and frontend developers',
      userIds: users.filter(u => 
        u.position?.toLowerCase().includes('frontend') || 
        u.position?.toLowerCase().includes('designer') ||
        u.position?.toLowerCase().includes('ui')
      ).map(u => u.id)
    },
    {
      id: 'content',
      name: 'Content Team',
      description: 'Writers, editors, and content creators',
      userIds: users.filter(u => 
        u.position?.toLowerCase().includes('writer') || 
        u.position?.toLowerCase().includes('content') ||
        u.position?.toLowerCase().includes('editor')
      ).map(u => u.id)
    },
    {
      id: 'marketing',
      name: 'Marketing Team',
      description: 'Marketing specialists and strategists',
      userIds: users.filter(u => 
        u.position?.toLowerCase().includes('marketing') || 
        u.position?.toLowerCase().includes('social')
      ).map(u => u.id)
    }
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        <span className="text-xs text-gray-500">
          {selectedUsers.length}/{maxUsers} selected
        </span>
      </div>

      {/* AI Suggestions */}
      {suggestedUsers.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-3">
            <SparklesIcon className="h-4 w-4 text-blue-600" />
            <h4 className="text-sm font-medium text-blue-900">AI Suggested Team</h4>
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {suggestedUsers.map(user => (
              <button
                key={user.id}
                onClick={() => toggleUser(user.id)}
                className={`inline-flex items-center space-x-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  selectedUsers.includes(user.id)
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-blue-700 border border-blue-300 hover:bg-blue-50'
                }`}
              >
                <UserIcon className="h-3 w-3" />
                <span>{user.name}</span>
                {user.position && <span className="text-blue-500">({user.position})</span>}
                {selectedUsers.includes(user.id) && <CheckIcon className="h-3 w-3" />}
              </button>
            ))}
          </div>
          <button
            onClick={() => addSuggestedTeam(suggestedUsers.map(u => u.id))}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            Add All Suggested
          </button>
        </div>
      )}

      {/* Selected Users */}
      {selectedUsers.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-gray-900">Selected Team Members</h4>
            <button
              onClick={clearAll}
              className="text-xs text-red-600 hover:text-red-800"
            >
              Clear All
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedUserObjects.map(user => (
              <div
                key={user.id}
                className="inline-flex items-center space-x-2 bg-green-100 text-green-800 px-3 py-1.5 rounded-full text-xs font-medium"
              >
                <UserIcon className="h-3 w-3" />
                <span>{user.name}</span>
                {user.position && <span className="text-green-600">({user.position})</span>}
                <button
                  onClick={() => toggleUser(user.id)}
                  className="text-green-600 hover:text-green-800"
                >
                  <XMarkIcon className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className="flex space-x-3">
        <div className="flex-1 relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search team members..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          {roleOptions.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
        >
          {isExpanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {/* Quick Team Templates */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {teamTemplates.map(template => (
          <button
            key={template.id}
            onClick={() => addSuggestedTeam(template.userIds)}
            className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 text-left"
          >
            <div className="flex items-center space-x-2 mb-1">
              <UserGroupIcon className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-900">{template.name}</span>
            </div>
            <p className="text-xs text-gray-600">{template.description}</p>
            <p className="text-xs text-blue-600 mt-1">{template.userIds.length} members</p>
          </button>
        ))}
      </div>

      {/* Available Users Grid */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-white border border-gray-200 rounded-lg max-h-64 overflow-y-auto">
              <div className="p-2">
                {filteredUsers.map(user => (
                  <button
                    key={user.id}
                    onClick={() => toggleUser(user.id)}
                    disabled={!selectedUsers.includes(user.id) && selectedUsers.length >= maxUsers}
                    className={`w-full flex items-center space-x-3 p-3 rounded-lg text-left transition-colors ${
                      selectedUsers.includes(user.id)
                        ? 'bg-blue-50 border border-blue-200'
                        : 'hover:bg-gray-50 border border-transparent'
                    } ${
                      !selectedUsers.includes(user.id) && selectedUsers.length >= maxUsers
                        ? 'opacity-50 cursor-not-allowed'
                        : ''
                    }`}
                  >
                    <div className="flex-shrink-0">
                      <div className="h-8 w-8 bg-gray-300 rounded-full flex items-center justify-center">
                        <span className="text-gray-700 text-sm font-medium">
                          {user.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {user.position} • {user.email}
                      </p>
                    </div>
                    {selectedUsers.includes(user.id) && (
                      <CheckIcon className="h-4 w-4 text-blue-600" />
                    )}
                  </button>
                ))}
                
                {filteredUsers.length === 0 && (
                  <p className="text-center text-gray-500 py-4">No users found</p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default UserAssignmentPicker
