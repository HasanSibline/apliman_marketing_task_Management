import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { 
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
      console.log(`📡 Initiation of asset retrieval for: ${fileName} (${fileId})`);
      const response = await api.get(`/files/download/${fileId}`, {
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
      console.log(`✅ Asset ${fileName} localized and transferred successfully.`);
    } catch (error: any) {
      console.error('Download failed:', error);
      
      // Try to extract a more descriptive error if it's a blob
      if (error.response?.data instanceof Blob) {
        const text = await error.response.data.text();
        try {
          const json = JSON.parse(text);
          toast.error(json.message || 'Download failed');
        } catch {
          toast.error('File no longer on server or access denied');
        }
      } else {
        toast.error(error.response?.data?.message || 'Strategic retrieval failure');
      }
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

  const isAdmin = ['COMPANY_ADMIN', 'SUPER_ADMIN', 'ADMIN'].includes(user?.role || '');
  const canEdit = isAdmin || 
                  (ticket.requesterId === user?.id) || 
                  (ticket.assigneeId === user?.id) || 
                  (ticket.receiverManagerId === user?.id) || 
                  (ticket.receiverDept?.managerId === user?.id) ||
                  (ticket.assignments?.some((a: any) => a.userId === user?.id));

  // Approval logic clarity
  const isReqMgrStage = ticket.status === 'PENDING_REQ_MGR';
  const isRecMgrStage = ticket.status === 'PENDING_REC_MGR';
  
  const canAuthoriseReq = (ticket.requesterManagerId === user?.id || ticket.requesterDept?.managerId === user?.id || isAdmin);
  const canAuthoriseRec = (ticket.receiverManagerId === user?.id || ticket.receiverDept?.managerId === user?.id || isAdmin);

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-2xl p-8 text-white relative overflow-hidden shadow-2xl">
        <div className="relative z-10 font-outfit">
          {/* Top Row: Navigation and Action */}
          <div className="flex items-center justify-between mb-6">
            <button 
              onClick={() => navigate('/tickets')}
              className="flex items-center gap-2 font-bold text-primary-100 hover:text-white uppercase tracking-widest text-[10px] transition-all hover:translate-x-[-4px]"
            >
              <ChevronLeftIcon className="h-3 w-3 stroke-[3]" />
              Return to Board
            </button>

            <div className="flex items-center gap-3">
              {isAdmin && (
                <button 
                  onClick={handleDeleteTicket}
                  className="p-2.5 bg-rose-500/20 text-rose-100 border border-rose-500/30 rounded-xl hover:bg-rose-600 hover:text-white transition-all"
                  title="Strategic Deletion"
                >
                   <TrashIcon className="h-5 w-5" />
                </button>
              )}
              {canEdit && (
                <button 
                  onClick={() => setIsEditing(!isEditing)}
                  className={`p-2.5 rounded-xl border transition-all ${isEditing ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-white/10 text-white border-white/20 hover:bg-white/20'}`}
                  title={isEditing ? "Sync Changes" : "Edit Detail"}
                >
                   <PencilSquareIcon className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>

          {/* Main Title Row */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="flex-1 min-w-0">
               <div className="flex items-center gap-3 mb-3">
                  <span className="bg-white/10 backdrop-blur-md px-3 py-1 rounded-lg text-[9px] font-black tracking-widest uppercase border border-white/20">
                    {ticket.ticketNumber}
                  </span>
                  <div className={`h-2 w-2 rounded-full ${ticket.status === 'RESOLVED' ? 'bg-emerald-400' : 'bg-amber-400'} animate-pulse`} />
               </div>
               
               {isEditing ? (
                  <input 
                    type="text"
                    value={editData.title}
                    onChange={(e) => setEditData({...editData, title: e.target.value})}
                    className="w-full max-w-3xl bg-white/10 border-b-2 border-white/30 px-0 py-2 text-4xl font-black focus:outline-none focus:border-white transition-all placeholder:text-white/30"
                    placeholder="Mission Objective..."
                  />
               ) : (
                  <h1 className="text-4xl md:text-5xl font-black mb-2 leading-tight tracking-tight drop-shadow-sm">{ticket.title}</h1>
               )}
               <p className="text-primary-100 text-sm font-medium">
                 Requested by <span className="font-bold text-white underline decoration-primary-400/50 underline-offset-4">{ticket.requester?.name}</span> to the <span className="font-bold text-white italic">{ticket.receiverDept?.name} Team</span>.
               </p>
            </div>

            {/* Status Command Center (Right Side) */}
            <div className="flex flex-col items-end gap-2">
               {(isAdmin || canAuthoriseRec || ticket.assigneeId === user?.id || ticket.assignments?.some((a:any) => a.userId === user?.id)) ? (
                <div className="relative group/status w-full md:w-64">
                   <p className="text-[10px] font-black uppercase text-primary-200 tracking-[0.2em] mb-2 text-right">Status Command</p>
                   <div className="relative">
                      <select 
                        value={ticket.status}
                        onChange={async (e) => {
                          try {
                            const res = await api.patch(`/tickets/${ticketId}`, { status: e.target.value })
                            toast.success('Status synchronized')
                            setTicket(res.data)
                          } catch (err: any) {
                            toast.error(err.response?.data?.message || 'Sync failure')
                          }
                        }}
                        className="w-full appearance-none bg-white text-primary-900 px-6 py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest cursor-pointer hover:bg-primary-50 transition-all focus:outline-none shadow-xl ring-4 ring-black/5"
                      >
                        <option value="PENDING_REQ_MGR">Pending Approval</option>
                        <option value="PENDING_REC_MGR">Pending Assignment</option>
                        <option value="OPEN">Open Status</option>
                        <option value="ASSIGNED">Assigned Status</option>
                        <option value="IN_PROGRESS">In Progress</option>
                        <option value="RESOLVED">Resolved Status</option>
                        <option value="CANCELLED">Cancelled Status</option>
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                        <ListBulletIcon className="h-4 w-4 text-primary-600" />
                      </div>
                   </div>
                </div>
              ) : (
                <div className="bg-white/10 backdrop-blur-xl border border-white/20 px-8 py-4 rounded-2xl flex flex-col items-end">
                   <p className="text-[9px] font-black uppercase text-primary-200 tracking-widest mb-1">Current Phase</p>
                   <span className="text-xl font-black uppercase tracking-tighter">
                    {ticket.status.replace(/_/g, ' ')}
                   </span>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Background Decor */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-primary-400/20 rounded-full -ml-20 -mb-20 blur-3xl pointer-events-none" />
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
                        <span className="text-[10px] font-black uppercase tracking-tight text-gray-900">Stage 1: Approval</span>
                        {isReqMgrStage ? <ClockIcon className="h-4 w-4 text-amber-600" /> : <CheckCircleIcon className="h-4 w-4 text-emerald-600" />}
                     </div>
                     <p className="text-[11px] font-bold text-gray-600">Authorized by {ticket.requesterManager?.name || 'Department Manager'}.</p>
                     
                     {isReqMgrStage && canAuthoriseReq && (
                        <div className="grid grid-cols-2 gap-2 mt-4">
                           <button onClick={handleApprove} className="flex items-center justify-center gap-2 py-2.5 bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-md shadow-emerald-100">
                             <CheckCircleIcon className="h-4 w-4" /> Approve
                           </button>
                           <button onClick={handleReject} className="flex items-center justify-center gap-2 py-2.5 bg-white text-rose-600 border border-rose-100 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-rose-50 transition-all">
                             <XCircleIcon className="h-4 w-4" /> Reject
                           </button>
                        </div>
                     )}
                  </div>

                  <div className={`p-4 rounded-xl border-2 transition-all ${isRecMgrStage ? 'border-amber-500 bg-amber-50 shadow-sm' : isReqMgrStage ? 'border-gray-100 bg-gray-50 opacity-40' : 'border-emerald-100 bg-emerald-50 opacity-60'}`}>
                     <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black uppercase tracking-tight text-gray-900">Stage 2: Assignment</span>
                        {isRecMgrStage ? <ClockIcon className="h-4 w-4 text-amber-600" /> : !isReqMgrStage ? <CheckCircleIcon className="h-4 w-4 text-emerald-600" /> : null}
                     </div>
                     <p className="text-[11px] font-bold text-gray-600">Authorized by {ticket.receiverManager?.name || ticket.receiverDept?.manager?.name || 'Target Manager'}.</p>

                     {isRecMgrStage && canAuthoriseRec && (
                        <div className="grid grid-cols-2 gap-2 mt-4">
                           <button onClick={handleApprove} className="flex items-center justify-center gap-2 py-2.5 bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-md shadow-emerald-100">
                             <CheckCircleIcon className="h-4 w-4" /> Finalize
                           </button>
                           <button onClick={handleReject} className="flex items-center justify-center gap-2 py-2.5 bg-white text-rose-600 border border-rose-100 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-rose-50 transition-all">
                             <XCircleIcon className="h-4 w-4" /> Reject
                           </button>
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
                  <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                         <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1 italic">Logistical Target</p>
                         <p className="text-[11px] font-black text-gray-900 truncate">{ticket.receiverDept?.name}</p>
                      </div>
                   </div>

                   {/* Tactical Squad Section */}
                   <div className="space-y-4 pt-2">
                      <div className="flex items-center justify-between">
                         <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Tactical Squad</p>
                         <span className="text-[8px] font-bold bg-primary-100 text-primary-600 px-2 py-0.5 rounded-full uppercase">{ticket.assignments?.length || 0} Members</span>
                      </div>
                      
                      <div className="flex flex-wrap gap-2">
                        {/* Always show lead assignee if exists */}
                        {ticket.assignee && (
                          <div className="group relative" title={`${ticket.assignee.name} (Lead)`}>
                             <div className="h-10 w-10 rounded-xl bg-primary-600 flex items-center justify-center overflow-hidden border-2 border-primary-500 shadow-md">
                                <Avatar 
                                  src={ticket.assignee.avatar} 
                                  name={ticket.assignee.name}
                                  size="md"
                                  rounded="xl"
                                />
                             </div>
                             <div className="absolute -bottom-1 -right-1 h-4 w-4 bg-primary-500 rounded-full border-2 border-white flex items-center justify-center">
                                <SparklesIcon className="h-2 w-2 text-white" />
                             </div>
                          </div>
                        )}
                        
                        {/* Show other squad members */}
                        {ticket.assignments?.filter((a: any) => a.userId !== ticket.assigneeId).map((assignment: any) => (
                           <div key={assignment.id} className="relative group" title={assignment.user?.name}>
                              <div className="h-10 w-10 rounded-xl bg-gray-100 flex items-center justify-center overflow-hidden border-2 border-white shadow-sm hover:scale-105 transition-all">
                                 <Avatar 
                                   src={assignment.user?.avatar} 
                                   name={assignment.user?.name}
                                   size="md"
                                   rounded="xl"
                                 />
                              </div>
                           </div>
                        ))}
                      </div>

                      {(ticket.status === 'OPEN' || ticket.status === 'ASSIGNED' || ticket.status === 'PENDING_REC_MGR') && (canAuthoriseRec || isAdmin) && (
                        <div className="space-y-2 pt-2">
                           <p className="text-[9px] font-black text-primary-600 uppercase tracking-widest ml-1 italic">Deploy Personnel</p>
                           <div className="relative">
                              <select
                                value=""
                                onChange={async (e) => {
                                  if (!e.target.value) return;
                                  try {
                                    await api.post(`/tickets/${ticketId}/assign`, { assigneeId: e.target.value })
                                    toast.success('Personnel Deployed')
                                    fetchTicketDetails()
                                  } catch (err: any) { 
                                    toast.error(err.response?.data?.message || 'Deployment failure') 
                                  }
                                }}
                                className="w-full appearance-none text-xs border-2 border-primary-50 rounded-xl p-3.5 bg-primary-50/20 focus:bg-white focus:border-primary-500 font-black text-gray-800 transition-all font-outfit"
                              >
                                <option value="">Assign Specialists...</option>
                                {/* Cross-departmental search allowed as requested */}
                                {users.map(u => (
                                  <option key={u.id} value={u.id}>
                                    {u.name} ({u.department?.name || 'No Dept'})
                                  </option>
                                ))}
                              </select>
                              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                                <PlusIcon className="h-4 w-4 text-primary-500" />
                              </div>
                           </div>
                        </div>
                      {(ticket.status === 'ASSIGNED' || ticket.assignments?.some((a: any) => a.userId === user?.id)) && ticket.status === 'ASSIGNED' && (
                        <button 
                          onClick={async () => {
                            try {
                              await api.patch(`/tickets/${ticketId}/start`)
                              toast.success('MISSION EXECUTION COMMENCED')
                              fetchTicketDetails()
                            } catch { toast.error('Failed to start engagement') }
                          }}
                          className="w-full py-4 bg-primary-600 text-white rounded-xl text-[11px] font-black uppercase tracking-[0.2em] shadow-xl shadow-primary-100 hover:scale-[1.02] transition-all mt-4"
                        >
                          Commence Execution
                        </button>
                      )}

                      {(ticket.status === 'ASSIGNED' || ticket.status === 'IN_PROGRESS') && (ticket.assigneeId === user?.id || isAdmin || ticket.assignments?.some((a: any) => a.userId === user?.id)) && (
                        <button 
                          onClick={async () => {
                            try {
                              await api.patch(`/tickets/${ticketId}/resolve`)
                              toast.success('MISSION OBJECTIVE FINALIZED')
                              fetchTicketDetails()
                            } catch { toast.error('Sync error') }
                          }}
                          className={`w-full py-4 ${ticket.status === 'IN_PROGRESS' ? 'bg-emerald-600 shadow-emerald-100 shadow-xl' : 'bg-gray-100 text-gray-500'} text-white rounded-xl text-[11px] font-black uppercase tracking-[0.2em] hover:scale-[1.02] transition-all mt-4`}
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
               
               {ticket.status === 'CANCELLED' && ticket.comments?.some((c: any) => c.comment.startsWith('Rejected:')) && (
                 <div className="p-5 bg-rose-50 border-l-4 border-rose-500 rounded-xl mb-4 animate-in slide-in-from-top-4 duration-500">
                   <div className="flex items-center gap-3 mb-2">
                     <XCircleIcon className="h-5 w-5 text-rose-600" />
                     <span className="text-xs font-black uppercase tracking-widest text-rose-700">Strategic Rejection Notated</span>
                   </div>
                   <p className="text-sm font-bold text-rose-900 leading-relaxed italic">
                     "{ticket.comments.find((c: any) => c.comment.startsWith('Rejected:'))?.comment.replace('Rejected: ', '')}"
                   </p>
                 </div>
               )}
              
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
                    comment.isSystem ? (
                      <div key={comment.id} className="flex justify-center my-6">
                        <div className="bg-gray-100/50 backdrop-blur-sm border border-gray-200/50 px-5 py-2 rounded-full shadow-sm animate-in zoom-in duration-500">
                          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest text-center whitespace-pre-wrap">
                            {comment.comment}
                          </p>
                        </div>
                      </div>
                    ) : (
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
                    )
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
              {(ticket.status === 'RESOLVED' || ticket.status === 'CANCELLED') ? (
                <div className="p-8 bg-gray-100/50 border-t border-gray-100 flex items-center justify-center">
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] italic">
                     Intelligence Feed Archived · Mission {ticket.status === 'RESOLVED' ? 'Finalized' : 'Terminated'}
                   </p>
                </div>
              ) : (
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
                          placeholder="Leave your message here, mention by using @..."
                          value={newComment}
                          onChange={handleInputChange}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault()
                              handleAddComment()
                            }
                          }}
                          className="w-full px-6 py-4 bg-white border border-gray-200 rounded-2xl text-xs font-bold text-gray-800 placeholder:text-gray-400 placeholder:italic focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all resize-none shadow-sm font-outfit"
                       />
                       <button 
                         type="submit"
                         disabled={!newComment.trim()}
                         className="h-12 w-12 bg-primary-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-primary-500/20 hover:scale-110 active:scale-95 transition-all disabled:opacity-50 disabled:grayscale disabled:scale-100"
                       >
                          <PaperAirplaneIcon className="h-5 w-5" />
                       </button>
                    </form>
                </div>
              )}
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
