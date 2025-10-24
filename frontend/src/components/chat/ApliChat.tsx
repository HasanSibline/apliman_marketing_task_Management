import { useState, useEffect, useRef } from 'react'
import { XMarkIcon, PaperAirplaneIcon, ChatBubbleLeftRightIcon, MinusIcon, ChevronUpIcon } from '@heroicons/react/24/outline'
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
}

interface ApliChatProps {
  isOpen: boolean
  onClose: () => void
}

export default function ApliChat({ isOpen, onClose }: ApliChatProps) {
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
  const { user } = useSelector((state: RootState) => state.auth)

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
    setStreamingMessage('')

    try {
      const response = await api.post('/chat/message', {
        message: inputValue,
        sessionId,
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
      }

      setMessages((prev) => [...prev, assistantMessage])
      setStreamingMessage('')
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

  // Handle input changes with inline autocomplete
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setInputValue(value)

    // Get cursor position
    const cursorPos = e.target.selectionStart || 0
    setCursorPosition(cursorPos)
    const textBeforeCursor = value.substring(0, cursorPos)
    
    // Check for @ mention (inline autocomplete)
    const atMatch = textBeforeCursor.match(/@([\w]*)$/)
    if (atMatch) {
      const query = atMatch[1].toLowerCase()
      
      if (query.length > 0) {
        // Find first user that starts with the query
        const matchedUser = allUsers.find(u => 
          u.name.toLowerCase().startsWith(query)
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
      const query = slashMatch[1].toLowerCase()
      
      if (query.length > 0) {
        // Find first task that starts with the query
        const matchedTask = allTasks.find((t: any) => 
          t.title.toLowerCase().startsWith(query)
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

  const handleKeyPress = (e: React.KeyboardEvent) => {
    // Handle inline completion with Space or Tab
    if (inlineCompletion && (e.key === ' ' || e.key === 'Tab')) {
      e.preventDefault()
      
      if (suggestions.length > 0) {
        const suggestion = suggestions[0]
    const textBeforeCursor = inputValue.substring(0, cursorPosition)
    const textAfterCursor = inputValue.substring(cursorPosition)
    
    let newText = ''
        let newCursorPos = 0
        
    if (suggestionType === 'user') {
          const beforeMention = textBeforeCursor.replace(/@[\w]*$/, '')
          newText = beforeMention + `@${suggestion.name} ` + textAfterCursor
          newCursorPos = beforeMention.length + suggestion.name.length + 2
    } else if (suggestionType === 'task') {
          const beforeTask = textBeforeCursor.replace(/\/[\w\s-]*$/, '')
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
        return
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
      <AnimatePresence>
        {isOpen && !isMinimized && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed bottom-6 right-6 w-[400px] h-[500px] bg-white rounded-xl shadow-2xl flex flex-col z-50 border border-gray-200 overflow-hidden"
          >
            {/* Header - Professional */}
            <div className="bg-primary-600 text-white p-4 flex items-center justify-between relative">
          <div className="flex items-center space-x-3">
                <div className="relative w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center shadow-md">
              <CpuChipIcon className="w-6 h-6 text-white" />
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-success-400 rounded-full border-2 border-white animate-pulse"></div>
            </div>
            <div>
                  <h3 className="font-bold text-base">ApliChat AI</h3>
                  <p className="text-xs text-white/90">
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
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
          {messages.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="text-center text-gray-500 mt-20"
                >
                  <div className="mb-5 inline-block p-5 bg-primary-50 rounded-2xl">
                    <ChatBubbleLeftRightIcon className="w-14 h-14 mx-auto text-primary-600" />
                  </div>
                  <h4 className="text-base font-bold text-gray-900 mb-2">Welcome to ApliChat AI!</h4>
                  <p className="text-sm text-gray-600 mb-3">Your intelligent assistant</p>
                  <div className="space-y-2 text-xs text-gray-500">
                    <p className="px-3 py-1.5 bg-white rounded-lg shadow-sm inline-block">"List my tasks"</p>
                    <p className="px-3 py-1.5 bg-white rounded-lg shadow-sm inline-block ml-2">"Tell me about Apliman"</p>
            </div>
                </motion.div>
          )}

          {messages.map((message) => (
                <motion.div
              key={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`flex items-start space-x-2.5 ${
                message.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''
              }`}
            >
                  {/* Avatar - Professional Style */}
              <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm ${
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
                    className={`max-w-[75%] rounded-xl px-3.5 py-2.5 shadow-sm ${
                  message.role === 'user'
                        ? 'bg-primary-600 text-white'
                    : 'bg-white text-gray-900 border border-gray-200'
                }`}
              >
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                <p
                      className={`text-xs mt-1.5 ${
                        message.role === 'user' ? 'text-primary-100' : 'text-gray-400'
                  }`}
                >
                  {formatTime(message.createdAt)}
                </p>
              </div>
                </motion.div>
              ))}

              {/* Streaming message - Typing effect */}
              {streamingMessage && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-start space-x-2.5"
                >
                  <div className="w-8 h-8 rounded-lg bg-secondary-100 text-secondary-700 border border-secondary-200 flex items-center justify-center flex-shrink-0 shadow-sm">
                    <CpuChipIcon className="w-5 h-5" />
                  </div>
                  <div className="max-w-[75%] bg-white text-gray-900 border border-gray-200 rounded-xl px-3.5 py-2.5 shadow-sm">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{streamingMessage}</p>
                  </div>
                </motion.div>
              )}

              {/* Typing indicator - Professional */}
              {isTyping && !streamingMessage && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-start space-x-2.5"
                >
                  <div className="w-8 h-8 rounded-lg bg-secondary-100 text-secondary-700 border border-secondary-200 flex items-center justify-center flex-shrink-0 shadow-sm">
                    <CpuChipIcon className="w-5 h-5" />
              </div>
                  <div className="bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 shadow-sm">
                <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-primary-600 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                      <div className="w-2 h-2 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
                </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>

            {/* Input - Professional Design with Inline Completion */}
            <div className="p-4 border-t border-gray-200 bg-white relative">
          <div className="flex items-center space-x-2">
                <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyPress}
                    placeholder="Type your message... (@user or /task)"
                    className="w-full border border-gray-300 rounded-lg px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all hover:border-gray-400 placeholder:text-gray-400 bg-transparent relative z-10 pr-20"
              disabled={isTyping}
                    style={{ caretColor: 'auto' }}
                  />
                  {/* Inline completion overlay - Cut-edge styled */}
                  {inlineCompletion && (
                    <div className="absolute left-3.5 top-2 pointer-events-none text-sm overflow-hidden whitespace-nowrap right-24">
                      <span className="invisible">{inputValue}</span>
                      <span className="text-gray-400 bg-gray-50/80 px-1.5 py-0.5 rounded-md border border-gray-200/50 backdrop-blur-sm font-medium">
                        {inlineCompletion}
                      </span>
                    </div>
                  )}
                </div>
            <button
              onClick={sendMessage}
              disabled={!inputValue.trim() || isTyping}
                  className="bg-primary-600 text-white rounded-lg p-2 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm flex-shrink-0"
            >
              <PaperAirplaneIcon className="w-5 h-5" />
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2 text-center">
                Use <kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono border border-gray-200">@</kbd> for users or <kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono border border-gray-200">/</kbd> for tasks • <kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono border border-gray-200">Space</kbd> or <kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono border border-gray-200">Tab</kbd> to complete
          </p>
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

