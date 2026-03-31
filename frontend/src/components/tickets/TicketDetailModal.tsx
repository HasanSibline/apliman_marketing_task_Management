import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  XMarkIcon, 
  PaperAirplaneIcon,
  CheckCircleIcon,
  XCircleIcon,
  ChatBubbleLeftRightIcon,
  PencilSquareIcon,
  TrashIcon,
  ArrowPathIcon,
  ListBulletIcon,
  PaperClipIcon,
  ArrowDownTrayIcon,
  DocumentIcon,
  PlusIcon
} from '@heroicons/react/24/outline'
import api, { formatAssetUrl } from '@/services/api'
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
  const [attachments, setAttachments] = useState<any[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [isSubmittingComment, setIsSubmittingComment] = useState(false)
  const [users, setUsers] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  
  // Edit Mode States
  const [isEditing, setIsEditing] = useState(false)
  const [editData, setEditData] = useState({
    title: '',
    description: '',
    receiverDeptId: '',
    status: ''
  })
  const [isSaving, setIsSaving] = useState(false)

  const [showMentions, setShowMentions] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')
  const commentInputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const commentsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen && ticketId) {
      fetchTicketDetails()
      fetchUsers()
      fetchDepartments()
      fetchAttachments()
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
      setEditData({
        title: res.data.title,
        description: res.data.description,
        receiverDeptId: res.data.receiverDeptId,
        status: res.data.status
      })
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
      console.error('Failed to fetch users')
    }
  }

  const fetchDepartments = async () => {
    try {
      const res = await api.get('/departments')
      setDepartments(res.data)
    } catch (error) {
      console.error('Failed to fetch departments')
    }
  }

  const fetchAttachments = async () => {
    try {
      const res = await api.get(`/files/ticket/${ticketId}`)
      setAttachments(res.data)
    } catch (error) {
      console.error('Failed to fetch attachments')
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const formData = new FormData()
    Array.from(files).forEach(file => formData.append('files', file))

    setIsUploading(true)
    try {
      await api.post(`/files/ticket/${ticketId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      toast.success('Files uploaded successfully')
      fetchAttachments()
    } catch (error) {
      toast.error('File upload failed')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDownload = async (fileId: string, fileName: string) => {
    try {
      const response = await api.get(`/files/ticket-download/${fileId}`, {
        responseType: 'blob'
      })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', fileName)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      toast.error('Download failed')
    }
  }

  const handleDeleteAttachment = async (fileId: string) => {
    if (!window.confirm('Remove this attachment?')) return
    try {
      await api.delete(`/files/ticket-delete/${fileId}`)
      toast.success('Attachment removed')
      fetchAttachments()
    } catch (error) {
      toast.error('Failed to delete attachment')
    }
  }

  const handleUpdateTicket = async () => {
    if (!editData.title || !editData.receiverDeptId) {
      toast.error('A Title and Receiver Department are both mandatory.')
      return
    }

    setIsSaving(true)
    try {
      await api.patch(`/tickets/${ticketId}`, editData)
      toast.success('Ticket updated successfully')
      setIsEditing(false)
      fetchTicketDetails()
      onUpdate()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Update failed')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteTicket = async () => {
    if (!window.confirm('PERMANENT DELETION: Are you sure? This ticket will be removed from all logs.')) return
    try {
      await api.delete(`/tickets/${ticketId}`)
      toast.success('Ticket deleted permanentely')
      onClose()
      onUpdate()
    } catch (error) {
      toast.error('Deletion failed')
    }
  }

  const handleApprove = async () => {
    try {
      await api.patch(`/tickets/${ticketId}/approve`)
      toast.success('Ticket approved')
      fetchTicketDetails()
      onUpdate()
    } catch (error) {
      toast.error('Failed to approve')
    }
  }

  const handleReject = async () => {
    const reason = prompt('State rejection reason:')
    if (reason === null) return
    try {
      await api.patch(`/tickets/${ticketId}/reject`, { reason })
      toast.error('Ticket rejected')
      fetchTicketDetails()
      onUpdate()
    } catch (error) {
      toast.error('Failed to reject')
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
      toast.error('Comment failed')
    } finally {
      setIsSubmittingComment(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setNewComment(val)
    
    // Improved Mentions Detection
    const cursorPosition = e.target.selectionStart
    const textBeforeCursor = val.substring(0, cursorPosition)
    const words = textBeforeCursor.split(/\s+/)
    const lastWord = words[words.length - 1]

    if (lastWord.startsWith('@')) {
      setShowMentions(true)
      setMentionFilter(lastWord.slice(1).toLowerCase())
    } else {
      setShowMentions(false)
    }
  }

  const insertMention = (userName: string) => {
    const cursorPosition = commentInputRef.current?.selectionStart || 0
    const textBeforeCursor = newComment.substring(0, cursorPosition)
    const textAfterCursor = newComment.substring(cursorPosition)
    
    const words = textBeforeCursor.split(/\s+/)
    words[words.length - 1] = `@${userName}`
    
    const newText = words.join(' ') + ' ' + textAfterCursor
    setNewComment(newText)
    setShowMentions(false)
    
    setTimeout(() => {
      if (commentInputRef.current) {
        commentInputRef.current.focus()
        const newCursorPos = (words.join(' ') + ' ').length
        commentInputRef.current.setSelectionRange(newCursorPos, newCursorPos)
      }
    }, 0)
  }

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(mentionFilter) || 
    u.email.toLowerCase().includes(mentionFilter)
  ).slice(0, 5)

  if (!isOpen) return null

  const isAdmin = ['COMPANY_ADMIN', 'SUPER_ADMIN'].includes(user?.role || '');
  const canEdit = ticket?.requesterId === user?.id || isAdmin;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/70 backdrop-blur-md"
        />

        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.98 }}
          className="relative w-full max-w-6xl h-[90vh] bg-white rounded-[2rem] shadow-none flex flex-col overflow-hidden border border-gray-100"
        >
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <ArrowPathIcon className="h-10 w-10 text-primary-600 animate-spin" />
            </div>
          ) : (
            <>
              {/* Premium Header Strip */}
              <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <span className="bg-primary-600 text-white px-4 py-1.5 rounded-xl text-[10px] font-black tracking-widest uppercase border border-primary-500">
                    {ticket.ticketNumber}
                  </span>
                  {isEditing ? (
                    <input 
                      type="text"
                      value={editData.title}
                      onChange={(e) => setEditData({...editData, title: e.target.value})}
                      className="flex-1 max-w-lg px-4 py-2 bg-white border-2 border-primary-500/20 rounded-xl text-xl font-black text-gray-900 focus:outline-none focus:border-primary-500 transition-all font-outfit"
                    />
                  ) : (
                    <h2 className="text-2xl font-black text-gray-900 truncate max-w-lg uppercase tracking-tight font-outfit">
                      {ticket.title}
                    </h2>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {canEdit && !isEditing && (
                    <button 
                      onClick={() => setIsEditing(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-gray-50 hover:border-primary-500 transition-all shadow-sm"
                    >
                      <PencilSquareIcon className="h-4 w-4 text-primary-600" /> Modify
                    </button>
                  )}
                  {isAdmin && (
                    <button 
                      onClick={handleDeleteTicket}
                      className="p-2.5 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-600 hover:text-white transition-all border border-rose-100 shadow-sm"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  )}
                  <div className="w-px h-8 bg-gray-200 mx-2" />
                  <button
                    onClick={onClose}
                    className="p-2.5 bg-gray-100/50 hover:bg-gray-200 rounded-xl text-gray-400 hover:text-gray-900 transition-all"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>
              </div>

              <div className="flex-1 flex overflow-hidden">
                {/* Left Panel: Configuration & Metadata */}
                <div className="w-[480px] border-r border-gray-100 overflow-y-auto p-8 space-y-8 bg-gray-50/20">
                  
                  {/* Process Control Card */}
                  <div className="bg-white p-6 rounded-[1.5rem] border border-gray-100 space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ListBulletIcon className="h-4 w-4 text-primary-500" />
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest italic tracking-tighter">Process Workflow</span>
                      </div>
                      <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border
                        ${ticket.status === 'RESOLVED' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 
                          ticket.status === 'REJECTED' ? 'bg-rose-50 text-rose-700 border-rose-100' :
                          'bg-indigo-50 text-indigo-700 border-indigo-100'}`}>
                        {ticket.status === 'PENDING_REQ_MGR' ? `Pending Approval: ${ticket.requesterManager?.name || 'Manager'}` :
                          ticket.status === 'PENDING_REC_MGR' ? `Pending Assignment: ${ticket.receiverManager?.name || ticket.receiverDept?.manager?.name || 'Dept. Manager'}` :
                          ticket.status.replace(/_/g, ' ')}
                      </span>
                    </div>

                    {isEditing ? (
                      <div className="space-y-4 pt-2">
                         <div className="space-y-2">
                            <label className="text-[9px] font-black text-primary-600 uppercase tracking-widest ml-1">Redirect To Dept</label>
                            <select
                              value={editData.receiverDeptId}
                              onChange={(e) => setEditData({...editData, receiverDeptId: e.target.value})}
                              className="w-full text-xs border-2 border-primary-50 rounded-xl p-3 bg-primary-50/30 focus:bg-white focus:border-primary-500 transition-all font-black text-gray-800"
                            >
                                <option value="">Select Destination...</option>
                                {departments.map(d => (
                                  <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                            </select>
                         </div>

                         {isAdmin && (
                         <div className="space-y-2">
                            <label className="text-[9px] font-black text-rose-600 uppercase tracking-widest ml-1">Manual Status Override</label>
                            <select
                              value={editData.status}
                              onChange={(e) => setEditData({...editData, status: e.target.value})}
                              className="w-full text-xs border-2 border-rose-50 rounded-xl p-3 bg-rose-50/30 focus:bg-white focus:border-rose-500 transition-all font-black text-gray-800"
                            >
                                {['PENDING_REQ_MGR', 'PENDING_REC_MGR', 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'].map(s => (
                                  <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                                ))}
                            </select>
                         </div>
                         )}

                         <div className="grid grid-cols-2 gap-3 pt-4">
                            <button 
                              onClick={handleUpdateTicket}
                              disabled={isSaving || !editData.receiverDeptId}
                              className="bg-primary-600 text-white rounded-xl py-3 text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary-200 hover:bg-primary-700 disabled:opacity-50 transition-all"
                            >
                               {isSaving ? 'Syncing...' : 'Confirm Changes'}
                            </button>
                            <button 
                              onClick={() => { setIsEditing(false); fetchTicketDetails(); }}
                              className="bg-gray-100 text-gray-600 rounded-xl py-3 text-[10px] font-black uppercase tracking-widest hover:bg-gray-200 transition-all"
                            >
                               Cancel
                            </button>
                         </div>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-3 bg-gray-50/50 rounded-xl border border-gray-100">
                               <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1 italic">Requester Authority</p>
                               <p className="text-xs font-black text-gray-800 truncate">{ticket.requesterManager?.name || 'Authorized'}</p>
                            </div>
                            <div className="p-3 bg-gray-50/50 rounded-xl border border-gray-100">
                               <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1 italic">Receiver Authority</p>
                               <p className="text-xs font-black text-gray-800 truncate">{ticket.receiverManager?.name || ticket.receiverDept?.manager?.name || 'Not Selected'}</p>
                            </div>
                        </div>

                        {/* Approvals */}
                        {(((ticket.status === 'PENDING_REQ_MGR' && (ticket.requesterManagerId === user?.id || ticket.requesterDept?.managerId === user?.id)) || 
                           (ticket.status === 'PENDING_REC_MGR' && (ticket.receiverManagerId === user?.id || ticket.receiverDept?.managerId === user?.id))) ||
                           isAdmin) && 
                           (ticket.status === 'PENDING_REQ_MGR' || ticket.status === 'PENDING_REC_MGR') && (
                            <div className="grid grid-cols-1 gap-2">
                              <button onClick={handleApprove} className="w-full bg-emerald-600 text-white rounded-xl py-3 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all">
                                <CheckCircleIcon className="h-4 w-4" /> Finalize Approval
                              </button>
                              <button onClick={handleReject} className="w-full bg-rose-50 text-rose-600 rounded-xl py-3 text-[10px] font-black uppercase tracking-widest border border-rose-100 flex items-center justify-center gap-2 hover:bg-rose-100 transition-all">
                                <XCircleIcon className="h-4 w-4" /> Reject Request
                              </button>
                            </div>
                        )}

                        {/* Hand-off assignment */}
                        {(ticket.status === 'OPEN' || ticket.status === 'ASSIGNED') && 
                          (ticket.receiverManagerId === user?.id || ticket.receiverDept?.managerId === user?.id || isAdmin) && (
                          <div className="pt-4 border-t border-gray-50 space-y-3">
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Delegated Assignee</p>
                            <select
                              value={ticket.assigneeId || ''}
                              onChange={async (e) => {
                                try {
                                  await api.post(`/tickets/${ticketId}/assign`, { assigneeId: e.target.value })
                                  toast.success('Assignment Synchronized')
                                  fetchTicketDetails()
                                  onUpdate()
                                } catch (error) { toast.error('Assignment failed') }
                              }}
                              className="w-full text-xs border border-gray-200 rounded-xl p-3 bg-gray-50 focus:bg-white font-black text-gray-800 transition-all"
                            >
                              <option value="">Select Resource...</option>
                              {users.filter(u => u.departmentId === ticket.receiverDeptId).map(u => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {ticket.status === 'ASSIGNED' && ticket.assigneeId === user?.id && (
                          <button 
                            onClick={async () => {
                              try {
                                await api.patch(`/tickets/${ticketId}/start`)
                                toast.success('MISSION EXECUTION COMMENCED')
                                fetchTicketDetails()
                                onUpdate()
                              } catch { toast.error('Failed to start engagement') }
                            }}
                            className="w-full py-4 bg-primary-600 text-white rounded-xl text-[11px] font-black uppercase tracking-[0.2em] shadow-xl shadow-primary-100 hover:scale-[1.02] transition-all"
                          >
                            Commence Execution
                          </button>
                        )}

                        {(ticket.status === 'ASSIGNED' || ticket.status === 'IN_PROGRESS') && (ticket.assigneeId === user?.id || isAdmin) && (
                          <button 
                            onClick={async () => {
                              try {
                                await api.patch(`/tickets/${ticketId}/resolve`)
                                toast.success('MISSION OBJECTIVE FINALIZED')
                                fetchTicketDetails()
                                onUpdate()
                              } catch { toast.error('Sync error') }
                            }}
                            className={`w-full py-4 ${ticket.status === 'IN_PROGRESS' ? 'bg-emerald-600 shadow-emerald-100 shadow-xl' : 'bg-gray-100 text-gray-500'} text-white rounded-xl text-[11px] font-black uppercase tracking-[0.2em] hover:scale-[1.02] transition-all`}
                          >
                            Finalize Engagement
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Documents / Attachments Card */}
                  <div className="bg-white p-6 rounded-[1.5rem] border border-gray-100 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <PaperClipIcon className="h-4 w-4 text-primary-500" />
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest italic tracking-tighter">Documentation Hub</span>
                      </div>
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="p-1.5 bg-primary-50 text-primary-600 rounded-lg hover:bg-primary-100 transition-all"
                      >
                         {isUploading ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <PlusIcon className="h-4 w-4" />}
                      </button>
                      <input type="file" ref={fileInputRef} onChange={handleFileUpload} multiple className="hidden" />
                    </div>

                    <div className="space-y-2">
                        {attachments.map(att => (
                         <div key={att.id} className="flex items-center justify-between p-3 bg-gray-50/50 rounded-xl border border-gray-100 hover:bg-white transition-all group">
                            <div className="flex items-center gap-3 min-w-0">
                               <div className="h-8 w-8 rounded-lg bg-white border border-gray-100 flex items-center justify-center text-primary-600 shadow-sm">
                                  <DocumentIcon className="h-4 w-4" />
                               </div>
                               <div className="min-w-0 overflow-hidden">
                                  <p className="text-[10px] font-black text-gray-900 truncate uppercase tracking-tight">{att.fileName}</p>
                                  <p className="text-[8px] text-gray-400 font-bold">{(att.fileSize / 1024 / 1024).toFixed(2)} MB</p>
                               </div>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                               <button 
                                 onClick={() => handleDownload(att.id, att.fileName)}
                                 className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"
                               >
                                  <ArrowDownTrayIcon className="h-4 w-4" />
                               </button>
                               {(isAdmin || ticket.requesterId === user?.id) && (
                                 <button 
                                   onClick={() => handleDeleteAttachment(att.id)}
                                   className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg"
                                 >
                                    <TrashIcon className="h-4 w-4" />
                                 </button>
                               )}
                            </div>
                         </div>
                       ))}
                       {attachments.length === 0 && (
                         <div className="py-8 text-center border-2 border-dashed border-gray-50 rounded-2xl">
                            <p className="text-[10px] font-black text-gray-300 uppercase italic">No files attached</p>
                         </div>
                       )}
                    </div>
                  </div>

                  {/* Context documentation */}
                  <div className="space-y-3">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4 italic">Extended Documentation</p>
                    {isEditing ? (
                      <textarea
                        value={editData.description}
                        onChange={(e) => setEditData({...editData, description: e.target.value})}
                        className="w-full px-5 py-4 bg-white border-2 border-primary-50 rounded-[1.5rem] text-[11px] font-bold text-gray-800 leading-relaxed min-h-[160px] focus:outline-none focus:border-primary-500 transition-all font-outfit"
                        placeholder="Define background and context..."
                      />
                    ) : (
                      <div className="bg-white p-6 rounded-[1.5rem] border border-gray-100 shadow-sm text-xs text-gray-800 leading-relaxed whitespace-pre-wrap font-bold font-outfit">
                        {ticket.description || 'No specialized context provided.'}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Panel: The Thread */}
                <div className="flex-1 flex flex-col bg-white">
                  {/* Comm Channel */}
                  <div className="flex-1 overflow-y-auto px-8 py-8 space-y-8">
                    <div className="flex items-center gap-2 mb-4 bg-gray-50/50 p-2 rounded-xl w-fit">
                        <ChatBubbleLeftRightIcon className="h-4 w-4 text-primary-500" />
                        <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest italic tracking-tighter">Organizational Engagement Thread</h3>
                    </div>

                    <div className="space-y-6">
                      {ticket.comments?.map((comment: any) => (
                        <div key={comment.id} className={`flex gap-4 ${comment.userId === user?.id ? 'flex-row-reverse' : ''}`}>
                        <div className={`h-10 w-10 rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden border border-gray-100
                          ${comment.userId === user?.id ? 'bg-primary-600' : 'bg-gray-800'}`}>
                          {comment.user.avatar ? (
                            <img 
                              src={formatAssetUrl(comment.user.avatar)} 
                              className="h-full w-full object-cover" 
                              alt={comment.user.name} 
                            />
                          ) : (
                            <span className="text-[11px] font-black uppercase text-white">
                              {comment.user.name.charAt(0)}
                            </span>
                          )}
                        </div>
                          <div className={`max-w-[75%] space-y-1.5 ${comment.userId === user?.id ? 'items-end flex flex-col' : ''}`}>
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] font-black text-gray-900 uppercase tracking-tight">{comment.user.name}</span>
                              <span className="text-[8px] text-gray-400 font-bold uppercase tracking-widest">{new Date(comment.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                            </div>
                            <div className={`px-5 py-4 rounded-2xl text-xs font-black leading-relaxed tracking-wide
                              ${comment.userId === user?.id 
                                ? 'bg-primary-600 text-white rounded-tr-none' 
                                : 'bg-gray-50 text-gray-900 rounded-tl-none border border-gray-100'}`}>
                              {comment.comment.split(' ').map((word: string, i: number) => 
                                word.startsWith('@') ? <span key={i} className="underline decoration-2 decoration-current mr-1 italic text-indigo-300 pointer-events-none">{word}</span> : word + ' '
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      {ticket.comments?.length === 0 && (
                        <div className="py-32 text-center opacity-30 grayscale pointer-events-none">
                          <ChatBubbleLeftRightIcon className="h-24 w-24 mx-auto text-gray-100" />
                          <p className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] mt-4 italic">Zero engagement localized</p>
                        </div>
                      )}
                      <div ref={commentsEndRef} />
                    </div>
                  </div>

                  {/* Broadcasting Center */}
                  <div className="p-8 border-t border-gray-100 bg-gray-50/10 relative">
                    {showMentions && filteredUsers.length > 0 && (
                      <div className="absolute bottom-full left-8 mb-4 w-80 bg-white rounded-2xl shadow-none border border-gray-100 overflow-hidden z-20">
                        <div className="bg-gray-50/50 px-5 py-3 text-[9px] font-black text-gray-400 uppercase border-b border-gray-100 italic tracking-widest">Broadcast Target Selector</div>
                        {filteredUsers.map(u => (
                          <button
                            key={u.id}
                            onClick={() => insertMention(u.name)}
                            className="w-full flex items-center gap-4 px-5 py-4 hover:bg-primary-50 text-left transition-all border-b border-gray-50 last:border-0 group"
                          >
                            <div className="h-10 w-10 rounded-xl bg-primary-100 text-primary-700 flex items-center justify-center overflow-hidden border border-primary-200 shadow-sm group-hover:scale-110 transition-transform">
                              {u.avatar ? (
                                <img 
                                  src={formatAssetUrl(u.avatar)} 
                                  className="h-full w-full object-cover" 
                                  alt={u.name} 
                                />
                              ) : (
                                <span className="text-[11px] font-black uppercase">{u.name.charAt(0)}</span>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-black text-gray-900 truncate uppercase tracking-tighter">{u.name}</p>
                              <p className="text-[9px] text-gray-400 font-bold uppercase tracking-tight truncate italic">{u.department?.name || u.role}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    <form onSubmit={handleAddComment} className="flex gap-4">
                        <textarea
                          ref={commentInputRef}
                          rows={1}
                          placeholder="Broadcast a new message... Use @ to tag team members."
                          value={newComment}
                          onChange={handleInputChange}
                          className="flex-1 px-8 py-5 bg-white border border-gray-100 rounded-2xl focus:outline-none focus:border-primary-500 transition-all resize-none text-xs font-black text-gray-800 font-outfit"
                        />
                      <button
                        type="submit"
                        disabled={!newComment.trim() || isSubmittingComment}
                        className="h-[60px] w-[60px] bg-primary-600 text-white rounded-2xl flex items-center justify-center hover:bg-primary-700 transition-all disabled:opacity-30 border border-primary-500 group flex-shrink-0"
                      >
                        <PaperAirplaneIcon className="h-7 w-7 -rotate-45 group-hover:scale-110 transition-transform" />
                      </button>
                    </form>
                    <p className="mt-4 text-[9px] font-black text-gray-300 text-center uppercase tracking-[0.4em] italic underline decoration-gray-100">End-to-End internal organizational encryption verified</p>
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
