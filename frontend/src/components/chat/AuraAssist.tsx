import { useState, useEffect, useRef } from 'react'
import { XMarkIcon, PaperAirplaneIcon, ChatBubbleLeftRightIcon, MinusIcon, PaperClipIcon } from '@heroicons/react/24/outline'
import { useNavigate } from 'react-router-dom'
import { CpuChipIcon } from '@heroicons/react/24/solid'
import ThinkingIndicator from './ThinkingIndicator'
import AuraBot from './AuraBot'
import { AuraMark } from '@/components/brand/AuraMark'
import { useSelector } from 'react-redux'
import { RootState } from '../../store'
import api from '../../services/api'
import toast from 'react-hot-toast'
import { AnimatePresence, motion } from 'framer-motion'
import { useAiStatus } from '@/hooks/useAiStatus'

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

interface AuraAssistProps {
  isOpen: boolean
  onClose: () => void
}

export default function AuraAssist({ isOpen, onClose }: AuraAssistProps) {
  const navigate = useNavigate()
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [streamingMessage, setStreamingMessage] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [showConfirmClose, setShowConfirmClose] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [allUsers, setAllUsers] = useState<any[]>([])
  const [allTasks, setAllTasks] = useState<any[]>([])
  const [allTickets, setAllTickets] = useState<any[]>([])
  const [suggestionType, setSuggestionType] = useState<'user' | 'task' | 'ticket' | null>(null)
  const [cursorPosition, setCursorPosition] = useState(0)
  const [inlineCompletion, setInlineCompletion] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [attachments, setAttachments] = useState<any[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const { user } = useSelector((state: RootState) => state.auth)
  const { aiEnabled, quotaExhausted, resetCountdown } = useAiStatus()
  const aiBlocked = !aiEnabled || quotaExhausted

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
    // scrollIntoView walks up and scrolls every scrollable ancestor it finds, and an
    // element with overflow:hidden is still scrollable programmatically. So sending a
    // message scrolled the panel itself: the header slid out of view and the composer
    // rose to the top, which is the collapse that appeared on send and undid itself
    // when the reply arrived and something re-rendered. Scrolling the one element
    // that is meant to scroll touches nothing else.
    const list = listRef.current
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' })
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
      // allSettled, not all. These feed three independent autocompletes, and with
      // all() a single failing request threw before any of them were set: one
      // endpoint refusing left @ and / and # all silently empty, which looks exactly
      // like the mention feature being broken rather than one lookup failing.
      const [usersRes, tasksRes, ticketsRes] = await Promise.allSettled([
        api.get('/users'),
        api.get('/tasks', { params: { limit: 500 } }),
        // Everything, open and finished. The default hides resolved and cancelled
        // tickets, which is right for the tickets page and wrong here: asking about
        // one that was closed last week is an ordinary thing to do. The page size is
        // ten by default, so without a limit only the ten newest could be mentioned.
        api.get('/tickets', { params: { statusType: 'ALL', limit: 200 } })
      ])

      const unwrap = (r: any, key: string) => {
        if (r.status !== 'fulfilled') {
          console.error(`Autocomplete: ${key} could not be loaded`, r.reason?.response?.data ?? r.reason)
          return []
        }
        const body = r.value?.data
        return Array.isArray(body) ? body : (body?.[key] ?? [])
      }

      setAllUsers(unwrap(usersRes, 'users'))
      const tasks = unwrap(tasksRes, 'tasks')
      setAllTasks(tasks)

      const tickets = unwrap(ticketsRes, 'tickets')
      setAllTickets(tickets)
      // One line, and only when something is missing: an autocomplete that quietly
      // has nothing to offer is indistinguishable from one that is broken.
      if (tickets.length === 0 || tasks.length === 0) {
        console.warn('Autocomplete loaded with gaps:', { tasks: tasks.length, tickets: tickets.length })
      }
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
        
        // 1. Upload to server for persistence
        const res = await api.post('/files/upload/temp', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })

        // 2. Read as Base64 for IMMEDIATE AI analysis (eliminates fetch failures)
        const base64 = await new Promise<string>(async (resolve) => {
          if (file.type.startsWith('image/')) {
            try {
              // Dynamically import to avoid top-level issues
              const imageCompression = (await import('browser-image-compression')).default;
              
              const options = {
                maxSizeMB: 1, // Aggressive memory scaling to bypass AI token limits
                maxWidthOrHeight: 1024,
                useWebWorker: true,
                fileType: file.type // Preserve original type
              };
              
              const compressedFile = await imageCompression(file, options);
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(compressedFile);
            } catch (error) {
              console.error('Image compression failed, falling back to original:', error);
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(file);
            }
          } else {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          }
        });
        
        newAttachments.push({
          name: file.name,
          url: res.data.url,
          type: file.type,
          base64: base64.split(',')[1] // Just the raw data (strip prefix)
        })
      }
      
      setAttachments(newAttachments)
      toast.success('Asset(s) Attached')
    } catch (error) {
      console.error('File select error:', error);
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
      const response = await api.post(
        '/chat/message',
        {
          message: currentMessage,
          sessionId,
          files: currentAttachments.map(a => ({ name: a.name, url: a.url, type: a.type, base64: a.base64 }))
        },
        // The shared client waits two minutes, which suits a large upload and not a
        // conversation: two minutes of the thinking indicator is indistinguishable
        // from a hang. The server gives up at fifty seconds and answers, so this only
        // has to outlast that answer arriving, and guarantees the indicator stops
        // either way, since a request that settles is what clears it.
        { timeout: 65000 },
      )

      if (response.data.sessionId && !sessionId) {
        setSessionId(response.data.sessionId)
      }

      // Safely extract the assistant response content
      const rawContent = response.data?.message?.content
      const fullMessage = typeof rawContent === 'string' ? rawContent : (
        typeof response.data?.message === 'string' ? response.data.message : 'I encountered an issue processing the response.'
      )
      const assistantMessageId = response.data?.message?.id || Date.now().toString()
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
    // Bounded to two words. Unbounded, an @ typed early kept matching every word
    // after it, so the member list reopened over the rest of the sentence.
    const atMatch = textBeforeCursor.match(/@(\w*(?:\s\w*)?)$/)
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
    // Task titles are long, so a few words are allowed, but not the whole message.
    const slashMatch = textBeforeCursor.match(/\/([\w-]*(?:\s[\w-]*){0,3})$/)
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

    // Check for # ticket reference (inline autocomplete)
    //
    // The pattern deliberately stops at whitespace. It used to allow spaces, so once
    // a # had been typed anywhere it kept matching everything after it: pick a
    // ticket, carry on writing the sentence, and the ticket list stayed open over the
    // rest of the message because the # was still back there matching forwards.
    const hashMatch = textBeforeCursor.match(/#([\w-]*)$/)
    if (hashMatch) {
      const query = hashMatch[1].toLowerCase().trim()

      // Cancelled and rejected tickets stay out: those were withdrawn rather than
      // finished, so naming one is rarely the intent. Resolved ones are kept, since
      // asking about something that was dealt with last week is ordinary.
      const activeTickets = allTickets.filter(
        (t: any) => !['REJECTED', 'CANCELLED'].includes(t.status),
      )

      // A ticket without a number is possible, and calling toLowerCase on the missing
      // one threw inside the keystroke handler, which took the whole box down.
      const matches = (t: any) => {
        const number = String(t.ticketNumber ?? '').toLowerCase()
        const title = String(t.title ?? '').toLowerCase()
        return number.includes(query) || title.includes(query)
      }

      if (query.length >= 1) {
        const found = activeTickets.filter(matches).slice(0, 5)

        // Complete only when the number genuinely starts with what has been typed.
        // The old test asked whether the query contained the ticket number at index
        // zero, which is the comparison backwards, so it spliced in the wrong text.
        const startsWith = found.find((t: any) =>
          String(t.ticketNumber ?? '').toLowerCase().startsWith(query),
        )
        setInlineCompletion(
          startsWith ? String(startsWith.ticketNumber).substring(query.length) : '',
        )

        setSuggestionType(found.length > 0 ? 'ticket' : null)
        setSuggestions(found)
        return
      }

      // Just a # so far: offer the most recent, since a ticket someone is about to
      // mention is far more likely to be a current one.
      setInlineCompletion('')
      setSuggestionType('ticket')
      setSuggestions(activeTickets.slice(0, 5))
      return
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
    } else if (suggestionType === 'ticket') {
      const hashIndex = textBeforeCursor.lastIndexOf('#')
      const beforeTicket = textBeforeCursor.substring(0, hashIndex)
      newText = beforeTicket + `#${suggestion.ticketNumber} ` + textAfterCursor
      newCursorPos = beforeTicket.length + suggestion.ticketNumber.length + 2
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

  /**
   * Minimised: the robot, and how much is waiting.
   *
   * It used to be a full-width blue bar carrying a logo, a title, a subtitle, an
   * expand button and a close button, which is more furniture than a minimised thing
   * should own. Minimising is a request for it to get out of the way, and answering
   * that with a banner is answering the wrong question.
   *
   * So it collapses to the same character that opened it, with the count on its
   * shoulder. Everything else is available by clicking it.
   */
  if (isMinimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <motion.button
          onClick={() => setIsMinimized(false)}
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.95 }}
          aria-label={`Open Aura Assist, ${messages.length} messages`}
          title="Open Aura Assist"
          className="group relative block rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
        >
          <AuraBot className="h-16 w-16 drop-shadow-[0_6px_14px_rgba(15,23,42,0.35)]" />

          {messages.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-6 min-w-[1.5rem] items-center justify-center rounded-full border-2 border-white bg-primary-600 px-1.5 text-[11px] font-semibold tabular-nums text-white shadow-sm dark:border-gray-900">
              {messages.length > 99 ? '99+' : messages.length}
            </span>
          )}

          {/* Closing is a rarer intent than reopening, so it stays out of the way
              until the pointer is here rather than sitting beside the count. */}
          <span
            role="button"
            tabIndex={0}
            aria-label="Close Aura Assist"
            onClick={(e) => {
              e.stopPropagation()
              handleClose()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation()
                handleClose()
              }
            }}
            className="absolute -bottom-1 -left-1 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 opacity-0 shadow-sm transition-opacity hover:text-gray-800 focus:opacity-100 group-hover:opacity-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:text-gray-100"
          >
            <XMarkIcon className="h-3.5 w-3.5" />
          </span>
        </motion.button>
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
            className="fixed bottom-4 right-4 left-4 z-50 grid overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl sm:left-auto sm:bottom-6 sm:right-6 sm:w-[380px] dark:border-gray-700 dark:bg-gray-800"
            style={{
              // Rows, not flex. The composer is pinned by the grid definition itself,
              // so it cannot be pushed anywhere by whatever the history contains.
              gridTemplateRows: 'auto minmax(0, 1fr) auto',
              height: 'min(600px, calc(100dvh - 2rem))',
            }}
          >
            <div className="contents">
              {/* Chat Header */}
              <div className="flex items-center justify-between px-5 py-4 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 flex-shrink-0 z-10 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50 dark:bg-primary-900/30">
                      <AuraMark className="h-6 w-6" />
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-green-500 dark:border-gray-800"></div>
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold tracking-tight text-gray-900 dark:text-white">Aura Assist</h2>
                    <p className="text-[11px] font-medium tracking-wide text-gray-500 dark:text-gray-400">Aura Operations</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button 
                     onClick={() => setIsMinimized(true)}
                     className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-500 dark:text-gray-400"
                     aria-label="Minimize Chat"
                  >
                     <MinusIcon className="w-5 h-5" />
                  </button>
                  <button 
                     onClick={handleClose}
                     className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-lg transition-colors"
                     aria-label="Close Chat"
                  >
                     <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Message History */}
              <div
                ref={listRef}
                className="min-h-0 overflow-y-auto overscroll-contain bg-gray-50/40 p-4 space-y-3 dark:bg-gray-900/40"
              >
                {messages.length === 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mt-12 px-6"
                  >
                    <div className="mb-6 inline-block p-5 bg-primary-50 dark:bg-primary-900/30 rounded-full">
                      <ChatBubbleLeftRightIcon className="w-12 h-12 mx-auto text-primary-600 dark:text-primary-400" />
                    </div>
                    <h4 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Aura Assist</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium tracking-wider mb-4">
                      Ready for multimodal analysis
                    </p>
                    
                    {/* Compact Mention Hints */}
                    <div className="flex items-center justify-center gap-3 text-[12px] text-gray-500 dark:text-gray-400">
                      <span className="flex items-center gap-1 bg-gray-50 dark:bg-gray-900/40 px-2 py-1 rounded-md border border-gray-100 dark:border-gray-700">
                        <span className="font-semibold text-primary-600 dark:text-primary-400">@</span> members
                      </span>
                      <span className="flex items-center gap-1 bg-gray-50 dark:bg-gray-900/40 px-2 py-1 rounded-md border border-gray-100 dark:border-gray-700">
                        <span className="font-semibold text-primary-600 dark:text-primary-400">/</span> tasks
                      </span>
                      <span className="flex items-center gap-1 bg-gray-50 dark:bg-gray-900/40 px-2 py-1 rounded-md border border-gray-100 dark:border-gray-700">
                        <span className="font-semibold text-primary-600 dark:text-primary-400">#</span> tickets
                      </span>
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
                      message.role === 'user' ? 'bg-primary-600 text-white border-primary-500' : 'bg-white dark:bg-gray-800 text-secondary-600 dark:text-secondary-400 border-gray-100 dark:border-gray-700'
                    }`}>
                      {message.role === 'user' ? <span className="text-xs font-semibold">{getInitials(user?.name)}</span> : <CpuChipIcon className="w-5 h-5" />}
                    </div>
                    
                    <div className={`flex flex-col max-w-[82%] ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <div className={`rounded-xl px-4 py-2.5 shadow-sm relative group transition-all ${
                        message.role === 'user' ? 'bg-primary-600 text-white rounded-tr-none' : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-tl-none'
                      }`}>
                        <div className="text-[13px] leading-relaxed relative z-10 font-medium whitespace-pre-wrap">
                          {(message.role === 'assistant' ? humanizeText(message.content) : message.content)
                            .split(/(\s+)/)
                            .map((part, i) => {
                              // Highlight Mentions (@user)
                              if (part.startsWith('@')) {
                                return (
                                  <span key={i} className={`font-semibold underline decoration-2 ${message.role === 'user' ? 'text-white decoration-white/30' : 'text-primary-600 dark:text-primary-400 decoration-primary-200'}`}>
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
                                    className={`font-semibold italic underline decoration-2 transition-all hover:scale-105 active:scale-95 ${message.role === 'user' ? 'text-white decoration-white/30' : 'text-indigo-600 dark:text-indigo-400 decoration-indigo-200'}`}
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
                                className={`flex items-center gap-1.5 p-1 pr-2.5 rounded-lg text-xs cursor-pointer transition-all border ${
                                  message.role === 'user' 
                                    ? 'bg-primary-700/60 border-primary-500/50 hover:bg-primary-700' 
                                    : 'bg-gray-50 dark:bg-gray-900/40 border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-700 dark:border-gray-700'
                                }`}
                              >
                                <div className={`w-6 h-6 rounded flex items-center justify-center ${message.role === 'user' ? 'bg-primary-600' : 'bg-primary-50 dark:bg-primary-900/30'}`}>
                                  {file.type?.startsWith('image/') ? (
                                    <img src={file.url} className="w-full h-full object-cover rounded" alt="" />
                                  ) : (
                                    <PaperClipIcon className={`w-3 h-3 ${message.role === 'user' ? 'text-primary-100' : 'text-primary-600 dark:text-primary-400'}`} />
                                  )}
                                </div>
                                <span className="truncate max-w-[80px] font-semibold">{file.name}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className={`text-xs mt-1 font-semibold uppercase tracking-wide opacity-60 ${message.role === 'user' ? 'mr-1' : 'ml-1'}`}>
                        {formatTime(message.createdAt)}
                      </span>
                    </div>
                  </motion.div>
                ))}

                {streamingMessage && (
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-secondary-600 dark:text-secondary-400 flex items-center justify-center flex-shrink-0 shadow-sm">
                      <CpuChipIcon className="w-5 h-5" />
                    </div>
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-xl rounded-tl-none px-4 py-2.5 max-w-[82%] shadow-sm">
                      <p className="text-[13px] leading-relaxed font-medium">{humanizeText(streamingMessage)}</p>
                    </div>
                  </div>
                )}

                {isTyping && !streamingMessage && <ThinkingIndicator />}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <div className="relative border-t border-gray-100 bg-white p-3.5 dark:border-gray-700 dark:bg-gray-800">
                {/* Autocomplete Suggestions */}
                <AnimatePresence>
                  {suggestions.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute left-4 right-4 bottom-full mb-3 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 overflow-hidden z-20 max-h-40"
                    >
                      <div className="p-2 border-b border-gray-50 dark:border-gray-700 flex items-center justify-between bg-gray-50/50 dark:bg-gray-900/40">
                        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-wide">
                          Select {suggestionType === 'user' ? 'a Team Member' : suggestionType === 'task' ? 'a Task' : 'a Ticket'}
                        </span>
                      </div>
                      <div className="overflow-y-auto max-h-32">
                        {suggestions.map((item, idx) => (
                          <button
                            key={idx}
                            onClick={() => applySuggestion(item)}
                            className="w-full text-left px-4 py-2 text-[12px] hover:bg-primary-50 dark:hover:bg-primary-900/30 border-b border-gray-50 dark:border-gray-700 last:border-0 transition-colors flex items-center justify-between group"
                          >
                            <span className="text-gray-700 dark:text-gray-200 font-medium group-hover:text-primary-700 truncate max-w-[200px]">
                              {suggestionType === 'user' ? item.name : suggestionType === 'task' ? item.title : item.title}
                            </span>
                            <span className="text-xs font-semibold text-gray-300 group-hover:text-primary-300">
                              {suggestionType === 'user' ? item.email : suggestionType === 'task' ? (item.taskNumber || 'TSK') : item.ticketNumber}
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
                          className="flex-shrink-0 group relative flex items-center gap-2 bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-700 rounded-xl px-2 py-1.5 shadow-sm"
                        >
                          <div className="w-8 h-8 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 overflow-hidden flex items-center justify-center">
                            {file.type?.startsWith('image/') ? (
                              <img 
                                src={file.base64 ? `data:${file.type};base64,${file.base64}` : file.url} 
                                className="w-full h-full object-cover" 
                                alt="" 
                              />
                            ) : (
                              <PaperClipIcon className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                            )}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 truncate max-w-[90px]">{file.name}</span>
                            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-tighter">Ready to analyze</span>
                          </div>
                          <button 
                            onClick={() => removeAttachment(idx)}
                            className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
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
                      disabled={isTyping || isUploading || aiBlocked}
                      placeholder={aiBlocked ? (quotaExhausted ? `AI is rate limited${resetCountdown ? `, back in ${resetCountdown}` : ', try again shortly'}` : 'AI is not enabled') : isUploading ? 'Uploading assets...' : 'Leave a message'}
                      className={`w-full bg-gray-50/50 border border-transparent focus:border-primary-500 focus:bg-white dark:focus:bg-gray-700 rounded-xl pl-4 pr-12 py-3 text-[13px] outline-none transition-all shadow-inner font-medium ${aiBlocked ? 'opacity-60 cursor-not-allowed bg-gray-100 dark:bg-gray-800' : ''}`}
                    />
                    
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isTyping || isUploading}
                      title="Attach Files"
                      className="absolute right-2 top-1.5 p-2 text-gray-500 dark:text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-xl transition-all"
                    >
                      <PaperClipIcon className={`w-5 h-5 ${attachments.length > 0 ? 'text-primary-600 dark:text-primary-400' : ''}`} />
                    </button>
                  </div>
                  
                  <button
                    onClick={sendMessage}
                    disabled={(!inputValue.trim() && attachments.length === 0) || isTyping || isUploading || aiBlocked}
                    title={aiBlocked ? (quotaExhausted ? `The AI provider rate limited this company's key${resetCountdown ? `. Back in ${resetCountdown}` : '. Try again shortly'}` : 'AI is not enabled for your company') : ''}
                    className={`p-3 rounded-xl transition-all shadow-md ${
                      (inputValue.trim() || attachments.length > 0) && !isTyping && !isUploading && !aiBlocked
                        ? 'bg-primary-600 text-white hover:bg-primary-700 hover:scale-105 active:scale-95'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
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
                  accept="image/*,.pdf,.doc,.docx,.txt,.csv,.json,.md"
                  className="hidden" 
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Closing the panel: keep the conversation, or clear it. */}
      {showConfirmClose && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 animate-fade-in"
          onClick={cancelClose}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="end-chat-title"
            aria-describedby="end-chat-desc"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.key === 'Escape' && cancelClose()}
            className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-lg dark:border-gray-700 dark:bg-gray-800"
          >
            <h2 id="end-chat-title" className="text-lg font-semibold text-gray-900 dark:text-white">
              Close this conversation?
            </h2>
            <p id="end-chat-desc" className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
              Your messages are saved, so you can pick this conversation back up later. Clearing it
              starts you fresh next time and cannot be undone.
            </p>

            <div className="mt-6 flex flex-col gap-2">
              {/* Safe action first: this is what the close button implied. */}
              <button
                autoFocus
                onClick={() => {
                  setShowConfirmClose(false)
                  onClose()
                }}
                className="btn-primary w-full justify-center py-2.5"
              >
                Close and keep history
              </button>
              <button onClick={confirmClose} className="btn-secondary w-full justify-center py-2.5">
                Clear conversation and close
              </button>
              <button
                onClick={cancelClose}
                className="w-full py-2 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

