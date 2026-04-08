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
    type: 'delete' | 'reject' | 'remove_attachment' | 'cancel';
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
      } else if (type === 'cancel') {
        await api.patch(`/tickets/${ticketId}`, { status: 'CANCELLED', metadata: { ...ticket.metadata, cancelReason: reason } })
        toast.error('Mission Aborted')
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
    setTicket({ ...ticket, title: editData.title, description: editData.description })
    setIsEditing(false)

    try {
      await api.patch(`/tickets/${ticketId}`, editData)
      toast.success('Ticket synchronized')
      fetchTicketDetails()
    } catch (error: any) {
      setTicket({ ...ticket, title: oldTitle, description: oldDesc })
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

  const handleCancel = () => {
    setActionModal({
      isOpen: true,
      type: 'cancel',
      title: 'Mission Cancellation',
      description: 'Specify the reason for aborting this mission permanently.',
      requireReason: true,
      reasons: ['Resource Reallocation', 'Client Request', 'Objective Obsolete', 'Budgetary Cut', 'Technical Impossibility']
    })
  }

  const handleInvite = async (personId: string) => {
    try {
      await api.post(`/tickets/${ticketId}/invite`, { personId })
      toast.success('Colleague added successfully')
      fetchTicketDetails()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Invitation failed')
    }
  }

  const handleRemoveAssignment = async (assignmentId: string) => {
    try {
      await api.delete(`/tickets/${ticketId}/assignments/${assignmentId}`)
      toast.success('Personnel access revoked')
      fetchTicketDetails()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to remove colleague')
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
  const isRecMgrStage = ticket.status === 'PENDING_REC_MGR';
  const canAuthoriseRec = (ticket.receiverManagerId === user?.id || ticket.receiverDept?.managerId === user?.id || isAdmin);

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-500 max-w-7xl mx-auto">

      {/* Breadcrumbs / Back Navigation (Aligned with other detail pages) */}
      <div className="flex items-center justify-between px-1">
        <button
          onClick={() => navigate('/tickets')}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-primary-600 transition group"
        >
          <ChevronLeftIcon className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
          Back to Logistics Hub
        </button>

        {isAdmin && (
          <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-gray-50 border border-gray-200 rounded-full">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Administrative Control Access</span>
          </div>
        )}
      </div>

      {/* Header Card (Thematic Gradient Match) */}
      <div className="bg-gradient-to-br from-primary-600 via-primary-700 to-indigo-800 rounded-2xl p-8 lg:px-10 lg:py-7 text-white relative overflow-hidden shadow-2xl border border-white/10 min-h-[260px] flex flex-col justify-between">

        {/* Top Section: ID & Status (Left) | Actions & Switcher (Right) */}
        <div className="relative z-20 flex flex-col lg:flex-row justify-between items-start gap-6">

          {/* Top Left: ID and Badges */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="bg-white/10 backdrop-blur-md px-3 py-1 rounded-full text-[9px] font-black tracking-[0.2em] uppercase border border-white/10 text-primary-50">
                IDENTIFIER: {ticket.ticketNumber}
              </div>
              <div className="flex items-center gap-2 px-3 py-1 bg-black/10 backdrop-blur-sm rounded-full border border-white/5">
                <div className={`h-1.5 w-1.5 rounded-full ${ticket.status === 'RESOLVED' ? 'bg-emerald-400' : ticket.status === 'CANCELLED' ? 'bg-rose-400' : (ticket.status === 'PENDING_REC_MGR' ? 'bg-amber-400' : 'bg-blue-400')} animate-pulse`} />
                <span className="text-[9px] font-black tracking-widest uppercase text-white/70">
                  {ticket.status === 'PENDING_REC_MGR' ? 'Pending Approval' : 
                   ticket.status.replace(/_/g, ' ')}
                </span>
              </div>
            </div>

            {/* Mission Objective (Title) - Moved Higher */}
            <div className="animate-in slide-in-from-left-4 duration-700">
              {isEditing ? (
                <input
                  type="text"
                  value={editData.title}
                  onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                  className="w-full bg-white/5 border-b-2 border-white/20 px-0 py-1 text-3xl lg:text-4xl font-black focus:outline-none focus:border-white transition-all placeholder:text-white/20 rounded-none shadow-none"
                  placeholder="Update Mission Objective..."
                />
              ) : (
                <h1 className="text-3xl lg:text-5xl font-black leading-tight tracking-tight drop-shadow-xl max-w-4xl">
                  {ticket.title}
                </h1>
              )}
            </div>
          </div>

          {/* Top Right: Actions + Switcher (Under Actions) */}
          <div className="flex flex-col items-end gap-3 self-start">
            {/* Quick Actions */}
            <div className="flex items-center gap-2 mb-1">
              {isAdmin && (
                <button
                  onClick={handleDeleteTicket}
                  className="p-2 rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-100 hover:bg-rose-600 hover:text-white transition-all shadow-lg backdrop-blur-md"
                  title="Terminate Mission"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              )}
              {canEdit && (
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className={`p-2 rounded-lg border transition-all shadow-lg backdrop-blur-md ${isEditing ? 'bg-emerald-500 border-emerald-400' : 'bg-white/10 border-white/20 hover:bg-white/20'}`}
                  title="Strategic Adjustment"
                >
                  <PencilSquareIcon className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Status Switcher - Moved Up & Scaled Down */}
            {(isAdmin || canAuthoriseRec || ticket.assigneeId === user?.id || ticket.assignments?.some((a: any) => a.userId === user?.id)) ? (
              <div className="w-full md:w-80">
                <p className="text-[8px] font-black uppercase text-white/40 tracking-[0.3em] mb-1.5 text-right">Strategic Mission Status</p>
                <div className="relative group">
                    <select
                    value={ticket.status}
                    onChange={async (e) => {
                      const val = e.target.value;
                      if (val === 'CANCELLED') { handleCancel(); return; }

                      try {
                        const res = await api.patch(`/tickets/${ticketId}`, { status: val })
                        toast.success('Frequency Synchronized')
                        setTicket(res.data)

                        if (val === 'ASSIGNED') {
                          document.getElementById('deployment-section')?.scrollIntoView({ behavior: 'smooth' });
                        }
                      } catch (err: any) {
                        toast.error(err.response?.data?.message || 'Sync failure')
                      }
                    }}
                    className="w-full appearance-none bg-white text-slate-800 pr-10 pl-5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-[0.15em] cursor-pointer hover:shadow-xl transition-all focus:outline-none shadow-lg border-b-2 border-slate-100 ring-2 ring-white/5"
                  >
                    <option value="PENDING_REC_MGR">Pending approval</option>
                    <option value="OPEN">Open</option>
                    <option value="ASSIGNED">Assigned to {ticket.assignments?.length > 0 ? (ticket.assignments.length === 1 ? ticket.assignee?.name : `${ticket.assignments.length} Specialists`) : 'Specialists'}</option>
                    <option value="RESOLVED">Resolved</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                    {/* Arrow removed per request */}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white text-slate-900 px-6 py-2.5 rounded-xl flex flex-col items-end shadow-xl border-b-2 border-slate-100 ring-4 ring-white/5">
                <p className="text-[8px] font-black uppercase text-slate-400 tracking-[0.3em] mb-0.5">Operational State</p>
                <span className="text-sm font-black uppercase tracking-tight">
                  {ticket.status === 'PENDING_REC_MGR' ? 'Departmental Approval' : 
                   ticket.status.replace(/_/g, ' ')}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Section: Logistical Metadata - Stays at Bottom */}
        <div className="relative z-10 opacity-80 border-t border-white/10 pt-4 mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex items-center gap-2">
            <Avatar src={ticket.requester?.avatar} name={ticket.requester?.name} size="xs" rounded="full" />
            <p className="text-[11px] font-bold text-primary-50">
              Initiated by <span className="text-white font-black">{ticket.requester?.name}</span>
            </p>
          </div>
          <div className="h-1 w-1 rounded-full bg-white/20" />
          <p className="text-[11px] font-bold text-primary-50 flex items-center gap-2">
            <span className="text-white/40 font-black uppercase text-[9px] tracking-widest">Route:</span>
            <span className="italic">{ticket.receiverDept?.name} Operation</span>
          </p>
        </div>

        {/* Simple Visual Polish - Glass Accents */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -mr-48 -mt-48 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/10 rounded-full -ml-32 -mb-32 blur-2xl pointer-events-none" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

        {/* Left Col: Strategic Metadata & Actions */}
        <div className="lg:col-span-1 space-y-6">

          {/* Approval Matrix Card */}
          {isRecMgrStage && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Authorization Required</h3>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-xl border-2 border-amber-500 bg-amber-50 shadow-sm transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black uppercase tracking-tight text-gray-900">
                      Departmental Authorization Stage
                    </span>
                    <ClockIcon className="h-4 w-4 text-amber-600" />
                  </div>
                  <p className="text-[11px] font-bold text-gray-600 italic">
                    Wait for {ticket.receiverManager?.name || ticket.receiverDept?.manager?.name || 'Department Manager'} to authorize this mission.
                  </p>

                  {(isRecMgrStage && canAuthoriseRec) && (
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
                    onChange={(e) => setEditData({ ...editData, receiverDeptId: e.target.value })}
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
                      onChange={(e) => setEditData({ ...editData, status: e.target.value })}
                      className="w-full text-xs border-2 border-rose-50 rounded-xl p-3 bg-rose-50/30 focus:bg-white focus:border-rose-500 transition-all font-black text-gray-800"
                    >
                      {['PENDING_REC_MGR', 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'].map(s => (
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

                {/* Tactical Squad Section */}
                <div id="deployment-section" className="space-y-4 pt-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Tactical Squad</p>
                    <div className="flex items-center gap-2">
                      <span className="text-[8px] font-bold bg-primary-100 text-primary-600 px-2 py-0.5 rounded-full uppercase">{ticket.assignments?.length || 0} Members</span>
                      <div className="relative group">
                        <button className="flex items-center gap-1 text-[8px] font-black text-white bg-primary-600 hover:bg-primary-700 px-2 py-1 rounded-md transition-all uppercase tracking-widest shadow-md active:scale-95">
                          <PlusIcon className="h-2 w-2" /> Invite Colleague
                        </button>
                        <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-2xl border border-gray-100 p-2 z-[100] opacity-0 group-focus-within:opacity-100 pointer-events-none group-focus-within:pointer-events-auto transition-all scale-95 group-focus-within:scale-100 origin-top-right">
                          <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1.5 px-2">Collaborative Search</p>
                          <div className="max-h-48 overflow-y-auto space-y-0.5 pr-1 custom-scrollbar">
                            {users.filter(u => u.id !== user?.id && !ticket.assignments?.some((a: any) => a.userId === u.id)).map(u => (
                              <button
                                key={u.id}
                                onClick={() => handleInvite(u.id)}
                                className="w-full flex items-center gap-2 p-2 hover:bg-primary-50 rounded-lg transition-all group/item overflow-hidden"
                              >
                                <Avatar src={u.avatar} name={u.name} size="xs" rounded="lg" />
                                <div className="text-left">
                                  <p className="text-[10px] font-black text-gray-900 group-hover/item:text-primary-600 transition-colors uppercase truncate tracking-tight">{u.name}</p>
                                  <p className="text-[8px] font-bold text-gray-400 truncate uppercase tracking-widest">{u.department?.name || 'Logistics'}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
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
                        {/* Remove button for colleague */}
                        <button 
                          onClick={() => handleRemoveAssignment(assignment.id)}
                          className="absolute -top-1.5 -right-1.5 h-4 w-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-sm z-10"
                        >
                          <span className="text-[10px]">&times;</span>
                        </button>
                      </div>
                    ))}
                  </div>

                  {(ticket.status === 'OPEN' || ticket.status === 'ASSIGNED' || ticket.status === 'PENDING_REC_MGR') && (canAuthoriseRec || isAdmin) && (
                    <div className="space-y-2 pt-2">
                      <p className="text-[9px] font-black text-primary-600 uppercase tracking-widest ml-1 italic">Add more colleagues</p>
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
                  )}

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
                onChange={(e) => setEditData({ ...editData, description: e.target.value })}
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
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden h-[700px]">
            <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 bg-primary-100 text-primary-600 rounded-xl flex items-center justify-center border border-primary-200 shadow-sm">
                  <ChatBubbleLeftRightIcon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-xs font-black text-gray-900 uppercase tracking-tight leading-none">Ticket conversation</h3>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Conversation on this ticket will be logged</p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
              {ticket.comments?.map((comment: any) => (
                comment.isSystem ? (
                  <div key={comment.id} className="flex justify-center my-6">
                    <div className="bg-gray-100/50 backdrop-blur-sm border border-gray-200/50 px-5 py-3 rounded-xl shadow-sm animate-in zoom-in duration-500 max-w-[90%]">
                      <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest text-center whitespace-pre-wrap">
                        {comment.comment.replace(/^\s*[\u2022\-\*]\s+/, '')}
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
                        <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">{new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
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
