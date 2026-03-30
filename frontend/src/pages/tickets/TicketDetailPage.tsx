import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { 
  PaperAirplaneIcon,
  CheckCircleIcon,
  ChatBubbleLeftRightIcon,
  PencilSquareIcon,
  TrashIcon,
  ArrowPathIcon,
  ListBulletIcon,
  PaperClipIcon,
  ArrowDownTrayIcon,
  DocumentIcon,
  PlusIcon,
  ChevronLeftIcon,
  ClockIcon,
  SparklesIcon
} from '@heroicons/react/24/outline'
import api, { formatAssetUrl } from '@/services/api'
import Avatar from '@/components/common/Avatar'
import { PlayIcon, CheckIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import { useAppSelector } from '@/hooks/redux'

import ActionModal from '@/components/ui/ActionModal'

const TicketDetailPage: React.FC = () => {
  const { id: ticketId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAppSelector((state) => state.auth)
  const [ticket, setTicket] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [attachments, setAttachments] = useState<any[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [users, setUsers] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  
  // Modal States
  const [actionModal, setActionModal] = useState<{
    isOpen: boolean;
    type: 'delete' | 'reject' | 'remove_attachment';
    title: string;
    description: string;
    targetId?: string;
    requireReason?: boolean;
    reasons?: string[];
  }>({
    isOpen: false,
    type: 'delete',
    title: '',
    description: '',
  })

  // Edit Mode States
  const [isEditing, setIsEditing] = useState(false)
  const [editData, setEditData] = useState({
    title: '',
    description: '',
    receiverDeptId: '',
    status: ''
  })

  const [showMentions, setShowMentions] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')
  const commentInputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const commentsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (ticketId) {
      fetchTicketDetails()
      fetchUsers()
      fetchDepartments()
      fetchAttachments()
    }
  }, [ticketId])

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
      navigate('/tickets')
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
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error('Download failed');
    }
  }

  const confirmAction = async (reason?: string) => {
    const { type, targetId } = actionModal
    setActionModal(p => ({ ...p, isOpen: false }))

    try {
      if (type === 'delete') {
        await api.delete(`/tickets/${ticketId}`)
        toast.success('Ticket Terminated')
        navigate('/tickets')
      } else if (type === 'reject') {
        await api.patch(`/tickets/${ticketId}/reject`, { reason })
        toast.error('Strategic Rejection Logged')
        fetchTicketDetails()
      } else if (type === 'remove_attachment' && targetId) {
        await api.delete(`/files/ticket-delete/${targetId}`)
        toast.success('Asset removed')
        fetchAttachments()
      }
    } catch (error) {
      toast.error('Operation synchronization failed')
    }
  }

  const handleDeleteAttachment = (fileId: string) => {
    setActionModal({
      isOpen: true,
      type: 'remove_attachment',
      title: 'Remove Asset',
      description: 'Are you sure you want to decouple this file from the ticket record?',
      targetId: fileId
    })
  }

  const handleUpdateTicket = async () => {
    if (!editData.title || !editData.receiverDeptId) {
      toast.error('A Title and Receiver Department are both mandatory.')
      return
    }

    // Optimistic Update
    const oldTitle = ticket.title
    const oldDesc = ticket.description
    setTicket({...ticket, title: editData.title, description: editData.description})
    setIsEditing(false)

    try {
      await api.patch(`/tickets/${ticketId}`, editData)
      toast.success('Ticket synchronized')
      fetchTicketDetails()
    } catch (error: any) {
      setTicket({...ticket, title: oldTitle, description: oldDesc})
      toast.error(error.response?.data?.message || 'Update failed')
    }
  }

  const handleDeleteTicket = () => {
    setActionModal({
      isOpen: true,
      type: 'delete',
      title: 'Strategic Deletion',
      description: 'PERMANENT DELETION: This ticket and all its engagement records will be removed from all logs. This action is IRREVERSIBLE.',
    })
  }

  const handleApprove = async () => {
    try {
      await api.patch(`/tickets/${ticketId}/approve`)
      toast.success('Stage Authorized')
      fetchTicketDetails()
    } catch (error) {
      toast.error('Authorization failed')
    }
  }

  const handleReject = () => {
    setActionModal({
      isOpen: true,
      type: 'reject',
      title: 'Strategic Rejection',
      description: 'Specify the operational reason for rejecting this engagement request.',
      requireReason: true,
      reasons: ['Incomplete Specifications', 'Budgetary Constraints', 'Personnel Overload', 'Incorrect Departmental Target', 'Duplicate Interaction']
    })
  }

  const handleCommenceExecution = async () => {
    try {
      await api.patch(`/tickets/${ticketId}/status`, { status: 'IN_PROGRESS' })
      toast.success('Execution Commenced')
      fetchTicketDetails()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to commence execution')
    }
  }

  const handleFinalizeEngagement = async () => {
    try {
      await api.patch(`/tickets/${ticketId}/status`, { status: 'RESOLVED' })
      toast.success('Engagement Finalized')
      fetchTicketDetails()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to finalize engagement')
    }
  }

  const handleAddComment = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!newComment.trim()) return

    const commentContent = newComment
    setNewComment('')

    // Optimistic Comment
    const tempComment = {
      id: 'temp-' + Date.now(),
      comment: commentContent,
      createdAt: new Date().toISOString(),
      user: {
        id: user?.id,
        name: user?.name,
        avatar: user?.avatar
      },
      userId: user?.id
    }
    
    setTicket({
      ...ticket,
      comments: [...(ticket.comments || []), tempComment]
    })

    try {
      await api.post(`/tickets/${ticketId}/comments`, { comment: commentContent })
      fetchTicketDetails()
    } catch (error) {
      toast.error('Communication failure')
      // Remove temp comment
      setTicket({
        ...ticket,
        comments: ticket.comments.filter((c: any) => c.id !== tempComment.id)
      })
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setNewComment(val)
    
    // Mentions Detection
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

  if (isLoading && !ticket) {
    return (
      <div className="flex-1 flex items-center justify-center p-20">
        <ArrowPathIcon className="h-10 w-10 text-primary-600 animate-spin" />
      </div>
    )
  }

  if (!ticket) return null

  const isAdmin = ['COMPANY_ADMIN', 'SUPER_ADMIN'].includes(user?.role || '');
  const canEdit = ticket.requesterId === user?.id || isAdmin;

  // Approval logic clarity
  const isReqMgrStage = ticket.status === 'PENDING_REQ_MGR';
  const isRecMgrStage = ticket.status === 'PENDING_REC_MGR';
  
  const canAuthoriseReq = (ticket.requesterManagerId === user?.id || ticket.requesterDept?.managerId === user?.id || isAdmin);
  const canAuthoriseRec = (ticket.receiverManagerId === user?.id || ticket.receiverDept?.managerId === user?.id || isAdmin);

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-lg p-6 text-white relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6 font-outfit">
          <div className="flex-1 min-w-0">
            <button 
              onClick={() => navigate('/tickets')}
              className="flex items-center gap-2 mb-4 font-bold text-primary-100 hover:text-white uppercase tracking-widest text-[10px] transition-colors"
            >
              <ChevronLeftIcon className="h-3 w-3 stroke-[3]" />
              Return to Board
            </button>
            <div className="flex items-center gap-3 mb-3">
              <span className="bg-white/10 backdrop-blur-md px-3 py-1 rounded-lg text-[10px] font-black tracking-widest uppercase border border-white/20">
                {ticket.ticketNumber}
              </span>
              <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border border-white/20 bg-white/5`}>
                {ticket.status === 'PENDING_REQ_MGR' ? `Awaiting Alignment: ${ticket.requesterManager?.name || 'Initiator Manager'}` :
                  ticket.status === 'PENDING_REC_MGR' ? `Awaiting Priority: ${ticket.receiverManager?.name || ticket.receiverDept?.manager?.name || 'Target Manager'}` :
                  ticket.status.replace(/_/g, ' ')}
              </span>
            </div>
            {isEditing ? (
              <input 
                type="text"
                value={editData.title}
                onChange={(e) => setEditData({...editData, title: e.target.value})}
                className="w-full max-w-2xl bg-white/10 border-2 border-white/20 rounded-xl px-4 py-2 text-2xl font-black focus:outline-none focus:border-white transition-all"
              />
            ) : (
            <h1 className="text-3xl font-bold mb-1 leading-tight truncate">{ticket.title}</h1>
            )}
            <p className="text-primary-100 max-w-2xl mt-1">
              Requested by <span className="font-bold text-white">{ticket.requester?.name}</span> to <span className="font-bold text-white">{ticket.receiverDept?.name}</span>.
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 self-end md:self-center">
             {/* Tactical Lifecycle Phase Actions */}
             {ticket.status === 'ASSIGNED' && ticket.assigneeId === user?.id && (
               <button onClick={handleCommenceExecution} className="flex items-center gap-2 px-6 py-3.5 bg-green-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-green-600 transition-all shadow-lg shadow-green-500/20 active:scale-95">
                 <PlayIcon className="h-4 w-4" />
                 Commence Execution
               </button>
             )}
             {ticket.status === 'IN_PROGRESS' && ticket.assigneeId === user?.id && (
               <button onClick={handleFinalizeEngagement} className="flex items-center gap-2 px-6 py-3.5 bg-blue-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 transition-all shadow-lg shadow-blue-500/20 active:scale-95">
                 <CheckIcon className="h-4 w-4" />
                 Finalize Engagement
               </button>
             )}

             {canEdit && !isEditing && (
                <button 
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl font-black text-xs uppercase tracking-widest transition-all"
                >
                   <PencilSquareIcon className="h-4 w-4" /> Edit Detail
                </button>
             )}
             {isAdmin && (
                <button 
                  onClick={handleDeleteTicket}
                  className="p-2.5 bg-rose-500/20 text-rose-100 border border-rose-500/30 rounded-xl hover:bg-rose-500 transition-all"
                >
                   <TrashIcon className="h-5 w-5" />
                </button>
             )}
          </div>
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-20 -mt-20 blur-3xl pointer-events-none" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        
        {/* Left Col: Strategic Metadata & Actions */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Approval Matrix Card */}
          {(isReqMgrStage || isRecMgrStage) && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6 shadow-sm">
               <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Authorization Required</h3>
               </div>
               
               <div className="space-y-4">
                  <div className={`p-4 rounded-xl border-2 transition-all ${isReqMgrStage ? 'border-amber-500 bg-amber-50 shadow-sm' : 'border-emerald-100 bg-emerald-50 opacity-60'}`}>
                     <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black uppercase tracking-tight text-gray-900">Stage 1: Requester Manager</span>
                        {isReqMgrStage ? <ClockIcon className="h-4 w-4 text-amber-600" /> : <CheckCircleIcon className="h-4 w-4 text-emerald-600" />}
                     </div>
                     <p className="text-[11px] font-bold text-gray-600">Approval from {ticket.requester?.name}'s department management.</p>
                     
                     {isReqMgrStage && canAuthoriseReq && (
                        <div className="flex gap-2 mt-4">
                           <button onClick={handleApprove} className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all">Authorize</button>
                           <button onClick={handleReject} className="flex-1 py-2 bg-white text-rose-600 border border-rose-100 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-rose-50 transition-all">Reject</button>
                        </div>
                     )}
                  </div>

                  <div className={`p-4 rounded-xl border-2 transition-all ${isRecMgrStage ? 'border-amber-500 bg-amber-50 shadow-sm' : isReqMgrStage ? 'border-gray-100 bg-gray-50 opacity-40' : 'border-emerald-100 bg-emerald-50 opacity-60'}`}>
                     <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black uppercase tracking-tight text-gray-900">Stage 2: Receiver Manager</span>
                        {isRecMgrStage ? <ClockIcon className="h-4 w-4 text-amber-600" /> : !isReqMgrStage ? <CheckCircleIcon className="h-4 w-4 text-emerald-600" /> : null}
                     </div>
                     <p className="text-[11px] font-bold text-gray-600">Final authorization from the {ticket.receiverDept?.name} management.</p>

                     {isRecMgrStage && canAuthoriseRec && (
                        <div className="flex gap-2 mt-4">
                           <button onClick={handleApprove} className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all">Authorize</button>
                           <button onClick={handleReject} className="flex-1 py-2 bg-white text-rose-600 border border-rose-100 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-rose-50 transition-all">Reject</button>
                        </div>
                     )}
                  </div>
               </div>
            </div>
          )}

          {/* Configuration Card */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6 shadow-sm font-outfit">
             <div className="flex items-center gap-2">
                <ListBulletIcon className="h-4 w-4 text-primary-500" />
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Ticket Configuration</h3>
             </div>

             {isEditing ? (
                <div className="space-y-4">
                   <div className="space-y-2">
                      <label className="text-[9px] font-black text-primary-600 uppercase tracking-widest ml-1 italic">Receiver Dept</label>
                      <select
                        value={editData.receiverDeptId}
                        onChange={(e) => setEditData({...editData, receiverDeptId: e.target.value})}
                        className="w-full text-xs border-2 border-primary-50 rounded-xl p-3 bg-primary-50/30 focus:bg-white focus:border-primary-500 transition-all font-black text-gray-800"
                      >
                          {departments.map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                      </select>
                   </div>
                   {isAdmin && (
                    <div className="space-y-2">
                       <label className="text-[9px] font-black text-rose-600 uppercase tracking-widest ml-1 italic">Direct Status Override</label>
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
                   <div className="grid grid-cols-2 gap-2 pt-2">
                      <button onClick={handleUpdateTicket} className="bg-primary-600 text-white rounded-xl py-3 text-[10px] font-black uppercase tracking-widest hover:bg-primary-700 transition-all">Sync Changes</button>
                      <button onClick={() => setIsEditing(false)} className="bg-gray-100 text-gray-600 rounded-xl py-3 text-[10px] font-black uppercase tracking-widest hover:bg-gray-200 transition-all">Discard</button>
                   </div>
                </div>
             ) : (
                <div className="space-y-5">
                   <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                         <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1 italic">Requester</p>
                         <p className="text-[11px] font-black text-gray-900 truncate">{ticket.requester?.name}</p>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                         <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1 italic">Logistical Target</p>
                         <p className="text-[11px] font-black text-gray-900 truncate">{ticket.receiverDept?.name}</p>
                      </div>
                   </div>

                   {ticket.assignee && (
                      <div className="flex items-center gap-3 p-4 bg-primary-50 rounded-xl border border-primary-100">
                         <div className="h-10 w-10 rounded-xl bg-primary-600 flex items-center justify-center overflow-hidden border-2 border-white shadow-sm">
                          <Avatar 
                            src={ticket.assignee.avatar} 
                            name={ticket.assignee.name}
                            size="md"
                            rounded="xl"
                          />
                       </div>
                         <div>
                            <p className="text-[8px] font-black text-primary-400 uppercase tracking-widest mb-1 italic">Assigned Personnel</p>
                            <p className="text-xs font-black text-primary-900 truncate">{ticket.assignee.name}</p>
                         </div>
                      </div>
                   )}

                   {(ticket.status === 'OPEN' || ticket.status === 'ASSIGNED') && (canAuthoriseRec || isAdmin) && (
                      <div className="space-y-3 pt-2">
                         <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Hand-off Assignment</p>
                         <select
                            value={ticket.assigneeId || ''}
                            onChange={async (e) => {
                              try {
                                await api.post(`/tickets/${ticketId}/assign`, { assigneeId: e.target.value })
                                toast.success('Personnel Assigned')
                                fetchTicketDetails()
                              } catch { toast.error('Assignment failed') }
                            }}
                            className="w-full text-xs border border-gray-100 rounded-xl p-3 bg-gray-50 focus:bg-white font-black text-gray-800 transition-all font-outfit"
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

          {/* Documentation Repository */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4 shadow-sm">
             <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                   <PaperClipIcon className="h-4 w-4 text-primary-500" />
                   <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Support Documentation</h3>
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
                   <div key={att.id} className="group flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-transparent hover:border-gray-100 hover:bg-white transition-all">
                      <div className="flex items-center gap-3 min-w-0">
                         <div className="h-8 w-8 rounded-lg bg-white border border-gray-100 flex items-center justify-center text-primary-600 shadow-sm">
                            <DocumentIcon className="h-4 w-4" />
                         </div>
                         <div className="min-w-0">
                            <p className="text-[10px] font-black text-gray-900 truncate uppercase tracking-tight">{att.fileName}</p>
                            <p className="text-[8px] text-gray-400 font-bold uppercase tracking-widest">{(att.fileSize / 1024 / 1024).toFixed(2)} MB</p>
                         </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                         <button onClick={() => handleDownload(att.id, att.fileName)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><ArrowDownTrayIcon className="h-4 w-4" /></button>
                         {canEdit && <button onClick={() => handleDeleteAttachment(att.id)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"><TrashIcon className="h-4 w-4" /></button>}
                      </div>
                   </div>
                ))}
                {attachments.length === 0 && (
                   <div className="py-6 text-center border-2 border-dashed border-gray-50 rounded-2xl">
                      <p className="text-[10px] font-black text-gray-300 uppercase italic">Repository Empty</p>
                   </div>
                )}
             </div>
          </div>
        </div>

        {/* Right Col: Tactical Feed & Focus */}
        <div className="lg:col-span-2 space-y-8">
           
           {/* Context Focus Area */}
           <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                  <SparklesIcon className="h-5 w-5 text-primary-500" />
                  <h3 className="text-lg font-bold text-gray-900">Description</h3>
              </div>
              
              {isEditing ? (
                 <textarea
                    value={editData.description}
                    onChange={(e) => setEditData({...editData, description: e.target.value})}
                    className="w-full px-6 py-5 bg-gray-50 border-2 border-transparent rounded-[2rem] text-sm font-bold text-gray-800 leading-relaxed min-h-[220px] focus:outline-none focus:bg-white focus:border-primary-500 transition-all font-outfit"
                    placeholder="Describe the objective context, required deliverables, and strategic background..."
                 />
              ) : (
                 <div className="text-sm text-gray-800 leading-[1.8] font-bold font-outfit whitespace-pre-wrap">
                    {ticket.description || 'Zero background context provided by initiator.'}
                 </div>
              )}
           </div>

           {/* Communication Feed */}
           <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden min-h-[600px]">
              <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                     <div className="h-9 w-9 bg-primary-100 text-primary-600 rounded-xl flex items-center justify-center border border-primary-200 shadow-sm">
                        <ChatBubbleLeftRightIcon className="h-5 w-5" />
                     </div>
                     <div>
                        <h3 className="text-xs font-black text-gray-900 uppercase tracking-tight leading-none">Intelligence Feed</h3>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Personnel Interaction Log</p>
                     </div>
                  </div>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                  {ticket.comments?.map((comment: any) => (
                    <motion.div 
                      key={comment.id}
                      initial={{ opacity: 0, x: comment.userId === user?.id ? 20 : -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`flex gap-4 ${comment.userId === user?.id ? 'flex-row-reverse' : ''}`}
                    >
                      <div className={`h-11 w-11 rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden border-2 border-white shadow-sm
                        ${comment.userId === user?.id ? 'bg-primary-600' : 'bg-gray-800'}`}>
                        <Avatar 
                          src={comment.user.avatar} 
                          name={comment.user.name}
                          size="md"
                          rounded="xl"
                        />
                      </div>
                      <div className={`max-w-[80%] space-y-1.5 ${comment.userId === user?.id ? 'items-end' : ''} flex flex-col`}>
                        <div className={`flex items-center gap-3 ${comment.userId === user?.id ? 'flex-row-reverse' : ''}`}>
                          <span className="text-[10px] font-black text-gray-900 uppercase tracking-tight">{comment.user.name}</span>
                          <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">{new Date(comment.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        </div>
                        <div className={`px-6 py-4 rounded-2xl text-xs font-black leading-relaxed tracking-wide shadow-sm whitespace-pre-wrap
                          ${comment.userId === user?.id 
                            ? 'bg-primary-600 text-white rounded-tr-none' 
                            : 'bg-white text-gray-900 rounded-tl-none border border-gray-100'}`}>
                          {comment.comment.split(/(\s+)/).map((part: string, i: number) => 
                            part.startsWith('@') 
                              ? <span key={i} className={`underline decoration-2 mr-1 italic pointer-events-none ${comment.userId === user?.id ? 'decoration-white/40 text-white' : 'decoration-indigo-300 text-indigo-500'}`}>{part}</span> 
                              : part
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                  {ticket.comments?.length === 0 && (
                    <div className="py-20 text-center opacity-30">
                       <ChatBubbleLeftRightIcon className="h-16 w-16 mx-auto text-gray-200" />
                       <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mt-4 italic">No communication localized in this thread</p>
                    </div>
                  )}
                  <div ref={commentsEndRef} />
              </div>

              {/* Feed Input */}
              <div className="p-8 bg-gray-50/50 border-t border-gray-100 relative">
                  {showMentions && filteredUsers.length > 0 && (
                     <div className="absolute bottom-full left-8 mb-4 w-72 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-20">
                        <div className="bg-gray-50/80 px-4 py-2 text-[8px] font-black text-gray-400 uppercase border-b border-gray-100 italic tracking-widest">Target Selection</div>
                        {filteredUsers.map(u => (
                          <button
                            key={u.id}
                            onClick={() => insertMention(u.name)}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-primary-50 text-left transition-all border-b border-gray-50 last:border-0 group"
                          >
                             <div className="h-8 w-8 rounded-lg bg-primary-100 text-primary-700 flex items-center justify-center overflow-hidden border border-primary-200 group-hover:scale-110 transition-transform">
                              {u.avatar ? <img src={formatAssetUrl(u.avatar)} className="h-full w-full object-cover" /> : <span className="text-[10px] font-black">{u.name.charAt(0)}</span>}
                             </div>
                             <div className="min-w-0">
                               <p className="text-[10px] font-black text-gray-900 truncate uppercase tracking-tight">{u.name}</p>
                               <p className="text-[8px] text-gray-400 font-bold uppercase tracking-widest truncate">{u.department?.name || 'External'}</p>
                             </div>
                          </button>
                        ))}
                     </div>
                  )}

                  <form onSubmit={handleAddComment} className="flex gap-4">
                     <textarea
                        ref={commentInputRef}
                        rows={1}
                        placeholder="Broadcast new intelligence... (@ to mention)"
                        value={newComment}
                        onChange={handleInputChange}
                        className="flex-1 px-6 py-4 bg-white border border-gray-200 rounded-2xl focus:outline-none focus:border-primary-500 transition-all resize-none text-[11px] font-black text-gray-800 font-outfit shadow-sm"
                     />
                     <button
                        type="submit"
                        disabled={!newComment.trim()}
                        className="h-[52px] w-[52px] bg-primary-600 text-white rounded-2xl flex items-center justify-center hover:bg-primary-700 transition-all shadow-lg shadow-primary-100 disabled:opacity-30 group flex-shrink-0"
                     >
                        <PaperAirplaneIcon className="h-6 w-6 -rotate-45 group-hover:scale-110 transition-transform" />
                     </button>
                  </form>
              </div>
           </div>
        </div>
      </div>
      <ActionModal
        isOpen={actionModal.isOpen}
        onClose={() => setActionModal(p => ({ ...p, isOpen: false }))}
        onConfirm={confirmAction}
        title={actionModal.title}
        description={actionModal.description}
        variant={actionModal.type === 'delete' ? 'danger' : actionModal.type === 'reject' ? 'warning' : 'danger'}
        requireReason={actionModal.requireReason}
        reasons={actionModal.reasons}
        confirmText={actionModal.type === 'delete' ? 'Delete Permanently' : actionModal.type === 'reject' ? 'Reject' : 'Confirm'}
      />
    </div>
  )
}

export default TicketDetailPage
