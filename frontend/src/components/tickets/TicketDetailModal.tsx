import React, { useState, useEffect, useRef } from 'react'
import { confirmDialog, promptDialog } from '@/components/ui/confirm'
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
    if (!(await confirmDialog({
      title: 'Remove this attachment?',
      description: 'The file is detached from this ticket and cannot be recovered from here.',
      confirmText: 'Remove',
      variant: 'danger',
    }))) return
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
    if (!(await confirmDialog({
      title: 'Delete this ticket?',
      description: 'The ticket and its whole history are removed permanently. This cannot be undone.',
      confirmText: 'Delete ticket',
      variant: 'danger',
    }))) return
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
    // The browser prompt gave a bare input with the domain in its title bar and no
    // room to say why the answer matters. Whoever raised this ticket reads what is
    // typed here, so the box asking for it should say so.
    const reason = await promptDialog({
      title: 'Reject this ticket?',
      description: 'The reason is shown to whoever raised it, so say what would change your mind.',
      inputLabel: 'Reason',
      placeholder: 'What is missing, or why this cannot go ahead',
      confirmText: 'Reject ticket',
      variant: 'danger',
    })
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
          className="relative w-full max-w-6xl h-[90vh] bg-white dark:bg-gray-800 rounded-[2rem] shadow-none flex flex-col overflow-hidden border border-gray-100 dark:border-gray-700"
        >
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <ArrowPathIcon className="h-10 w-10 text-primary-600 dark:text-primary-400 animate-spin" />
            </div>
          ) : (
            <>
              {/* Premium Header Strip */}
              <div className="px-8 py-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-gradient-to-r from-gray-50 dark:from-gray-900/20 to-white dark:to-gray-800">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <span className="bg-primary-600 text-white px-4 py-1.5 rounded-xl text-xs font-semibold tracking-wide border border-primary-500">
                    {ticket.ticketNumber}
                  </span>
                  {isEditing ? (
                    <input 
                      type="text"
                      value={editData.title}
                      onChange={(e) => setEditData({...editData, title: e.target.value})}
                      className="flex-1 max-w-lg px-4 py-2 bg-white dark:bg-gray-800 border-2 border-primary-500/20 rounded-xl text-xl font-semibold text-gray-900 dark:text-white focus:outline-none focus:border-primary-500 transition-all font-outfit"
                    />
                  ) : (
                    <h2 className="text-2xl font-semibold text-gray-900 dark:text-white truncate max-w-lg tracking-tight font-outfit">
                      {ticket.title}
                    </h2>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {canEdit && !isEditing && (
                    <button 
                      onClick={() => setIsEditing(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 rounded-xl text-xs font-semibold tracking-wide hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-primary-500 transition-all shadow-sm"
                    >
                      <PencilSquareIcon className="h-4 w-4 text-primary-600 dark:text-primary-400" /> Modify
                    </button>
                  )}
                  {isAdmin && (
                    <button aria-label="Delete" 
                      onClick={handleDeleteTicket}
                      className="p-2.5 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-xl hover:bg-rose-600 hover:text-white transition-all border border-rose-100 dark:border-rose-900/40 shadow-sm"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  )}
                  <div className="w-px h-8 bg-gray-200 dark:bg-gray-700 mx-2" />
                  <button aria-label="Close"
                    onClick={onClose}
                    className="p-2.5 bg-gray-100/50 dark:bg-gray-900/40 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-xl text-gray-400 hover:text-gray-900 dark:hover:text-white dark:text-white transition-all"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>
              </div>

              <div className="flex-1 flex overflow-hidden">
                {/* Left Panel: Configuration & Metadata */}
                <div className="w-[480px] border-r border-gray-100 dark:border-gray-700 overflow-y-auto p-8 space-y-8 bg-gray-50/20 dark:bg-gray-900/20">
                  
                  {/* Process Control Card */}
                  <div className="bg-white dark:bg-gray-800 p-6 rounded-[1.5rem] border border-gray-100 dark:border-gray-700 space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ListBulletIcon className="h-4 w-4 text-primary-500" />
                        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-wide tracking-tighter">Process Workflow</span>
                      </div>
                      <span className={`px-4 py-1.5 rounded-xl text-xs font-semibold uppercase tracking-wide border
                        ${ticket.status === 'RESOLVED' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-100 dark:border-emerald-900/40' : 
                          ticket.status === 'CANCELLED' ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border-rose-100 dark:border-rose-900/40' :
                          'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-indigo-100 dark:border-indigo-900/40'}`}>
                        {ticket.status === 'PENDING_REC_MGR' ? 'Pending Approval' :
                          ticket.status === 'ASSIGNED' ? (() => {
                            const count = ticket.assignments?.filter((a: any) => a.status === 'ACCEPTED').length || 0;
                            if (count > 1) return `Assigned: ${count} Specialists`;
                            if (count === 1) return `Assigned: ${ticket.assignments.find((a: any) => a.status === 'ACCEPTED')?.user?.name || '1 Specialist'}`;
                            return 'Assigned';
                          })() : 
                          ticket.status.replace(/_/g, ' ')}
                      </span>
                    </div>

                    {isEditing ? (
                      <div className="space-y-4 pt-2">
                         <div className="space-y-2">
                            <label className="text-xs font-semibold text-primary-600 dark:text-primary-400 tracking-wide ml-1">Redirect To Dept</label>
                            <select
                              value={editData.receiverDeptId}
                              onChange={(e) => setEditData({...editData, receiverDeptId: e.target.value})}
                              className="w-full text-xs border-2 border-primary-50 dark:border-primary-900/40 rounded-xl p-3 bg-primary-50/30 dark:bg-primary-900/30 focus:bg-white dark:focus:bg-gray-700 focus:border-primary-500 transition-all font-semibold text-gray-800 dark:text-gray-100"
                            >
                                <option value="">Select Destination...</option>
                                {departments.map(d => (
                                  <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                            </select>
                         </div>

                         {isAdmin && (
                         <div className="space-y-2">
                            <label className="text-xs font-semibold text-rose-600 dark:text-rose-400 tracking-wide ml-1">Manual Status Override</label>
                            <select
                              value={editData.status}
                              onChange={(e) => setEditData({...editData, status: e.target.value})}
                              className="w-full text-xs border-2 border-rose-50 dark:border-rose-900/40 rounded-xl p-3 bg-rose-50/30 dark:bg-rose-900/30 focus:bg-white dark:focus:bg-gray-700 focus:border-rose-500 transition-all font-semibold text-gray-800 dark:text-gray-100"
                            >
                                {['PENDING_REC_MGR', 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'].map(s => (
                                  <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                                ))}
                            </select>
                         </div>
                         )}

                         <div className="grid grid-cols-2 gap-3 pt-4">
                            <button 
                              onClick={handleUpdateTicket}
                              disabled={isSaving || !editData.receiverDeptId}
                              className="bg-primary-600 text-white rounded-xl py-3 text-xs font-semibold tracking-wide shadow-lg shadow-primary-200 hover:bg-primary-700 disabled:opacity-50 transition-all"
                            >
                               {isSaving ? 'Syncing...' : 'Confirm Changes'}
                            </button>
                            <button 
                              onClick={() => { setIsEditing(false); fetchTicketDetails(); }}
                              className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-xl py-3 text-xs font-semibold tracking-wide hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
                            >
                               Cancel
                            </button>
                         </div>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-3 bg-gray-50/50 dark:bg-gray-900/40 rounded-xl border border-gray-100 dark:border-gray-700">
                               <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-wide mb-1">Requester Authority</p>
                               <p className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">{ticket.requesterManager?.name || 'Authorized'}</p>
                            </div>
                            <div className="p-3 bg-gray-50/50 dark:bg-gray-900/40 rounded-xl border border-gray-100 dark:border-gray-700">
                               <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-wide mb-1">Receiver Authority</p>
                               <p className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">{ticket.receiverManager?.name || ticket.receiverDept?.manager?.name || 'Not Selected'}</p>
                            </div>
                        </div>

                        {/* Approvals */}
                        {((ticket.status === 'PENDING_REC_MGR' && (ticket.receiverManagerId === user?.id || ticket.receiverDept?.managerId === user?.id)) ||
                           isAdmin) && 
                           ticket.status === 'PENDING_REC_MGR' && (
                            <div className="grid grid-cols-1 gap-2">
                              <button onClick={handleApprove} className="w-full bg-emerald-600 text-white rounded-xl py-3 text-xs font-semibold tracking-wide flex items-center justify-center gap-2 shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all">
                                <CheckCircleIcon className="h-4 w-4" /> Finalize Approval
                              </button>
                              <button onClick={handleReject} className="w-full bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-xl py-3 text-xs font-semibold tracking-wide border border-rose-100 dark:border-rose-900/40 flex items-center justify-center gap-2 hover:bg-rose-100 dark:hover:bg-rose-900/30 transition-all">
                                <XCircleIcon className="h-4 w-4" /> Reject Request
                              </button>
                            </div>
                        )}

                        {/* Hand-off assignment */}
                        {(ticket.status === 'OPEN' || ticket.status === 'ASSIGNED') && 
                          (ticket.receiverManagerId === user?.id || ticket.receiverDept?.managerId === user?.id || isAdmin) && (
                          <div className="pt-4 border-t border-gray-50 dark:border-gray-700 space-y-3">
                            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-wide">Delegated Assignee</p>
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
                              className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-xl p-3 bg-gray-50 dark:bg-gray-900/40 focus:bg-white dark:focus:bg-gray-700 font-semibold text-gray-800 dark:text-gray-100 transition-all"
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
                                toast.success('TICKET EXECUTION COMMENCED')
                                fetchTicketDetails()
                                onUpdate()
                              } catch { toast.error('Failed to start engagement') }
                            }}
                            className="w-full py-4 bg-primary-600 text-white rounded-xl text-xs font-semibold tracking-normal shadow-md shadow-primary-100 hover:scale-[1.02] transition-all"
                          >
                            Commence Execution
                          </button>
                        )}

                        {(ticket.status === 'ASSIGNED' || ticket.status === 'IN_PROGRESS') && (ticket.assigneeId === user?.id || isAdmin) && (
                          <button 
                            onClick={async () => {
                              try {
                                await api.patch(`/tickets/${ticketId}/resolve`)
                                toast.success('TICKET FINALIZED')
                                fetchTicketDetails()
                                onUpdate()
                              } catch { toast.error('Sync error') }
                            }}
                            className={`w-full py-4 ${ticket.status === 'IN_PROGRESS' ? 'bg-emerald-600 shadow-emerald-100 shadow-md' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'} text-white rounded-xl text-xs font-semibold uppercase tracking-normal hover:scale-[1.02] transition-all`}
                          >
                            Finalize Engagement
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Documents / Attachments Card */}
                  <div className="bg-white dark:bg-gray-800 p-6 rounded-[1.5rem] border border-gray-100 dark:border-gray-700 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <PaperClipIcon className="h-4 w-4 text-primary-500" />
                        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-wide tracking-tighter">Documentation Hub</span>
                      </div>
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="p-1.5 bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-all"
                      >
                         {isUploading ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <PlusIcon className="h-4 w-4" />}
                      </button>
                      <input type="file" ref={fileInputRef} onChange={handleFileUpload} multiple className="hidden" />
                    </div>

                    <div className="space-y-2">
                        {attachments.map(att => (
                         <div key={att.id} className="flex items-center justify-between p-3 bg-gray-50/50 dark:bg-gray-900/40 rounded-xl border border-gray-100 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-700 transition-all group">
                            <div className="flex items-center gap-3 min-w-0">
                               <div className="h-8 w-8 rounded-lg bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 flex items-center justify-center text-primary-600 dark:text-primary-400 shadow-sm">
                                  <DocumentIcon className="h-4 w-4" />
                               </div>
                               <div className="min-w-0 overflow-hidden">
                                  <p className="text-xs font-semibold text-gray-900 dark:text-white truncate tracking-tight">{att.fileName}</p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400 font-bold">{(att.fileSize / 1024 / 1024).toFixed(2)} MB</p>
                               </div>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                               <button 
                                 onClick={() => handleDownload(att.id, att.fileName)}
                                 className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg"
                               >
                                  <ArrowDownTrayIcon className="h-4 w-4" />
                               </button>
                               {(isAdmin || ticket.requesterId === user?.id) && (
                                 <button 
                                   onClick={() => handleDeleteAttachment(att.id)}
                                   className="p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg"
                                 >
                                    <TrashIcon className="h-4 w-4" />
                                 </button>
                               )}
                            </div>
                         </div>
                       ))}
                       {attachments.length === 0 && (
                         <div className="py-8 text-center border-2 border-dashed border-gray-50 dark:border-gray-700 rounded-xl">
                            <p className="text-xs font-semibold text-gray-300">No files attached</p>
                         </div>
                       )}
                    </div>
                  </div>

                  {/* Context documentation */}
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-wide ml-4">Extended Documentation</p>
                    {isEditing ? (
                      <textarea
                        value={editData.description}
                        onChange={(e) => setEditData({...editData, description: e.target.value})}
                        className="w-full px-5 py-4 bg-white dark:bg-gray-800 border-2 border-primary-50 dark:border-primary-900/40 rounded-[1.5rem] text-xs font-bold text-gray-800 dark:text-gray-100 leading-relaxed min-h-[160px] focus:outline-none focus:border-primary-500 transition-all font-outfit"
                        placeholder="Define background and context..."
                      />
                    ) : (
                      <div className="bg-white dark:bg-gray-800 p-6 rounded-[1.5rem] border border-gray-100 dark:border-gray-700 shadow-sm text-xs text-gray-800 dark:text-gray-100 leading-relaxed whitespace-pre-wrap font-bold font-outfit">
                        {ticket.description || 'No specialized context provided.'}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Panel: The Thread */}
                <div className="flex-1 flex flex-col bg-white dark:bg-gray-800">
                  {/* Comm Channel */}
                  <div className="flex-1 overflow-y-auto px-8 py-8 space-y-8">
                    <div className="flex items-center gap-2 mb-4 bg-gray-50/50 dark:bg-gray-900/40 p-2 rounded-xl w-fit">
                        <ChatBubbleLeftRightIcon className="h-4 w-4 text-primary-500" />
                        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-wide tracking-tighter">Organizational Engagement Thread</h3>
                    </div>

                    <div className="space-y-6">
                      {ticket.comments?.map((comment: any) => (
                        <div key={comment.id} className={`flex gap-4 ${comment.userId === user?.id ? 'flex-row-reverse' : ''}`}>
                        <div className={`h-10 w-10 rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden border border-gray-100 dark:border-gray-700
                          ${comment.userId === user?.id ? 'bg-primary-600' : 'bg-gray-800'}`}>
                          {comment.user.avatar ? (
                            <img 
                              src={formatAssetUrl(comment.user.avatar)} 
                              className="h-full w-full object-cover" 
                              alt={comment.user.name} 
                            />
                          ) : (
                            <span className="text-xs font-semibold text-white">
                              {comment.user.name.charAt(0)}
                            </span>
                          )}
                        </div>
                          <div className={`max-w-[75%] space-y-1.5 ${comment.userId === user?.id ? 'items-end flex flex-col' : ''}`}>
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-semibold text-gray-900 dark:text-white tracking-tight">{comment.user.name}</span>
                              <span className="text-xs text-gray-500 dark:text-gray-400 font-bold tracking-wide">{new Date(comment.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                            </div>
                            <div className={`px-5 py-4 rounded-xl text-xs font-semibold leading-relaxed tracking-wide
                              ${comment.userId === user?.id 
                                ? 'bg-primary-600 text-white rounded-tr-none' 
                                : 'bg-gray-50 dark:bg-gray-900/40 text-gray-900 dark:text-white rounded-tl-none border border-gray-100 dark:border-gray-700'}`}>
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
                          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-normal mt-4">Zero engagement localized</p>
                        </div>
                      )}
                      <div ref={commentsEndRef} />
                    </div>
                  </div>

                  {/* Broadcasting Center */}
                  <div className="p-8 border-t border-gray-100 dark:border-gray-700 bg-gray-50/10 dark:bg-gray-900/10 relative">
                    {showMentions && filteredUsers.length > 0 && (
                      <div className="absolute bottom-full left-8 mb-4 w-80 bg-white dark:bg-gray-800 rounded-xl shadow-none border border-gray-100 dark:border-gray-700 overflow-hidden z-20">
                        <div className="bg-gray-50/50 dark:bg-gray-900/40 px-5 py-3 text-xs font-semibold text-gray-400 border-b border-gray-100 dark:border-gray-700 tracking-wide">Broadcast Target Selector</div>
                        {filteredUsers.map(u => (
                          <button
                            key={u.id}
                            onClick={() => insertMention(u.name)}
                            className="w-full flex items-center gap-4 px-5 py-4 hover:bg-primary-50 dark:hover:bg-primary-900/30 text-left transition-all border-b border-gray-50 dark:border-gray-700 last:border-0 group"
                          >
                            <div className="h-10 w-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 flex items-center justify-center overflow-hidden border border-primary-200 shadow-sm group-hover:scale-110 transition-transform">
                              {u.avatar ? (
                                <img 
                                  src={formatAssetUrl(u.avatar)} 
                                  className="h-full w-full object-cover" 
                                  alt={u.name} 
                                />
                              ) : (
                                <span className="text-xs font-semibold">{u.name.charAt(0)}</span>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-gray-900 dark:text-white truncate tracking-tighter">{u.name}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase tracking-tight truncate">{u.department?.name || u.role}</p>
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
                          className="flex-1 px-8 py-5 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:border-primary-500 transition-all resize-none text-xs font-semibold text-gray-800 dark:text-gray-100 font-outfit"
                        />
                      <button aria-label="Send"
                        type="submit"
                        disabled={!newComment.trim() || isSubmittingComment}
                        className="h-[60px] w-[60px] bg-primary-600 text-white rounded-xl flex items-center justify-center hover:bg-primary-700 transition-all disabled:opacity-30 border border-primary-500 group flex-shrink-0"
                      >
                        <PaperAirplaneIcon className="h-7 w-7 -rotate-45 group-hover:scale-110 transition-transform" />
                      </button>
                    </form>
                    <p className="mt-4 text-xs font-semibold text-gray-300 text-center tracking-[0.4em] underline decoration-gray-100">End-to-End internal organizational encryption verified</p>
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
