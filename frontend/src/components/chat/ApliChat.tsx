import { useState, useEffect, useRef } from 'react'
import { XMarkIcon, PaperAirplaneIcon, ChatBubbleLeftRightIcon, MinusIcon, ChevronUpIcon, PaperClipIcon } from '@heroicons/react/24/outline'
import { useNavigate } from 'react-router-dom'
import { CpuChipIcon } from '@heroicons/react/24/solid'
import { useSelector } from 'react-redux'
import { RootState } from '../../store'
import api from '../../services/api'
import toast from 'react-hot-toast'
import { AnimatePresence, motion } from 'framer-motion'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  metadata?: {
    files?: any[]
    mentions?: string[]
    taskRefs?: string[]
  }
}

interface ApliChatProps {
  isOpen: boolean
  onClose: () => void
}

export default function ApliChat({ isOpen, onClose }: ApliChatProps) {
  const navigate = useNavigate()
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [streamingMessage, setStreamingMessage] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [showConfirmClose, setShowConfirmClose] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [suggestionType, setSuggestionType] = useState<'user' | 'task' | null>(null)
  const [allUsers, setAllUsers] = useState<any[]>([])
  const [allTasks, setAllTasks] = useState<any[]>([])
  const [cursorPosition, setCursorPosition] = useState(0)
  const [inlineCompletion, setInlineCompletion] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [attachments, setAttachments] = useState<any[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const { user } = useSelector((state: RootState) => state.auth)

  // Humanize AI responses by removing markdown formatting
  const humanizeText = (text: string): string => {
    return text
      // Remove bold markers (**text** or __text__)
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/__(.+?)__/g, '$1')
      // Remove italic markers (*text* or _text_)
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/_(.+?)_/g, '$1')
      // Remove strikethrough (~~text~~)
      .replace(/~~(.+?)~~/g, '$1')
      // Remove code blocks (```code```)
      .replace(/```[\s\S]*?```/g, (match) => {
        return match.replace(/```/g, '').trim()
      })
      // Remove inline code (`code`)
      .replace(/`(.+?)`/g, '$1')
      // Remove headers (# Header)
      .replace(/^#{1,6}\s+(.+)$/gm, '$1')
      // Remove list markers (- item or * item)
      .replace(/^[\*\-]\s+(.+)$/gm, '$1')
      // Remove numbered lists (1. item)
      .replace(/^\d+\.\s+(.+)$/gm, '$1')
      // Remove blockquotes (> quote)
      .replace(/^>\s+(.+)$/gm, '$1')
      // Remove links [text](url)
      .replace(/\[(.+?)\]\(.+?\)/g, '$1')
      // Clean up extra newlines
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, isTyping, streamingMessage])

  // Focus input when chat opens and load data
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()
      if (!sessionId) {
        loadChatHistory()
      }
      fetchUsersAndTasks()
    }
  }, [isOpen])

  // Fetch users and tasks for autocomplete
  const fetchUsersAndTasks = async () => {
    try {
      const [usersRes, tasksRes] = await Promise.all([
        api.get('/users'),
        api.get('/tasks')
      ])
      setAllUsers(usersRes.data || [])
      // Handle both direct array and paginated response
      const tasks = Array.isArray(tasksRes.data) ? tasksRes.data : (tasksRes.data?.tasks || [])
      setAllTasks(tasks)
      console.log('Fetched tasks for autocomplete:', tasks.length)
    } catch (error) {
      console.error('Error fetching users and tasks:', error)
    }
  }

  const loadChatHistory = async () => {
    try {
      const response = await api.get('/chat/history?limit=1')
      if (response.data && response.data.length > 0) {
        const latestSession = response.data[0]
        if (latestSession.isActive) {
          setSessionId(latestSession.id)
          setMessages(latestSession.messages.map((msg: any) => ({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            createdAt: msg.createdAt,
            metadata: msg.metadata, // Load metadata (files, etc.)
          })))
        }
      }
    } catch (error) {
      console.error('Error loading chat history:', error)
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setIsUploading(true)
    const newAttachments = [...attachments]

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const formData = new FormData()
        formData.append('file', file)
        
        const res = await api.post('/files/upload/temp', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
        
        newAttachments.push({
          name: file.name,
          url: res.data.url,
          type: file.type
        })
      }
      
      setAttachments(newAttachments)
      toast.success('Asset(s) Attached')
    } catch (error) {
      toast.error('Tactical failure during asset retrieval')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  const sendMessage = async () => {
    if ((!inputValue.trim() && attachments.length === 0) || isTyping || isUploading) return

    const currentMessage = inputValue;
    const currentAttachments = [...attachments];

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: currentMessage,
      createdAt: new Date().toISOString(),
      metadata: {
        files: currentAttachments
      }
    }

    setMessages((prev) => [...prev, userMessage])
    setInputValue('')
    setAttachments([])
    setIsTyping(true)
    setStreamingMessage('')

    try {
      const response = await api.post('/chat/message', {
        message: currentMessage,
        sessionId,
        files: currentAttachments.map(a => ({ name: a.name, url: a.url, type: a.type }))
      })

      if (response.data.sessionId && !sessionId) {
        setSessionId(response.data.sessionId)
      }

      // Simulate typing effect
      const fullMessage = response.data.message.content
      const assistantMessageId = response.data.message.id
      const words = fullMessage.split(' ')
      let currentText = ''

      for (let i = 0; i < words.length; i++) {
        currentText += (i > 0 ? ' ' : '') + words[i]
        setStreamingMessage(currentText)
        // Adjust speed: faster for shorter words, slower for longer
        await new Promise(resolve => setTimeout(resolve, 30 + Math.random() * 40))
      }

      // Add the complete message
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: fullMessage,
        createdAt: response.data.message.createdAt,
        metadata: response.data.message.metadata,
      }

      setMessages((prev) => {
        // Find and update the placeholder user message if it's the latest, 
        // to ensure its metadata (files) is also correctly stored if the backend updated it
        return [...prev, assistantMessage]
      })
      setStreamingMessage('')
    } catch (error: any) {
      console.error('Error sending message:', error)
      
      // Extract the actual error message from the response
      let errorMsg = 'Failed to send message'
      if (error.response?.data?.message) {
        errorMsg = error.response.data.message
      } else if (error.response?.data?.detail) {
        errorMsg = typeof error.response.data.detail === 'string'
          ? error.response.data.detail
          : error.response.data.detail.message || 'AI service error'
      } else if (error.message) {
        errorMsg = error.message
      }

      toast.error(errorMsg)

      // Determine if it's a connection/network issue vs a real (actionable) error
      const isNetworkIssue =
        errorMsg.toLowerCase().includes('trouble connecting') ||
        errorMsg.toLowerCase().includes('network') ||
        errorMsg.toLowerCase().includes('failed to send')

      const displayContent = isNetworkIssue
        ? "I'm having trouble connecting right now. Please try again in a moment."
        : `⚠️ ${errorMsg}`

      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: displayContent,
        createdAt: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsTyping(false)
    }
  }

  const handleClose = () => {
    if (messages.length > 0) {
      setShowConfirmClose(true)
    } else {
      onClose()
    }
  }

  const confirmClose = async () => {
    if (sessionId) {
      try {
        await api.post(`/chat/session/${sessionId}/end`)
      } catch (error) {
        console.error('Error ending session:', error)
      }
    }
    setShowConfirmClose(false)
    setMessages([])
    setSessionId(null)
    onClose()
  }

  const cancelClose = () => {
    setShowConfirmClose(false)
  }

  // Handle input changes with inline autocomplete
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setInputValue(value)

    // Get cursor position
    const cursorPos = e.target.selectionStart || 0
    setCursorPosition(cursorPos)
    const textBeforeCursor = value.substring(0, cursorPos)
    
    // Check for @ mention (inline autocomplete)
    const atMatch = textBeforeCursor.match(/@([\w\s]*)$/)
    if (atMatch) {
      const query = atMatch[1].toLowerCase().trim()
      
      if (query.length >= 1) {
        // Find first user that starts with the query
        const matchedUser = allUsers.find(u => 
          u.name.toLowerCase().includes(query)
        )
        
        if (matchedUser) {
          setInlineCompletion(matchedUser.name.substring(query.length))
      setSuggestionType('user')
          setSuggestions([matchedUser])
      return
        }
      }
    }

    // Check for / task reference (inline autocomplete)
    const slashMatch = textBeforeCursor.match(/\/([\w\s-]*)$/)
    if (slashMatch) {
      const query = slashMatch[1].toLowerCase().trim()
      
      if (query.length >= 1) {
        // Find first task that starts with the query
        const matchedTask = allTasks.find((t: any) => 
          t.title.toLowerCase().includes(query)
        )
        
        if (matchedTask) {
          setInlineCompletion(matchedTask.title.substring(query.length))
      setSuggestionType('task')
          setSuggestions([matchedTask])
      return
        }
      }
    }

    // No match, hide completion
    setInlineCompletion('')
    setSuggestions([])
    setSuggestionType(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Handle inline completion with Space or Tab
    if (inlineCompletion && (e.key === ' ' || e.key === 'Tab')) {
      e.preventDefault()
      
      if (suggestions.length > 0) {
        applySuggestion(suggestions[0])
      }
      return
    }

    // Regular enter to send
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const applySuggestion = (suggestion: any) => {
    const textBeforeCursor = inputValue.substring(0, cursorPosition)
    const textAfterCursor = inputValue.substring(cursorPosition)
    
    let newText = ''
    let newCursorPos = 0
    
    if (suggestionType === 'user') {
      const atIndex = textBeforeCursor.lastIndexOf('@')
      const beforeMention = textBeforeCursor.substring(0, atIndex)
      newText = beforeMention + `@${suggestion.name} ` + textAfterCursor
      newCursorPos = beforeMention.length + suggestion.name.length + 2
    } else if (suggestionType === 'task') {
      const slashIndex = textBeforeCursor.lastIndexOf('/')
      const beforeTask = textBeforeCursor.substring(0, slashIndex)
      newText = beforeTask + `/${suggestion.title} ` + textAfterCursor
      newCursorPos = beforeTask.length + suggestion.title.length + 2
    }
    
    setInputValue(newText)
    setInlineCompletion('')
    setSuggestions([])
    setSuggestionType(null)
    
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus()
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos)
      }
    }, 0)
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }

  // Get initials for avatar
  const getInitials = (name?: string) => {
    if (!name) return 'AC'
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2)
  }

  if (!isOpen) return null

  // Minimized view - Professional
  if (isMinimized) {
    return (
      <div className="fixed bottom-6 right-6 w-80 bg-white rounded-xl shadow-xl z-50 border border-gray-200 overflow-hidden">
        <div 
          className="bg-primary-600 text-white p-4 flex items-center justify-between cursor-pointer hover:bg-primary-700 transition-all duration-300"
          onClick={() => setIsMinimized(false)}
        >
          <div className="flex items-center space-x-3">
            <div className="relative w-11 h-11 bg-white/20 rounded-lg flex items-center justify-center shadow-md">
              <CpuChipIcon className="w-6 h-6 text-white" />
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-success-400 rounded-full border-2 border-white"></div>
            </div>
            <div>
              <h3 className="font-bold text-base">ApliChat</h3>
              <p className="text-xs text-white/90 flex items-center gap-1">
                <span className="w-2 h-2 bg-success-400 rounded-full animate-pulse"></span>
                {messages.length} messages
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-1">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setIsMinimized(false)
              }}
              className="text-white hover:bg-white/20 rounded-lg p-2 transition-all"
              title="Expand"
            >
              <ChevronUpIcon className="w-5 h-5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleClose()
              }}
              className="text-white hover:bg-white/20 rounded-lg p-2 transition-all"
              title="Close"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Full view - Professional & Modern
  return (
    <>
      <AnimatePresence>
        {isOpen && !isMinimized && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed bottom-6 right-6 w-[400px] h-[600px] bg-white rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] flex flex-col z-50 border border-gray-100 overflow-hidden"
          >
            {/* Combined Header, Body and Input - Full Height Layout */}
            <div className="flex flex-col h-full bg-white relative">
              {/* Chat Header */}
              <div className="flex items-center justify-between px-5 py-4 bg-white border-b border-gray-100 flex-shrink-0 z-10 shadow-sm">
                <div className="flex items-center space-x-3.5">
                  <div className="relative">
                    <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center shadow-inner">
                      <CpuChipIcon className="w-6 h-6 text-primary-600" />
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 border-2 border-white rounded-full"></div>
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-gray-900 tracking-tight">ApliChat</h2>
                    <p className="text-[10px] font-black text-gray-400 tracking-[0.2em] uppercase italic">Interactive Intelligence Hub</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button 
                    onClick={() => setIsMinimized(true)}
                    className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400"
                    aria-label="Minimize Chat"
                  >
                    <MinusIcon className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={onClose}
                    className="p-1.5 hover:bg-gray-100 text-gray-400 rounded-lg transition-colors"
                    aria-label="Close Chat"
                  >
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Message History */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/30 scroll-smooth">
                {messages.length === 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mt-12 px-6"
                  >
                    <div className="mb-6 inline-block p-6 bg-primary-50 rounded-3xl">
                      <ChatBubbleLeftRightIcon className="w-16 h-16 mx-auto text-primary-600" />
                    </div>
                    <h4 className="text-lg font-black text-gray-900 mb-3">Initialize Connection?</h4>
                    <p className="text-sm text-gray-500 mb-6 font-medium">Ask about tasks, company goals, or attach files for deep multimodal analysis.</p>
                    <div className="flex flex-wrap justify-center gap-2 max-w-sm mx-auto">
                      {["List my tasks", "Our competitors", "Goal for Q2"].map(q => (
                        <button 
                          key={q}
                          onClick={() => setInputValue(q)}
                          className="px-3 py-1.5 bg-white border border-gray-100 rounded-full text-[11px] font-black text-gray-600 shadow-sm hover:border-primary-200 hover:text-primary-600 transition-all"
                        >
                          "{q}"
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}

                {messages.map((message) => (
                  <motion.div
                    key={message.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={`flex items-start gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
                  >
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm border ${
                      message.role === 'user' ? 'bg-primary-600 text-white border-primary-500' : 'bg-white text-secondary-600 border-gray-100'
                    }`}>
                      {message.role === 'user' ? <span className="text-[10px] font-black">{getInitials(user?.name)}</span> : <CpuChipIcon className="w-5 h-5" />}
                    </div>
                    
                    <div className={`flex flex-col max-w-[82%] ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <div className={`rounded-2xl px-4 py-2.5 shadow-sm relative group transition-all ${
                        message.role === 'user' ? 'bg-primary-600 text-white rounded-tr-none' : 'bg-white border border-gray-200 text-gray-800 rounded-tl-none'
                      }`}>
                        <div className="text-[13px] leading-relaxed relative z-10 font-medium whitespace-pre-wrap">
                          {(message.role === 'assistant' ? humanizeText(message.content) : message.content)
                            .split(/(\s+)/)
                            .map((part, i) => {
                              // Highlight Mentions (@user)
                              if (part.startsWith('@')) {
                                return (
                                  <span key={i} className={`font-black underline decoration-2 ${message.role === 'user' ? 'text-white decoration-white/30' : 'text-primary-600 decoration-primary-200'}`}>
                                    {part}
                                  </span>
                                );
                              }
                              // Highlight References (#TKT-1001, /TSK-1001, TKT-1001)
                              if (/^([#|\/]?)(TKT|TSK)-\d+$/i.test(part)) {
                                const code = part.replace(/[#|\/]/g, '').toUpperCase();
                                return (
                                  <button 
                                    key={i} 
                                    onClick={() => navigate(`/tickets/code/${code}`)}
                                    className={`font-black italic underline decoration-2 transition-all hover:scale-105 active:scale-95 ${message.role === 'user' ? 'text-white decoration-white/30' : 'text-indigo-600 decoration-indigo-200'}`}
                                  >
                                    {part}
                                  </button>
                                );
                              }
                              return part;
                            })
                          }
                        </div>

                        {/* Render Message Files */}
                        {message.metadata?.files && message.metadata.files.length > 0 && (
                          <div className="mt-2.5 flex flex-wrap gap-1.5 relative z-10">
                            {message.metadata.files.map((file, i) => (
                              <div 
                                key={i} 
                                title={file.name}
                                onClick={() => window.open(file.url, '_blank')}
                                className={`flex items-center gap-1.5 p-1 pr-2.5 rounded-lg text-[10px] cursor-pointer transition-all border ${
                                  message.role === 'user' 
                                    ? 'bg-primary-700/60 border-primary-500/50 hover:bg-primary-700' 
                                    : 'bg-gray-50 border-gray-100 hover:border-gray-200'
                                }`}
                              >
                                <div className={`w-6 h-6 rounded flex items-center justify-center ${message.role === 'user' ? 'bg-primary-600' : 'bg-primary-50'}`}>
                                  {file.type?.startsWith('image/') ? (
                                    <img src={file.url} className="w-full h-full object-cover rounded" alt="" />
                                  ) : (
                                    <PaperClipIcon className={`w-3 h-3 ${message.role === 'user' ? 'text-primary-100' : 'text-primary-600'}`} />
                                  )}
                                </div>
                                <span className="truncate max-w-[80px] font-black">{file.name}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className={`text-[9px] mt-1 font-black uppercase tracking-widest opacity-60 ${message.role === 'user' ? 'mr-1' : 'ml-1'}`}>
                        {formatTime(message.createdAt)}
                      </span>
                    </div>
                  </motion.div>
                ))}

                {streamingMessage && (
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-white border border-gray-100 text-secondary-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                      <CpuChipIcon className="w-5 h-5" />
                    </div>
                    <div className="bg-white border border-gray-200 text-gray-800 rounded-2xl rounded-tl-none px-4 py-2.5 max-w-[82%] shadow-sm">
                      <p className="text-[13px] leading-relaxed font-medium">{humanizeText(streamingMessage)}</p>
                    </div>
                  </div>
                )}

                {isTyping && !streamingMessage && (
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-white border border-gray-100 text-secondary-600 flex items-center justify-center flex-shrink-0 shadow-sm animation-pulse">
                      <CpuChipIcon className="w-5 h-5" />
                    </div>
                    <div className="flex gap-1 p-2 bg-white border border-gray-100 rounded-full h-8 items-center px-4">
                      <div className="w-1 h-1 bg-primary-600 rounded-full animate-bounce"></div>
                      <div className="w-1 h-1 bg-primary-500 rounded-full animate-bounce delay-75"></div>
                      <div className="w-1 h-1 bg-primary-400 rounded-full animate-bounce delay-150"></div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <div className="p-4 bg-white border-t border-gray-100 flex-shrink-0 relative">
                {/* Autocomplete Suggestions */}
                <AnimatePresence>
                  {suggestions.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute left-4 right-4 bottom-full mb-3 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-20 max-h-40"
                    >
                      <div className="p-2 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
                        <span className="text-[9px] font-black text-gray-400 tracking-widest uppercase">
                          Select {suggestionType === 'user' ? 'a Team Member' : 'a Task'}
                        </span>
                      </div>
                      <div className="overflow-y-auto max-h-32">
                        {suggestions.map((item, idx) => (
                          <button
                            key={idx}
                            onClick={() => applySuggestion(item)}
                            className="w-full text-left px-4 py-2 text-[12px] hover:bg-primary-50 border-b border-gray-50 last:border-0 transition-colors flex items-center justify-between group"
                          >
                            <span className="text-gray-700 font-medium group-hover:text-primary-700 truncate max-w-[200px]">
                              {suggestionType === 'user' ? item.name : item.title}
                            </span>
                            <span className="text-[10px] font-black text-gray-300 group-hover:text-primary-300">
                              {suggestionType === 'user' ? item.email : item.taskNumber || 'TSK'}
                            </span>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Attachments Preview - Professional Bar */}
                <AnimatePresence>
                  {attachments.length > 0 && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="flex items-center gap-2 mb-3 px-1 overflow-x-auto pb-1 no-scrollbar"
                    >
                      {attachments.map((file, idx) => (
                        <motion.div 
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          key={idx} 
                          className="flex-shrink-0 group relative flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-2 py-1.5 shadow-sm"
                        >
                          <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 overflow-hidden flex items-center justify-center">
                            {file.type?.startsWith('image/') ? (
                              <img src={file.url} className="w-full h-full object-cover" alt="" />
                            ) : (
                              <PaperClipIcon className="w-4 h-4 text-primary-600" />
                            )}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black text-gray-700 truncate max-w-[90px]">{file.name}</span>
                            <span className="text-[8px] font-bold text-gray-400 uppercase tracking-tighter">Ready to analyze</span>
                          </div>
                          <button 
                            onClick={() => removeAttachment(idx)}
                            className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-100 text-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                          >
                            <XMarkIcon className="w-3 h-3" />
                          </button>
                        </motion.div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
                
                <div className="flex items-center gap-2">
                  <div className="flex-1 relative group">
                    <input
                      ref={inputRef}
                      type="text"
                      value={inputValue}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyDown}
                      disabled={isTyping || isUploading}
                      placeholder={isUploading ? "Uploading assets..." : "Leave a message"}
                      className="w-full bg-gray-50/50 border border-transparent focus:border-primary-500 focus:bg-white rounded-2xl pl-4 pr-12 py-3 text-[13px] outline-none transition-all shadow-inner font-medium"
                    />
                    
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isTyping || isUploading}
                      title="Attach Files"
                      className="absolute right-2 top-1.5 p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all"
                    >
                      <PaperClipIcon className={`w-5 h-5 ${attachments.length > 0 ? 'text-primary-600' : ''}`} />
                    </button>
                  </div>
                  
                  <button
                    onClick={sendMessage}
                    disabled={(!inputValue.trim() && attachments.length === 0) || isTyping || isUploading}
                    className={`p-3 rounded-2xl transition-all shadow-md ${
                      (inputValue.trim() || attachments.length > 0) && !isTyping && !isUploading
                        ? 'bg-primary-600 text-white hover:bg-primary-700 hover:scale-105 active:scale-95'
                        : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    <PaperAirplaneIcon className="w-5 h-5" />
                  </button>
                </div>
                
                <input 
                  type="file" 
                  multiple 
                  ref={fileInputRef} 
                  onChange={handleFileSelect} 
                  className="hidden" 
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirm close modal - Professional */}
      {showConfirmClose && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] animate-fade-in">
          <div className="bg-white rounded-xl p-8 max-w-md mx-4 shadow-2xl border border-gray-200">
            <div className="mb-6 text-center">
              <div className="w-14 h-14 bg-error-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <XMarkIcon className="w-8 h-8 text-error-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">End Chat Session?</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Your conversation history will be saved and you can continue it later.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={cancelClose}
                className="flex-1 px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmClose}
                className="flex-1 px-5 py-2.5 bg-error-600 text-white rounded-lg hover:bg-error-700 transition-all font-medium shadow-sm"
              >
                End Chat
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

