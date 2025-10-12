import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PaperAirplaneIcon, UserCircleIcon, PhotoIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useAppSelector } from '@/hooks/redux'
import { tasksApi, usersApi } from '@/services/api'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'

interface TaskCommentsProps {
  taskId: string
  comments: any[]
  onCommentsUpdated: () => void
  subtasks?: any[] // For /subtask autocomplete
}

interface User {
  id: string
  name: string
  email: string
  position?: string
  role: string
}

interface Subtask {
  id: string
  title: string
  linkedTask?: {
    id: string
  }
}

const TaskComments: React.FC<TaskCommentsProps> = ({ taskId, comments, onCommentsUpdated, subtasks = [] }) => {
  const navigate = useNavigate()
  const { user } = useAppSelector((state) => state.auth)
  const [newComment, setNewComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [users, setUsers] = useState<User[]>([])
  const [showMentions, setShowMentions] = useState(false)
  const [showSubtasks, setShowSubtasks] = useState(false)
  const [mentionSearch, setMentionSearch] = useState('')
  const [subtaskSearch, setSubtaskSearch] = useState('')
  const [mentionPosition, setMentionPosition] = useState(0)
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0)
  const [attachedImages, setAttachedImages] = useState<File[]>([])
  const [previewUrls, setPreviewUrls] = useState<string[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadUsers()
  }, [])

  useEffect(() => {
    // Cleanup preview URLs on unmount
    return () => {
      previewUrls.forEach(url => URL.revokeObjectURL(url))
    }
  }, [previewUrls])

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

    const textBeforeCursor = value.slice(0, cursorPos)

    // Check for /subtask mention
    const lastSlashIndex = textBeforeCursor.lastIndexOf('/')
    if (lastSlashIndex !== -1) {
      const textAfterSlash = textBeforeCursor.slice(lastSlashIndex + 1)
      if (!textAfterSlash.includes(' ') && !textAfterSlash.includes('\n')) {
        setSubtaskSearch(textAfterSlash.toLowerCase())
        setMentionPosition(lastSlashIndex)
        setShowSubtasks(true)
        setShowMentions(false)
        setSelectedMentionIndex(0)
        return
      }
    }

    // Check for @ mention
    const lastAtIndex = textBeforeCursor.lastIndexOf('@')
    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1)
      if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
        setMentionSearch(textAfterAt.toLowerCase())
        setMentionPosition(lastAtIndex)
        setShowMentions(true)
        setShowSubtasks(false)
        setSelectedMentionIndex(0)
        return
      }
    }
    
    setShowMentions(false)
    setShowSubtasks(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const currentList = showMentions ? filteredUsers : showSubtasks ? filteredSubtasks : []
    
    if ((showMentions || showSubtasks) && currentList.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedMentionIndex(prev => 
          prev < currentList.length - 1 ? prev + 1 : prev
        )
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedMentionIndex(prev => prev > 0 ? prev - 1 : 0)
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        if (showMentions) {
          insertMention(filteredUsers[selectedMentionIndex])
        } else if (showSubtasks) {
          insertSubtask(filteredSubtasks[selectedMentionIndex])
        }
      } else if (e.key === 'Escape') {
        setShowMentions(false)
        setShowSubtasks(false)
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
    
    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = beforeMention.length + mentionedUser.name.length + 2
        textareaRef.current.focus()
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos)
      }
    }, 0)
  }

  const insertSubtask = (subtask: Subtask) => {
    const beforeMention = newComment.slice(0, mentionPosition)
    const afterMention = newComment.slice(textareaRef.current?.selectionStart || mentionPosition)
    const newText = `${beforeMention}/subtask[${subtask.title}](${subtask.id}) ${afterMention}`
    
    setNewComment(newText)
    setShowSubtasks(false)
    setSubtaskSearch('')
    
    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = beforeMention.length + subtask.title.length + subtask.id.length + 13
        textareaRef.current.focus()
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos)
      }
    }, 0)
  }

  const filteredUsers = users.filter(u => 
    u.id !== user?.id && u.name.toLowerCase().includes(mentionSearch)
  )

  const filteredSubtasks = subtasks.filter(s =>
    s.title.toLowerCase().includes(subtaskSearch)
  )

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    const newImages: File[] = []
    const newPreviews: string[] = []

    Array.from(files).forEach(file => {
      if (file.type.startsWith('image/')) {
        if (file.size > 5 * 1024 * 1024) { // 5MB limit
          toast.error(`${file.name} is too large. Max size is 5MB`)
          return
        }
        newImages.push(file)
        newPreviews.push(URL.createObjectURL(file))
      } else {
        toast.error(`${file.name} is not an image`)
      }
    })

    setAttachedImages(prev => [...prev, ...newImages])
    setPreviewUrls(prev => [...prev, ...newPreviews])
  }

  const removeImage = (index: number) => {
    URL.revokeObjectURL(previewUrls[index])
    setAttachedImages(prev => prev.filter((_, i) => i !== index))
    setPreviewUrls(prev => prev.filter((_, i) => i !== index))
  }

  const extractMentions = (text: string): string[] => {
    const mentionRegex = /@(\w+(?:\s+\w+)*)/g
    const matches = text.matchAll(mentionRegex)
    const mentionedNames = Array.from(matches).map(match => match[1])
    
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

  const highlightContent = (text: string) => {
    // Split by both @mentions and /subtask tags
    const parts = text.split(/(@\w+(?:\s+\w+)*)|(\/subtask\[([^\]]+)\]\(([^)]+)\))/g)
    
    return parts.map((part, index) => {
      if (!part) return null
      
      // Check if it's an @mention
      if (part.startsWith('@')) {
        const name = part.slice(1)
        const mentionedUser = users.find(u => u.name.toLowerCase() === name.toLowerCase())
        if (mentionedUser) {
          return (
            <span 
              key={index} 
              className="bg-blue-100 text-blue-700 px-1 rounded font-medium cursor-pointer hover:bg-blue-200"
            >
              {part}
            </span>
          )
        }
      }
      
      // Check if it's a /subtask tag (captured in groups 3 and 4)
      if (index > 0 && parts[index - 2] && parts[index - 2].startsWith('/subtask')) {
        const subtaskTitle = parts[index - 1]
        const subtaskId = part
        const subtask = subtasks.find(s => s.id === subtaskId)
        
        return (
          <span
            key={index}
            onClick={() => {
              if (subtask?.linkedTask?.id) {
                navigate(`/tasks/${subtask.linkedTask.id}`)
              }
            }}
            className="inline-flex items-center gap-1 bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-medium cursor-pointer hover:bg-purple-200 transition-colors"
          >
            <span className="text-xs">📋</span>
            {subtaskTitle}
          </span>
        )
      }
      
      // Skip the matched groups themselves
      if (part.startsWith('/subtask[') || subtasks.find(s => s.id === part)) {
        return null
      }
      
      return part
    })
  }

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!newComment.trim() && attachedImages.length === 0) {
      toast.error('Please add a comment or image')
      return
    }

    setSubmitting(true)
    try {
      const mentionedUserIds = extractMentions(newComment)
      
      // Upload comment with images
      await tasksApi.addCommentWithImages(taskId, newComment.trim(), mentionedUserIds, attachedImages)
      
      setNewComment('')
      setAttachedImages([])
      previewUrls.forEach(url => URL.revokeObjectURL(url))
      setPreviewUrls([])
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
                  <div className="text-sm text-gray-700 whitespace-pre-wrap">
                    {highlightContent(comment.comment)}
                  </div>
                  
                  {/* Comment Images */}
                  {comment.images && comment.images.length > 0 && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {comment.images.map((image: any, imgIndex: number) => (
                        <a
                          key={imgIndex}
                          href={image.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block rounded-lg overflow-hidden border border-gray-200 hover:border-blue-400 transition-colors"
                        >
                          <img
                            src={image.url}
                            alt={`Attachment ${imgIndex + 1}`}
                            className="w-full h-32 object-cover"
                          />
                        </a>
                      ))}
                    </div>
                  )}
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
            {/* Image Previews */}
            {previewUrls.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {previewUrls.map((url, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={url}
                      alt={`Preview ${index + 1}`}
                      className="h-20 w-20 object-cover rounded-lg border border-gray-300"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <XMarkIcon className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="relative">
              <textarea
                ref={textareaRef}
                value={newComment}
                onChange={handleTextChange}
                onKeyDown={handleKeyDown}
                placeholder="Add a comment... (use @ to mention users, / to reference subtasks)"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                disabled={submitting}
              />
              
              {/* User Mention Autocomplete */}
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

              {/* Subtask Autocomplete */}
              <AnimatePresence>
                {showSubtasks && filteredSubtasks.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute bottom-full left-0 mb-2 w-80 bg-white rounded-lg shadow-xl border border-gray-200 max-h-48 overflow-y-auto z-50"
                  >
                    <div className="px-3 py-2 bg-purple-50 border-b border-purple-100">
                      <p className="text-xs font-medium text-purple-700">Reference a subtask</p>
                    </div>
                    {filteredSubtasks.map((subtask, index) => (
                      <button
                        key={subtask.id}
                        type="button"
                        onClick={() => insertSubtask(subtask)}
                        className={`w-full px-3 py-2 text-left hover:bg-purple-50 transition-colors ${
                          index === selectedMentionIndex ? 'bg-purple-50' : ''
                        }`}
                      >
                        <p className="text-sm font-medium text-gray-900 line-clamp-1">
                          📋 {subtask.title}
                        </p>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="absolute bottom-2 right-2 flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={submitting}
                  className="inline-flex items-center p-2 text-gray-600 hover:text-blue-600 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
                  title="Attach image"
                >
                  <PhotoIcon className="h-4 w-4" />
                </button>
                <button
                  type="submit"
                  disabled={(!newComment.trim() && attachedImages.length === 0) || submitting}
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
              Tip: Type @ to mention a team member, / to reference a subtask
            </p>
          </div>
        </div>
      </form>
    </div>
  )
}

export default TaskComments
