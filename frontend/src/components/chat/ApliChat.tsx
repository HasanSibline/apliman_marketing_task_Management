import { useState, useEffect, useRef } from 'react'
import { XMarkIcon, PaperAirplaneIcon, ChatBubbleLeftRightIcon, MinusIcon, ChevronUpIcon } from '@heroicons/react/24/outline'
import { CpuChipIcon } from '@heroicons/react/24/solid'
import { useSelector } from 'react-redux'
import { RootState } from '../../store'
import api from '../../services/api'
import toast from 'react-hot-toast'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

interface ApliChatProps {
  isOpen: boolean
  onClose: () => void
}

export default function ApliChat({ isOpen, onClose }: ApliChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [showConfirmClose, setShowConfirmClose] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [suggestionType, setSuggestionType] = useState<'user' | 'task' | null>(null)
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0)
  const [allUsers, setAllUsers] = useState<any[]>([])
  const [allTasks, setAllTasks] = useState<any[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { user } = useSelector((state: RootState) => state.auth)

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, isTyping])

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
      setAllTasks(tasksRes.data || [])
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
          })))
        }
      }
    } catch (error) {
      console.error('Error loading chat history:', error)
    }
  }

  const sendMessage = async () => {
    if (!inputValue.trim() || isTyping) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue,
      createdAt: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInputValue('')
    setIsTyping(true)

    try {
      const response = await api.post('/chat/message', {
        message: inputValue,
        sessionId,
      })

      if (response.data.sessionId && !sessionId) {
        setSessionId(response.data.sessionId)
      }

      const assistantMessage: Message = {
        id: response.data.message.id,
        role: 'assistant',
        content: response.data.message.content,
        createdAt: response.data.message.createdAt,
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch (error: any) {
      console.error('Error sending message:', error)
      toast.error('Failed to send message')
      
      // Add error message
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: "I'm having trouble connecting right now. Please try again in a moment.",
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

  // Handle input changes and trigger autocomplete
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setInputValue(value)

    // Get cursor position
    const cursorPosition = e.target.selectionStart || 0
    const textBeforeCursor = value.substring(0, cursorPosition)
    
    // Check for @ mention
    const atMatch = textBeforeCursor.match(/@(\w*)$/)
    if (atMatch) {
      const query = atMatch[1].toLowerCase()
      const filtered = allUsers.filter(u => 
        u.name.toLowerCase().includes(query)
      ).slice(0, 5)
      setSuggestions(filtered)
      setSuggestionType('user')
      setSelectedSuggestionIndex(0)
      return
    }

    // Check for / task reference
    const slashMatch = textBeforeCursor.match(/\/(\w*)$/)
    if (slashMatch) {
      const query = slashMatch[1].toLowerCase()
      const filtered = allTasks.filter((t: any) => 
        t.title.toLowerCase().includes(query)
      ).slice(0, 5)
      setSuggestions(filtered)
      setSuggestionType('task')
      setSelectedSuggestionIndex(0)
      return
    }

    // No match, hide suggestions
    setSuggestions([])
    setSuggestionType(null)
  }

  // Insert selected suggestion
  const insertSuggestion = (suggestion: any) => {
    const cursorPosition = inputRef.current?.selectionStart || 0
    const textBeforeCursor = inputValue.substring(0, cursorPosition)
    const textAfterCursor = inputValue.substring(cursorPosition)
    
    let newText = ''
    if (suggestionType === 'user') {
      // Replace @query with @username
      newText = textBeforeCursor.replace(/@\w*$/, `@${suggestion.name} `) + textAfterCursor
    } else if (suggestionType === 'task') {
      // Replace /query with /task-title
      const taskRef = suggestion.title.replace(/\s+/g, '-')
      newText = textBeforeCursor.replace(/\/\w*$/, `/${taskRef} `) + textAfterCursor
    }
    
    setInputValue(newText)
    setSuggestions([])
    setSuggestionType(null)
    inputRef.current?.focus()
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    // Handle arrow keys for suggestion navigation
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedSuggestionIndex((prev) => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        )
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedSuggestionIndex((prev) => prev > 0 ? prev - 1 : 0)
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        insertSuggestion(suggestions[selectedSuggestionIndex])
        return
      }
      if (e.key === 'Escape') {
        setSuggestions([])
        setSuggestionType(null)
        return
      }
    }

    // Regular enter to send
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
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
              <h3 className="font-bold text-base">ApliChat AI</h3>
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
      <div className="fixed bottom-6 right-6 w-[420px] h-[650px] bg-white rounded-xl shadow-2xl flex flex-col z-50 border border-gray-200 overflow-hidden">
        {/* Header - Professional */}
        <div className="bg-primary-600 text-white p-5 flex items-center justify-between relative">
          <div className="flex items-center space-x-3">
            <div className="relative w-11 h-11 bg-white/20 rounded-lg flex items-center justify-center shadow-md">
              <CpuChipIcon className="w-6 h-6 text-white" />
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-success-400 rounded-full border-2 border-white animate-pulse"></div>
            </div>
            <div>
              <h3 className="font-bold text-base">ApliChat AI</h3>
              <p className="text-xs text-white/90 flex items-center gap-1">
                <span className="w-2 h-2 bg-success-400 rounded-full"></span>
                Always here to help
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setIsMinimized(true)}
              className="text-white hover:bg-white/20 rounded-lg p-2 transition-all"
              title="Minimize"
            >
              <MinusIcon className="w-5 h-5" />
            </button>
            <button
              onClick={handleClose}
              className="text-white hover:bg-white/20 rounded-lg p-2 transition-all"
              title="Close"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Messages - Clean Design */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-gray-50">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 mt-24">
              <div className="mb-6 inline-block p-6 bg-primary-50 rounded-2xl">
                <ChatBubbleLeftRightIcon className="w-16 h-16 mx-auto text-primary-600" />
              </div>
              <h4 className="text-lg font-bold text-gray-900 mb-2">Welcome to ApliChat AI!</h4>
              <p className="text-sm text-gray-600 mb-4">Your intelligent assistant for task management</p>
              <div className="space-y-2 text-xs text-gray-500">
                <p className="px-4 py-2 bg-white rounded-lg shadow-sm inline-block">"List my tasks"</p>
                <p className="px-4 py-2 bg-white rounded-lg shadow-sm inline-block ml-2">"Tell me about Apliman"</p>
              </div>
            </div>
          )}

          {messages.map((message, index) => (
            <div
              key={message.id}
              className={`flex items-start space-x-3 ${
                message.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''
              } animate-fade-in`}
            >
              {/* Avatar - Professional Style */}
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 shadow-md ${
                  message.role === 'user'
                    ? 'bg-primary-600 text-white'
                    : 'bg-secondary-100 text-secondary-700 border border-secondary-200'
                }`}
              >
                {message.role === 'user' ? (
                  <span className="text-xs font-bold">{getInitials(user?.name)}</span>
                ) : (
                  <CpuChipIcon className="w-5 h-5" />
                )}
              </div>

              {/* Message bubble - Professional */}
              <div
                className={`max-w-[75%] rounded-xl px-4 py-3 shadow-sm ${
                  message.role === 'user'
                    ? 'bg-primary-600 text-white'
                    : 'bg-white text-gray-900 border border-gray-200'
                }`}
              >
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                <div className="flex items-center justify-between mt-2">
                  <p
                    className={`text-xs ${
                      message.role === 'user' ? 'text-primary-100' : 'text-gray-400'
                    }`}
                  >
                    {formatTime(message.createdAt)}
                  </p>
                  {message.role === 'assistant' && index === messages.length - 1 && (
                    <span className="text-xs text-gray-400">✓</span>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Typing indicator - Professional */}
          {isTyping && (
            <div className="flex items-start space-x-3 animate-fade-in">
              <div className="w-9 h-9 rounded-lg bg-secondary-100 text-secondary-700 border border-secondary-200 flex items-center justify-center flex-shrink-0 shadow-md">
                <CpuChipIcon className="w-5 h-5" />
              </div>
              <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
                <div className="flex space-x-1.5">
                  <div className="w-2 h-2 bg-primary-600 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
                <p className="text-xs text-gray-500 mt-2 font-medium">ApliChat AI is thinking...</p>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input - Professional Design */}
        <div className="p-5 border-t border-gray-200 bg-white relative">
          {/* Autocomplete suggestions - Professional */}
          {suggestions.length > 0 && (
            <div className="absolute bottom-full left-5 right-5 mb-3 bg-white border border-gray-200 rounded-xl shadow-xl max-h-56 overflow-y-auto z-10">
              <div className="p-2 bg-primary-50 rounded-t-xl border-b border-gray-200">
                <p className="text-xs font-semibold text-gray-700 px-2">
                  {suggestionType === 'user' ? 'Mention User' : 'Reference Task'}
                </p>
              </div>
              {suggestions.map((suggestion, index) => (
                <div
                  key={suggestion.id}
                  onClick={() => insertSuggestion(suggestion)}
                  className={`px-4 py-3 cursor-pointer flex items-center space-x-3 transition-all ${
                    index === selectedSuggestionIndex
                      ? 'bg-primary-50 border-l-4 border-primary-600'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  {suggestionType === 'user' ? (
                    <>
                      <div className="w-9 h-9 bg-primary-600 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm">
                        <span className="text-xs font-bold text-white">
                          {suggestion.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().substring(0, 2)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{suggestion.name}</p>
                        <p className="text-xs text-gray-500">{suggestion.role}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-9 h-9 bg-primary-50 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm border border-primary-200">
                        <span className="text-base">📋</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{suggestion.title}</p>
                        <p className="text-xs text-gray-500">Priority: {suggestion.priority || 'N/A'}</p>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center space-x-3">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyPress}
              placeholder="Type your message... (@user or /task)"
              className="flex-1 border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all hover:border-gray-400 placeholder:text-gray-400"
              disabled={isTyping}
            />
            <button
              onClick={sendMessage}
              disabled={!inputValue.trim() || isTyping}
              className="bg-primary-600 text-white rounded-lg p-2.5 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              <PaperAirplaneIcon className="w-5 h-5" />
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-3 text-center">
            Use <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono border border-gray-200">@</kbd> for users or <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono border border-gray-200">/</kbd> for tasks
          </p>
        </div>
      </div>

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

