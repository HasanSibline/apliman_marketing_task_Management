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

  // Minimized view
  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 w-80 bg-white rounded-lg shadow-2xl z-50 border border-gray-200">
        <div 
          className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-4 rounded-lg flex items-center justify-between cursor-pointer hover:from-indigo-700 hover:to-purple-700 transition"
          onClick={() => setIsMinimized(false)}
        >
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-pink-500 rounded-full flex items-center justify-center shadow-lg">
              <CpuChipIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-semibold">ApliChat</h3>
              <p className="text-xs opacity-90">{messages.length} messages</p>
            </div>
          </div>
          <div className="flex items-center space-x-1">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setIsMinimized(false)
              }}
              className="text-white hover:bg-white/20 rounded-full p-2 transition"
              title="Expand"
            >
              <ChevronUpIcon className="w-5 h-5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleClose()
              }}
              className="text-white hover:bg-white/20 rounded-full p-2 transition"
              title="Close"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Full view
  return (
    <>
      <div className="fixed bottom-4 right-4 w-96 h-[600px] bg-white rounded-lg shadow-2xl flex flex-col z-50 border border-gray-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-4 rounded-t-lg flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-pink-500 rounded-full flex items-center justify-center shadow-lg">
              <CpuChipIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-semibold">ApliChat</h3>
              <p className="text-xs opacity-90">Your AI Assistant</p>
            </div>
          </div>
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setIsMinimized(true)}
              className="text-white hover:bg-white/20 rounded-full p-2 transition"
              title="Minimize"
            >
              <MinusIcon className="w-5 h-5" />
            </button>
            <button
              onClick={handleClose}
              className="text-white hover:bg-white/20 rounded-full p-2 transition"
              title="Close"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 mt-20">
              <ChatBubbleLeftRightIcon className="w-16 h-16 mx-auto mb-4 text-gray-400" />
              <p className="text-sm">Start a conversation with ApliChat!</p>
              <p className="text-xs mt-2">
                Try: "List my tasks" or "Tell me about Apliman"
              </p>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex items-start space-x-2 ${
                message.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''
              }`}
            >
              {/* Avatar */}
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  message.role === 'user'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-md'
                }`}
              >
                {message.role === 'user' ? (
                  <span className="text-xs font-medium">{getInitials(user?.name)}</span>
                ) : (
                  <CpuChipIcon className="w-5 h-5" />
                )}
              </div>

              {/* Message bubble */}
              <div
                className={`max-w-[75%] rounded-lg px-4 py-2 ${
                  message.role === 'user'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-900 border border-gray-200'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                <p
                  className={`text-xs mt-1 ${
                    message.role === 'user' ? 'text-indigo-200' : 'text-gray-400'
                  }`}
                >
                  {formatTime(message.createdAt)}
                </p>
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {isTyping && (
            <div className="flex items-start space-x-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0 shadow-md">
                <CpuChipIcon className="w-5 h-5 text-white" />
              </div>
              <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
                <p className="text-xs text-gray-400 mt-1">ApliChat is writing...</p>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-gray-200 bg-white rounded-b-lg relative">
          {/* Autocomplete suggestions */}
          {suggestions.length > 0 && (
            <div className="absolute bottom-full left-4 right-4 mb-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto z-10">
              {suggestions.map((suggestion, index) => (
                <div
                  key={suggestion.id}
                  onClick={() => insertSuggestion(suggestion)}
                  className={`px-4 py-2 cursor-pointer flex items-center space-x-2 ${
                    index === selectedSuggestionIndex
                      ? 'bg-indigo-50 border-l-4 border-indigo-600'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  {suggestionType === 'user' ? (
                    <>
                      <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-medium text-white">
                          {suggestion.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().substring(0, 2)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{suggestion.name}</p>
                        <p className="text-xs text-gray-500">{suggestion.role}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-8 h-8 bg-purple-100 rounded flex items-center justify-center flex-shrink-0">
                        <span className="text-xs text-purple-600">📋</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{suggestion.title}</p>
                        <p className="text-xs text-gray-500">Priority: {suggestion.priority || 'N/A'}</p>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center space-x-2">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyPress}
              placeholder="Type a message... (@user or /task)"
              className="flex-1 border border-gray-300 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              disabled={isTyping}
            />
            <button
              onClick={sendMessage}
              disabled={!inputValue.trim() || isTyping}
              className="bg-indigo-600 text-white rounded-full p-2 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              <PaperAirplaneIcon className="w-5 h-5" />
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2 text-center">
            Tip: Use @ to mention users or / to reference tasks
          </p>
        </div>
      </div>

      {/* Confirm close modal */}
      {showConfirmClose && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg p-6 max-w-sm mx-4">
            <h3 className="text-lg font-semibold mb-2">End Chat?</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to end this chat? Your conversation will be saved.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={cancelClose}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmClose}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
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

