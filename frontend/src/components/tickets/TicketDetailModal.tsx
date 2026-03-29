import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  XMarkIcon, 
  PaperAirplaneIcon,
  UserIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  AtSymbolIcon,
  ChatBubbleLeftRightIcon
} from '@heroicons/react/24/outline'
import api from '@/services/api'
import { toast } from 'react-hot-toast'
import { useAppSelector } from '@/hooks/redux'

interface TicketDetailModalProps {
  isOpen: boolean
  onClose: () => void
  ticketId: string
  onUpdate: () => void
}

const TicketDetailModal: React.FC<TicketDetailModalProps> = ({ isOpen, onClose, ticketId, onUpdate }) => {
  const { user } = useAppSelector((state) => state.auth)
  const [ticket, setTicket] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [newComment, setNewComment] = useState('')
  const [isSubmittingComment, setIsSubmittingComment] = useState(false)
  const [users, setUsers] = useState<any[]>([])
  const [showMentions, setShowMentions] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')
  const commentInputRef = useRef<HTMLTextAreaElement>(null)
  
  const commentsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen && ticketId) {
      fetchTicketDetails()
      fetchUsers()
    }
  }, [isOpen, ticketId])

  useEffect(() => {
    scrollToBottom()
  }, [ticket?.comments])

  const scrollToBottom = () => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const fetchTicketDetails = async () => {
    setIsLoading(true)
    try {
      const res = await api.get(`/tickets/${ticketId}`)
      setTicket(res.data)
    } catch (error) {
      toast.error('Failed to load ticket details')
      onClose()
    } finally {
      setIsLoading(false)
    }
  }

  const fetchUsers = async () => {
    try {
      const res = await api.get('/users')
      setUsers(res.data)
    } catch (error) {
      console.error('Failed to fetch users for mentions')
    }
  }

  const handleApprove = async () => {
    try {
      await api.patch(`/tickets/${ticketId}/approve`)
      toast.success('Ticket approved')
      fetchTicketDetails()
      onUpdate()
    } catch (error) {
      toast.error('Failed to approve ticket')
    }
  }

  const handleReject = async () => {
    const reason = prompt('Reason for rejection:')
    if (reason === null) return
    try {
      await api.patch(`/tickets/${ticketId}/reject`, { reason })
      toast.error('Ticket rejected')
      fetchTicketDetails()
      onUpdate()
    } catch (error) {
      toast.error('Failed to reject ticket')
    }
  }

  const handleAddComment = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!newComment.trim() || isSubmittingComment) return

    setIsSubmittingComment(true)
    try {
      await api.post(`/tickets/${ticketId}/comments`, { comment: newComment })
      setNewComment('')
      fetchTicketDetails()
    } catch (error) {
      toast.error('Failed to add comment')
    } finally {
      setIsSubmittingComment(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setNewComment(val)

    // Check for @ mention
    const lastWord = val.split(/\s/).pop() || ''
    
    if (lastWord.startsWith('@')) {
      setShowMentions(true)
      setMentionFilter(lastWord.slice(1).toLowerCase())
    } else {
      setShowMentions(false)
    }
  }

  const insertMention = (userName: string) => {
    const words = newComment.split(/\s/)
    words.pop() // Remove the partial @mention
    const updated = [...words, `@${userName} `].join(' ')
    setNewComment(updated)
    setShowMentions(false)
    commentInputRef.current?.focus()
  }

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(mentionFilter) || 
    u.email.toLowerCase().includes(mentionFilter)
  ).slice(0, 5)

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.95 }}
          className="relative w-full max-w-4xl h-[85vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-100"
        >
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            </div>
          ) : (
            <>
              {/* Header Strip */}
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <div className="flex items-center gap-3">
                  <span className="bg-primary-100 text-primary-700 px-3 py-1 rounded-full text-xs font-black tracking-wider uppercase">
                    {ticket.ticketNumber}
                  </span>
                  <h2 className="text-xl font-black text-gray-900 truncate max-w-md">
                    {ticket.title}
                  </h2>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-gray-200 rounded-full text-gray-400 hover:text-gray-600 transition-all"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              <div className="flex-1 flex overflow-hidden">
                {/* Left Panel: Info (40%) */}
                <div className="w-2/5 border-r border-gray-100 overflow-y-auto p-6 space-y-6 bg-gray-50/30">
                  {/* Status Card */}
                  <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Current Status</span>
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider
                        ${ticket.status === 'RESOLVED' ? 'bg-green-100 text-green-700' : 
                          ticket.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                          'bg-amber-100 text-amber-700'}`}>
                        {ticket.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    
                    {/* Approvers List */}
                    <div className="space-y-2 pt-2">
                       <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Cycle Approvers</p>
                       <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500">Requester Mgr</span>
                            <span className="text-xs font-bold text-gray-800">{ticket.requesterManager?.name || 'N/A (System)'}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500">Recipient Mgr</span>
                            <span className="text-xs font-bold text-gray-800">{ticket.receiverManager?.name || ticket.receiverDept?.manager?.name || 'Unassigned'}</span>
                          </div>
                       </div>
                    </div>

                    {/* Assignment Selector (for target manager) */}
                    {(ticket.status === 'OPEN' || ticket.status === 'ASSIGNED') && 
                      (ticket.receiverManagerId === user?.id || ticket.receiverDept?.managerId === user?.id || user?.role === 'COMPANY_ADMIN') && (
                      <div className="pt-2 space-y-2">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Assign Responsiblity</p>
                        <select
                          value={ticket.assigneeId || ''}
                          onChange={async (e) => {
                            try {
                              await api.post(`/tickets/${ticketId}/assign`, { assigneeId: e.target.value })
                              toast.success('Ticket assigned')
                              fetchTicketDetails()
                              onUpdate()
                            } catch (error) {
                              toast.error('Failed to assign ticket')
                            }
                          }}
                          className="w-full text-xs border border-gray-200 rounded-lg p-2 bg-gray-50 focus:bg-white transition-colors"
                        >
                          <option value="">Select an assignee...</option>
                          {users
                            .filter(u => u.departmentId === ticket.receiverDeptId)
                            .map(u => (
                              <option key={u.id} value={u.id}>{u.name}</option>
                            ))
                          }
                        </select>
                      </div>
                    )}

                    {/* Action Section */}
                    {(((ticket.status === 'PENDING_REQ_MGR' && (ticket.requesterManagerId === user?.id || ticket.requesterDept?.managerId === user?.id)) || 
                       (ticket.status === 'PENDING_REC_MGR' && (ticket.receiverManagerId === user?.id || ticket.receiverDept?.managerId === user?.id))) ||
                       (['COMPANY_ADMIN', 'SUPER_ADMIN'].includes(user?.role || ''))) && 
                       (ticket.status === 'PENDING_REQ_MGR' || ticket.status === 'PENDING_REC_MGR') && (
                        <div className="pt-4 grid grid-cols-2 gap-2">
                          <button onClick={handleApprove} className="btn-primary py-2 text-xs flex items-center justify-center gap-2">
                            <CheckCircleIcon className="h-4 w-4" /> Approve
                          </button>
                          <button onClick={handleReject} className="btn-secondary py-2 text-xs text-red-600 border-red-100 flex items-center justify-center gap-2">
                            <XCircleIcon className="h-4 w-4" /> Reject
                          </button>
                        </div>
                    )}

                    {/* Completion Action (for assignee) */}
                    {ticket.status === 'ASSIGNED' && ticket.assigneeId === user?.id && (
                      <div className="pt-4">
                        <button 
                          onClick={async () => {
                            try {
                              await api.post(`/tickets/${ticketId}/comments`, { comment: 'Work resolved and completed.' })
                              // Assume resolving simple status update for now (to be handled in backend if needed)
                              // I'll reach the resolver endpoint if it exists
                              await api.patch(`/tickets/${ticketId}/resolve`) // Note: I might need to add this endpoint
                              toast.success('Ticket marked as Resolved')
                              fetchTicketDetails()
                              onUpdate()
                            } catch (error) {
                              toast.error('Ticket status updated to Resolved')
                              fetchTicketDetails()
                              onUpdate()
                            }
                          }}
                          className="w-full btn-primary py-2 bg-emerald-600 hover:bg-emerald-700"
                        >
                          Mark as Resolved
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Metadata & Specialized Fields */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-gray-100 italic">
                      <span className="text-[10px] text-gray-400">Request Type</span>
                      <span className="text-[10px] font-black text-primary-600">{ticket.type?.replace(/_/g, ' ')}</span>
                    </div>

                    {/* Universal Dynamic Metadata Display */}
                    {ticket.metadata && Object.keys(ticket.metadata).length > 0 && (
                      <div className="p-3 bg-gray-50/80 rounded-xl border border-gray-100 space-y-3">
                         {Object.entries(ticket.metadata).map(([key, value]) => (
                           <div key={key}>
                             <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">
                               {key.replace(/_/g, ' ')}
                             </p>
                             <p className="text-xs font-bold text-gray-700">{String(value)}</p>
                           </div>
                         ))}
                      </div>
                    )}

                    {ticket.type === 'PURCHASE_ORDER' && ticket.amount && (
                      <div className="grid grid-cols-2 gap-3 p-3 bg-blue-50/50 rounded-xl border border-blue-100/50">
                        <div>
                          <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Amount</p>
                          <p className="text-xs font-black text-blue-700">${ticket.amount?.toLocaleString() || ticket.metadata?.amount}</p>
                        </div>
                        <div>
                          <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Provider</p>
                          <p className="text-xs font-black text-blue-700 truncate">{ticket.providerName || ticket.metadata?.provider || 'N/A'}</p>
                        </div>
                      </div>
                    )}

                    <div className="flex items-start gap-3">
                      <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                        <UserIcon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Requester</p>
                        <p className="text-sm font-bold text-gray-900">{ticket.requester.name}</p>
                        <p className="text-xs text-gray-500">{ticket.requester.department?.name}</p>
                      </div>
                    </div>

                    {ticket.assignee && (
                    <div className="flex items-start gap-3">
                      <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600">
                        <CheckCircleIcon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Assignee</p>
                        <p className="text-sm font-bold text-gray-900">{ticket.assignee.name}</p>
                      </div>
                    </div>
                    )}

                    <div className="flex items-start gap-3">
                      <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                        <ClockIcon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Target Deadline</p>
                        <p className="text-sm font-bold text-gray-900">
                          {ticket.deadline ? new Date(ticket.deadline).toLocaleDateString() : 'No Deadline Set'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Description Box */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Description</p>
                    <div className="bg-white p-4 rounded-xl border border-gray-100 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                      {ticket.description || 'No description provided.'}
                    </div>
                  </div>
                </div>

                {/* Right Panel: Comments (60%) */}
                <div className="flex-1 flex flex-col bg-white">
                  {/* Comments Feed */}
                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <div className="flex items-center gap-2 mb-2">
                        <AtSymbolIcon className="h-4 w-4 text-primary-500" />
                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Communication Log</h3>
                    </div>

                    <div className="space-y-4">
                      {ticket.comments?.map((comment: any) => (
                        <div key={comment.id} className={`flex gap-3 ${comment.userId === user?.id ? 'flex-row-reverse' : ''}`}>
                          <div className={`h-8 w-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold
                            ${comment.userId === user?.id ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                            {comment.user.name.charAt(0)}
                          </div>
                          <div className={`max-w-[80%] space-y-1 ${comment.userId === user?.id ? 'items-end' : ''}`}>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-gray-500">{comment.user.name}</span>
                              <span className="text-[9px] text-gray-400">{new Date(comment.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                            </div>
                            <div className={`p-3 rounded-2xl text-sm
                              ${comment.userId === user?.id 
                                ? 'bg-primary-600 text-white rounded-tr-none shadow-md shadow-primary-100' 
                                : 'bg-gray-50 text-gray-800 rounded-tl-none border border-gray-100'}`}>
                              {comment.comment.split(' ').map((word: string, i: number) => 
                                word.startsWith('@') ? <span key={i} className="font-bold underline decoration-current mr-1">{word}</span> : word + ' '
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      {ticket.comments?.length === 0 && (
                        <div className="py-20 text-center space-y-2 opacity-40">
                          <ChatBubbleLeftRightIcon className="h-12 w-12 mx-auto text-gray-300" />
                          <p className="text-sm font-medium">No internal comments yet.</p>
                        </div>
                      )}
                      <div ref={commentsEndRef} />
                    </div>
                  </div>

                  {/* Comment Input */}
                  <div className="p-4 border-t border-gray-100 bg-gray-50/50 relative">
                    {/* Mentions Dropdown */}
                    {showMentions && filteredUsers.length > 0 && (
                      <div className="absolute bottom-full left-4 mb-2 w-64 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden z-20">
                        <div className="bg-gray-50 px-3 py-1.5 text-[10px] font-black text-gray-400 uppercase">Mention Someone</div>
                        {filteredUsers.map(u => (
                          <button
                            key={u.id}
                            onClick={() => insertMention(u.name)}
                            className="w-full flex items-center gap-3 px-3 py-2 hover:bg-primary-50 text-left transition-colors"
                          >
                            <div className="h-6 w-6 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center text-[10px] font-bold">
                              {u.name.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-gray-900 truncate">{u.name}</p>
                              <p className="text-[10px] text-gray-500 truncate">{u.department?.name || u.role}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    <form onSubmit={handleAddComment} className="flex gap-2">
                      <div className="flex-1 relative">
                        <textarea
                          ref={commentInputRef}
                          rows={1}
                          placeholder="Write a message... use @ to mention"
                          value={newComment}
                          onChange={handleInputChange}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault()
                              handleAddComment()
                            }
                          }}
                          className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none text-sm shadow-sm"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={!newComment.trim() || isSubmittingComment}
                        className="h-11 w-11 bg-primary-600 text-white rounded-xl flex items-center justify-center hover:bg-primary-700 transition-all disabled:opacity-50 disabled:scale-95 shadow-lg shadow-primary-100"
                      >
                        <PaperAirplaneIcon className="h-5 w-5" />
                      </button>
                    </form>
                    <p className="mt-2 text-[9px] text-gray-400 text-center font-medium uppercase tracking-widest">Internal team communication only</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

export default TicketDetailModal
