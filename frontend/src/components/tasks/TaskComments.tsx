import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PaperAirplaneIcon, UserCircleIcon } from '@heroicons/react/24/outline'
import { useAppSelector } from '@/hooks/redux'
import { tasksApi, usersApi } from '@/services/api'
import toast from 'react-hot-toast'

interface TaskCommentsProps {
  taskId: string
  comments: any[]
  onCommentsUpdated: () => void
}

interface User {
  id: string
  name: string
  email: string
  position?: string
}

const TaskComments: React.FC<TaskCommentsProps> = ({ taskId, comments, onCommentsUpdated }) => {
  const { user } = useAppSelector((state) => state.auth)
  const [newComment, setNewComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [users, setUsers] = useState<User[]>([])
  const [showMentions, setShowMentions] = useState(false)
  const [mentionSearch, setMentionSearch] = useState('')
  const [mentionPosition, setMentionPosition] = useState(0)
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    try {
      const data: any = await usersApi.getAll()
      setUsers(Array.isArray(data) ? data : (data.users || []))
    } catch (error) {
      console.error('Failed to load users:', error)
    }
  }

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    const cursorPos = e.target.selectionStart
    
    setNewComment(value)

    // Check if user is typing @ mention
    const textBeforeCursor = value.slice(0, cursorPos)
    const lastAtIndex = textBeforeCursor.lastIndexOf('@')
    
    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1)
      // Check if there's no space after @ (still typing mention)
      if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
        setMentionSearch(textAfterAt.toLowerCase())
        setMentionPosition(lastAtIndex)
        setShowMentions(true)
        setSelectedMentionIndex(0)
        return
      }
    }
    
    setShowMentions(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentions && filteredUsers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedMentionIndex(prev => 
          prev < filteredUsers.length - 1 ? prev + 1 : prev
        )
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedMentionIndex(prev => prev > 0 ? prev - 1 : 0)
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertMention(filteredUsers[selectedMentionIndex])
      } else if (e.key === 'Escape') {
        setShowMentions(false)
      }
    }
  }

  const insertMention = (mentionedUser: User) => {
    const beforeMention = newComment.slice(0, mentionPosition)
    const afterMention = newComment.slice(textareaRef.current?.selectionStart || mentionPosition)
    const newText = `${beforeMention}@${mentionedUser.name} ${afterMention}`
    
    setNewComment(newText)
    setShowMentions(false)
    setMentionSearch('')
    
    // Focus back on textarea
    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = beforeMention.length + mentionedUser.name.length + 2
        textareaRef.current.focus()
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos)
      }
    }, 0)
  }

  const filteredUsers = users.filter(u => 
    u.id !== user?.id && u.name.toLowerCase().includes(mentionSearch)
  )

  const extractMentions = (text: string): string[] => {
    const mentionRegex = /@(\w+(?:\s+\w+)*)/g
    const matches = text.matchAll(mentionRegex)
    const mentionedNames = Array.from(matches).map(match => match[1])
    
    // Find user IDs for mentioned names
    const mentionedUserIds: string[] = []
    mentionedNames.forEach(name => {
      const foundUser = users.find(u => 
        u.name.toLowerCase() === name.toLowerCase()
      )
      if (foundUser) {
        mentionedUserIds.push(foundUser.id)
      }
    })
    
    return mentionedUserIds
  }

  const highlightMentions = (text: string) => {
    const parts = text.split(/(@\w+(?:\s+\w+)*)/g)
    return parts.map((part, index) => {
      if (part.startsWith('@')) {
        const name = part.slice(1)
        const mentionedUser = users.find(u => u.name.toLowerCase() === name.toLowerCase())
        if (mentionedUser) {
          return (
            <span 
              key={index} 
              className="bg-blue-100 text-blue-700 px-1 rounded font-medium"
            >
              {part}
            </span>
          )
        }
      }
      return part
    })
  }

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!newComment.trim()) return

    setSubmitting(true)
    try {
      const mentionedUserIds = extractMentions(newComment)
      await tasksApi.addComment(taskId, newComment.trim(), mentionedUserIds)
      setNewComment('')
      toast.success('Comment added successfully!')
      onCommentsUpdated()
    } catch (error) {
      console.error('Error adding comment:', error)
      toast.error('Failed to add comment')
    } finally {
      setSubmitting(false)
    }
  }

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (diffInSeconds < 60) return 'Just now'
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`
    
    return date.toLocaleDateString()
  }

  return (
    <div className="space-y-4">
      {/* Comments List */}
      <div className="space-y-4 max-h-96 overflow-y-auto">
        {comments && comments.length > 0 ? (
          comments.map((comment: any, index: number) => (
            <motion.div
              key={comment.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="flex space-x-3"
            >
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                <span className="text-sm font-medium text-white">
                  {comment.user?.name?.charAt(0).toUpperCase() || 'U'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="bg-gray-50 rounded-lg p-3 hover:bg-gray-100 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900">
                        {comment.user?.name || 'Unknown User'}
                      </p>
                      {comment.user?.position && (
                        <span className="text-xs text-gray-500">• {comment.user.position}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      {formatTimeAgo(comment.createdAt)}
                    </p>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {highlightMentions(comment.comment)}
                  </p>
                </div>
              </div>
            </motion.div>
          ))
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-500">No comments yet. Be the first to comment!</p>
          </div>
        )}
      </div>

      {/* Add Comment Form */}
      <form onSubmit={handleSubmitComment} className="border-t border-gray-200 pt-4">
        <div className="flex space-x-3">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-sm">
            <span className="text-sm font-medium text-white">
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </span>
          </div>
          <div className="flex-1 relative">
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={newComment}
                onChange={handleTextChange}
                onKeyDown={handleKeyDown}
                placeholder="Add a comment... (use @ to mention users)"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                disabled={submitting}
              />
              
              {/* User Mention Autocomplete Dropdown */}
              <AnimatePresence>
                {showMentions && filteredUsers.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute bottom-full left-0 mb-2 w-64 bg-white rounded-lg shadow-xl border border-gray-200 max-h-48 overflow-y-auto z-50"
                  >
                    {filteredUsers.map((mentionUser, index) => (
                      <button
                        key={mentionUser.id}
                        type="button"
                        onClick={() => insertMention(mentionUser)}
                        className={`w-full px-3 py-2 text-left hover:bg-blue-50 transition-colors flex items-center gap-2 ${
                          index === selectedMentionIndex ? 'bg-blue-50' : ''
                        }`}
                      >
                        <UserCircleIcon className="h-5 w-5 text-gray-400" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {mentionUser.name}
                          </p>
                          {mentionUser.position && (
                            <p className="text-xs text-gray-500 truncate">
                              {mentionUser.position}
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="absolute bottom-2 right-2">
                <button
                  type="submit"
                  disabled={!newComment.trim() || submitting}
                  className="inline-flex items-center p-2 text-blue-600 hover:text-blue-700 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  ) : (
                    <PaperAirplaneIcon className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Tip: Type @ to mention a team member
            </p>
          </div>
        </div>
      </form>
    </div>
  )
}

export default TaskComments
