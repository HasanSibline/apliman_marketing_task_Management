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
  const commentsTopRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (ticketId) {
      fetchTicketDetails()
      fetchUsers()
      fetchDepartments()
      fetchAttachments()
    }
  }, [ticketId])

  useEffect(() => {
    if (isEditing) {
      scrollToTop()
      return
    }
    scrollToBottom()
    // isEditing belongs here: without it, turning editing on reads the flag but never
    // re-runs, so the field it is meant to reveal stays out of view.
  }, [ticket?.comments, isEditing])

  /** Editing means looking at the description, which lives at the top of the thread. */
  const scrollToTop = () => {
    commentsTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

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
      console.log(`Downloading ${fileName}`);
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
        toast.error(error.response?.data?.message || 'Could not load that ticket');
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
        toast.error('Request declined')
        fetchTicketDetails()
      } else if (type === 'cancel') {
        await api.patch(`/tickets/${ticketId}`, { status: 'CANCELLED', metadata: { ...ticket.metadata, cancelReason: reason } })
        toast.error('Ticket Aborted')
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
      title: 'Delete this ticket?',
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
      title: 'Decline this request?',
      description: 'Specify the operational reason for rejecting this engagement request.',
      requireReason: true,
      reasons: ['Not enough detail', 'No budget for it', 'Too much on right now', 'Wrong department', 'Already raised elsewhere']
    })
  }

  const handleCancel = () => {
    setActionModal({
      isOpen: true,
      type: 'cancel',
      title: 'Ticket Cancellation',
      description: 'Specify the reason for cancelling this ticket permanently.',
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
      toast.success('Removed from this ticket')
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
        <ArrowPathIcon className="h-10 w-10 text-primary-600 dark:text-primary-400 animate-spin" />
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
          className="flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-primary-600 transition group"
        >
          <ChevronLeftIcon className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
          Back to tickets
        </button>

        {isAdmin && (
          <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-full">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-wide">Admin</span>
          </div>
        )}
      </div>

      {/*
        A page header, not a hero.

        This was a 260px gradient banner with two blurred orbs, a 48px title, an
        "IDENTIFIER:" prefix on the ticket number and a status label set in letter-
        spaced ten-pixel caps reading "Strategic Ticket Status". It cost the top third
        of the screen before the description, and it was the only page in the app that
        announced itself this way. The same facts fit in a header the size of every
        other page's, on the same surface as everything else.
      */}
      <div className="surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {ticket.ticketNumber}
              </span>
              <span
                className={`status-badge ${
                  ticket.status === 'RESOLVED'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                    : ticket.status === 'CANCELLED'
                      ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300'
                      : ticket.status === 'PENDING_REC_MGR'
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                        : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                }`}
              >
                {ticket.status === 'PENDING_REC_MGR' ? 'Pending approval' : ticket.status.replace(/_/g, ' ').toLowerCase()}
              </span>
              {ticket.category && (
                <span className="status-badge bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                  {ticket.category}
                </span>
              )}
            </div>

            {isEditing ? (
              <input
                type="text"
                value={editData.title}
                onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                className="input-field mt-2 text-xl font-semibold"
                placeholder="Ticket title"
              />
            ) : (
              <h1 className="page-title mt-2">{ticket.title}</h1>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-gray-600 dark:text-gray-400">
              <span className="flex items-center gap-2">
                <Avatar src={ticket.requester?.avatar} name={ticket.requester?.name} size="xs" rounded="full" />
                Raised by{' '}
                <span className="font-medium text-gray-900 dark:text-white">{ticket.requester?.name}</span>
              </span>
              <span className="text-gray-300 dark:text-gray-600" aria-hidden="true">·</span>
              <span>
                For <span className="font-medium text-gray-900 dark:text-white">{ticket.receiverDept?.name}</span>
              </span>
            </div>
          </div>

          <div className="flex flex-col items-end gap-3">
            <div className="flex items-center gap-2">
              {canEdit && (
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className="btn-secondary"
                  title={isEditing ? 'Stop editing' : 'Edit this ticket'}
                >
                  <PencilSquareIcon className="mr-2 h-4 w-4" />
                  {isEditing ? 'Done' : 'Edit'}
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={handleDeleteTicket}
                  aria-label="Delete this ticket"
                  className="btn-secondary text-red-600 hover:text-red-700 dark:text-red-400"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              )}
            </div>

            {(isAdmin || canAuthoriseRec || ticket.assigneeId === user?.id || ticket.assignments?.some((a: any) => a.userId === user?.id)) ? (
              <div className="w-full sm:w-64">
                <label htmlFor="ticket-status" className="form-label">Status</label>
                <select
                  id="ticket-status"
                  value={ticket.status}
                  onChange={async (e) => {
                    const val = e.target.value;
                    if (val === 'CANCELLED') { handleCancel(); return; }

                    try {
                      const res = await api.patch(`/tickets/${ticketId}`, { status: val })
                      toast.success('Status updated')
                      setTicket(res.data)

                      if (val === 'ASSIGNED') {
                        document.getElementById('deployment-section')?.scrollIntoView({ behavior: 'smooth' });
                      }
                    } catch (err: any) {
                      toast.error(err.response?.data?.message || 'Could not update the status')
                    }
                  }}
                  className="select-field"
                >
                  <option value="PENDING_REC_MGR">Pending approval</option>
                  <option value="OPEN">Open</option>
                  <option value="ASSIGNED">
                    Assigned to {(() => {
                      const count = ticket.assignments?.filter((a: any) => a.status === 'ACCEPTED').length || 0;
                      if (count > 1) return `${count} people`;
                      if (count === 1) return ticket.assignments.find((a: any) => a.status === 'ACCEPTED')?.user?.name || '1 person';
                      return 'someone';
                    })()}
                  </option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

        {/* Left: details and actions */}
        <div className="lg:col-span-1 space-y-6">

          {/* Approval Matrix Card */}
          {isRecMgrStage && (
            <div className="surface p-6 space-y-6 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 tracking-wider">Waiting on approval</h3>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-xl border-2 border-amber-500 bg-amber-50 dark:bg-amber-900/30 shadow-sm transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold tracking-tight text-gray-900 dark:text-white">
                      Needs a decision
                    </span>
                    <ClockIcon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <p className="text-xs font-bold text-gray-600 dark:text-gray-300">
                    Waiting for {ticket.receiverManager?.name || ticket.receiverDept?.manager?.name || 'Department Manager'} to approve or decline this request.
                  </p>

                  {(isRecMgrStage && canAuthoriseRec) && (
                    <div className="grid grid-cols-2 gap-2 mt-4">
                      <button onClick={handleApprove} className="flex items-center justify-center gap-2 py-2.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold tracking-wide hover:bg-emerald-700 transition-all shadow-md shadow-emerald-100">
                        <CheckCircleIcon className="h-4 w-4" /> Approve
                      </button>
                      <button onClick={handleReject} className="flex items-center justify-center gap-2 py-2.5 bg-white dark:bg-gray-800 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-900/40 rounded-lg text-xs font-semibold tracking-wide hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-all">
                        <XCircleIcon className="h-4 w-4" /> Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Configuration Card */}
          <div className="surface p-6 space-y-6 shadow-sm font-outfit">
            <div className="flex items-center gap-2">
              <ListBulletIcon className="h-4 w-4 text-primary-500" />
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-normal">Details</h3>
            </div>

            {isEditing ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-primary-600 dark:text-primary-400 tracking-wide ml-1">Department</label>
                  <select
                    value={editData.receiverDeptId}
                    onChange={(e) => setEditData({ ...editData, receiverDeptId: e.target.value })}
                    className="select-field w-full text-xs"
                  >
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                {isAdmin && (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-rose-600 dark:text-rose-400 tracking-wide ml-1">Status</label>
                    <select
                      value={editData.status}
                      onChange={(e) => setEditData({ ...editData, status: e.target.value })}
                      className="select-field w-full text-xs"
                    >
                      {['PENDING_REC_MGR', 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'].map(s => (
                        <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <button onClick={handleUpdateTicket} className="bg-primary-600 text-white rounded-xl py-3 text-xs font-semibold tracking-wide hover:bg-primary-700 transition-all">Save changes</button>
                  <button onClick={() => setIsEditing(false)} className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-xl py-3 text-xs font-semibold tracking-wide hover:bg-gray-200 dark:hover:bg-gray-600 transition-all">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Who is on it */}
                <div id="deployment-section" className="space-y-4 pt-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-wide ml-1">People on this ticket</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 px-2 py-0.5 rounded-full uppercase">{ticket.assignments?.length || 0} people</span>
                      <div className="relative group">
                        <button className="flex items-center gap-1 text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 px-2 py-1 rounded-md transition-all tracking-wide shadow-md active:scale-95">
                          <PlusIcon className="h-2 w-2" /> Invite
                        </button>
                        <div className="absolute right-0 top-full mt-2 w-56 surface border border-gray-100 dark:border-gray-700 p-2 z-[100] opacity-0 group-focus-within:opacity-100 pointer-events-none group-focus-within:pointer-events-auto transition-all scale-95 group-focus-within:scale-100 origin-top-right">
                          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-wide mb-1.5 px-2">Add someone</p>
                          <div className="max-h-48 overflow-y-auto space-y-0.5 pr-1 custom-scrollbar">
                            {users.filter(u => u.id !== user?.id && !ticket.assignments?.some((a: any) => a.userId === u.id)).map(u => (
                              <button
                                key={u.id}
                                onClick={() => handleInvite(u.id)}
                                className="w-full flex items-center gap-2 p-2 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-lg transition-all group/item overflow-hidden"
                              >
                                <Avatar src={u.avatar} name={u.name} size="xs" rounded="lg" />
                                <div className="text-left">
                                  <p className="text-xs font-semibold text-gray-900 dark:text-white group-hover/item:text-primary-600 transition-colors truncate tracking-tight">{u.name}</p>
                                  <p className="text-xs font-bold text-gray-500 dark:text-gray-400 truncate tracking-wide">{u.department?.name || 'No department'}</p>
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
                      <div key={assignment.id} className="relative group" title={`${assignment.user?.name}${assignment.status === 'PENDING' ? ' (Pending)' : ''}`}>
                        <div className={`h-10 w-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden border-2 border-white shadow-sm hover:scale-105 transition-all ${assignment.status === 'PENDING' ? 'opacity-50 grayscale' : ''}`}>
                          <Avatar
                            src={assignment.user?.avatar}
                            name={assignment.user?.name}
                            size="md"
                            rounded="xl"
                          />
                        </div>
                        {assignment.status === 'PENDING' && (
                          <div className="absolute -top-1 -left-1 h-3 w-3 bg-amber-500 rounded-full border border-white" />
                        )}
                        {/* Remove button for colleague */}
                        <button 
                          onClick={() => handleRemoveAssignment(assignment.id)}
                          className="absolute -top-1.5 -right-1.5 h-4 w-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-sm z-10"
                        >
                          <span className="text-xs">&times;</span>
                        </button>
                      </div>
                    ))}
                  </div>

                  {(ticket.status === 'OPEN' || ticket.status === 'ASSIGNED' || ticket.status === 'PENDING_REC_MGR') && (canAuthoriseRec || isAdmin) && (
                    <div className="space-y-2 pt-2">
                      <p className="text-xs font-semibold text-primary-600 dark:text-primary-400 tracking-wide ml-1">Add more colleagues</p>
                      <div className="relative">
                        <select
                          value=""
                          onChange={async (e) => {
                            if (!e.target.value) return;
                            try {
                              await api.post(`/tickets/${ticketId}/assign`, { assigneeId: e.target.value })
                              toast.success('Invitation sent')
                              fetchTicketDetails()
                            } catch (err: any) {
                              toast.error(err.response?.data?.message || 'Deployment failure')
                            }
                          }}
                          className="select-field w-full text-xs"
                        >
                          <option value="">Assign people...</option>
                          {/* Cross-departmental search allowed as requested */}
                          {users.map(u => (
                            <option key={u.id} value={u.id}>
                              {u.name} ({u.department?.name || 'No Dept'})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {(ticket.status === 'ASSIGNED' || ticket.assignments?.some((a: any) => a.userId === user?.id)) && ticket.status === 'ASSIGNED' && (
                    <button
                      onClick={async () => {
                        try {
                          await api.patch(`/tickets/${ticketId}/start`)
                          toast.success('TICKET EXECUTION COMMENCED')
                          fetchTicketDetails()
                        } catch { toast.error('Failed to start engagement') }
                      }}
                      className="w-full py-4 bg-primary-600 text-white rounded-xl text-xs font-semibold tracking-normal shadow-md shadow-primary-100 hover:scale-[1.02] transition-all mt-4"
                    >
                      Commence Execution
                    </button>
                  )}

                  {(ticket.status === 'ASSIGNED' || ticket.status === 'IN_PROGRESS') && (ticket.assigneeId === user?.id || isAdmin || ticket.assignments?.some((a: any) => a.userId === user?.id)) && (
                    <button
                      onClick={async () => {
                        try {
                          await api.patch(`/tickets/${ticketId}/resolve`)
                          toast.success('TICKET FINALIZED')
                          fetchTicketDetails()
                        } catch { toast.error('Sync error') }
                      }}
                      className={`w-full py-4 ${ticket.status === 'IN_PROGRESS' ? 'bg-emerald-600 shadow-emerald-100 shadow-md' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'} text-white rounded-xl text-xs font-semibold uppercase tracking-normal hover:scale-[1.02] transition-all mt-4`}
                    >
                      Mark resolved
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Documentation Repository */}
          <div className="surface p-6 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PaperClipIcon className="h-4 w-4 text-primary-500" />
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-normal">Attachments</h3>
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
                <div key={att.id} className="group flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/40 rounded-xl border border-transparent hover:border-gray-100 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-700 transition-all">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-lg bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 flex items-center justify-center text-primary-600 dark:text-primary-400 shadow-sm">
                      <DocumentIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-900 dark:text-white truncate tracking-tight">{att.fileName}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-bold tracking-wide">{(att.fileSize / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    <button onClick={() => handleDownload(att.id, att.fileName)} className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"><ArrowDownTrayIcon className="h-4 w-4" /></button>
                    {canEdit && <button onClick={() => handleDeleteAttachment(att.id)} className="p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition-colors"><TrashIcon className="h-4 w-4" /></button>}
                  </div>
                </div>
              ))}
              {attachments.length === 0 && (
                <div className="py-6 text-center border-2 border-dashed border-gray-50 dark:border-gray-700 rounded-xl">
                  <p className="text-xs font-semibold text-gray-300">Nothing attached yet</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: description and conversation */}
        <div className="lg:col-span-2 space-y-8">

          {/* A declined ticket says so before anything else, because the reason is
              the only thing anyone opens it for. */}
          {ticket.status === 'CANCELLED' && ticket.comments?.some((c: any) => c.comment.startsWith('Rejected:')) && (
            <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/40 dark:bg-rose-900/20">
              <XCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
              <div>
                <p className="text-sm font-semibold text-rose-900 dark:text-rose-200">Declined</p>
                <p className="mt-1 text-sm leading-relaxed text-rose-800 dark:text-rose-300">
                  {ticket.comments.find((c: any) => c.comment.startsWith('Rejected:'))?.comment.replace('Rejected: ', '')}
                </p>
              </div>
            </div>
          )}

          {/*
            One thread, opening with the request itself.

            The description sat in its own card above this one, and both looked empty
            as a result: a sentence marooned in a large box, then a seven-hundred-pixel
            void with a single system line floating in the middle of it. They are one
            thing. A ticket is a conversation, and its description is the first thing
            said in it, so it reads as the opening message and everything else follows
            in order. The panel now grows with what is in it up to a limit, rather than
            reserving a fixed height whether or not there is anything to put there.
          */}
          <div className="surface flex max-h-[38rem] min-h-[30rem] flex-col overflow-hidden">
            <div className="flex items-center gap-2.5 border-b border-gray-100 px-5 py-3.5 dark:border-gray-700">
              <ChatBubbleLeftRightIcon className="h-4 w-4 text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Conversation</h3>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {(() => {
                  const n = ticket.comments?.filter(
                    (c: any) => !c.isSystem && !c.comment?.startsWith('Rejected: '),
                  ).length ?? 0
                  return `${n} ${n === 1 ? 'reply' : 'replies'}`
                })()}
              </span>
            </div>

            <div className="custom-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
              {/* The request, as the first message. */}
              <div ref={commentsTopRef} className="flex items-start gap-3">
                <Avatar src={ticket.requester?.avatar} name={ticket.requester?.name} size="sm" rounded="full" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {ticket.requester?.name}
                    <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">opened this</span>
                  </p>
                  {isEditing ? (
                    <textarea
                      value={editData.description}
                      onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                      rows={5}
                      className="input-field mt-1.5 resize-none"
                      placeholder="What do you need, and by when?"
                    />
                  ) : (
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                      {ticket.description || (
                        <span className="italic text-gray-500 dark:text-gray-400">No description was given.</span>
                      )}
                    </p>
                  )}
                </div>
              </div>

              {ticket.comments?.filter((c: any) => !c.comment?.startsWith('Rejected: ')).map((comment: any) => (
                comment.isSystem ? (
                  <div key={comment.id} className="flex justify-center my-6">
                    <div className="bg-gray-100/50 dark:bg-gray-900/40 backdrop-blur-sm border border-gray-200/50 px-5 py-3 rounded-xl shadow-sm animate-in zoom-in duration-500 max-w-[90%]">
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-wide text-center whitespace-pre-wrap">
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
                        <span className="text-xs font-semibold text-gray-900 dark:text-white tracking-tight">{comment.user.name}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 font-bold tracking-wide">{new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className={`px-6 py-4 rounded-xl text-xs font-semibold leading-relaxed tracking-wide shadow-sm whitespace-pre-wrap
                          ${comment.userId === user?.id
                          ? 'bg-primary-600 text-white rounded-tr-none'
                          : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-tl-none border border-gray-100 dark:border-gray-700'}`}>
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
              <div ref={commentsEndRef} />
            </div>

            {/* Feed Input */}
            {(ticket.status === 'RESOLVED' || ticket.status === 'CANCELLED') ? (
              <div className="p-8 bg-gray-100/50 dark:bg-gray-900/40 border-t border-gray-100 dark:border-gray-700 flex items-center justify-center">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-[0.3em]">
                  This ticket is {ticket.status === 'RESOLVED' ? 'resolved' : 'closed'}, so the conversation is closed too.
                </p>
              </div>
            ) : (
              <div className="p-8 bg-gray-50/50 dark:bg-gray-900/40 border-t border-gray-100 dark:border-gray-700 relative">
                {showMentions && filteredUsers.length > 0 && (
                  <div className="absolute bottom-full left-8 mb-4 w-72 surface border border-gray-100 dark:border-gray-700 overflow-hidden z-20">
                    <div className="bg-gray-50/80 dark:bg-gray-900/40 px-4 py-2 text-xs font-semibold text-gray-400 border-b border-gray-100 dark:border-gray-700 tracking-wide">Choose someone</div>
                    {filteredUsers.map(u => (
                      <button
                        key={u.id}
                        onClick={() => insertMention(u.name)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-primary-50 dark:hover:bg-primary-900/30 text-left transition-all border-b border-gray-50 dark:border-gray-700 last:border-0 group"
                      >
                        <div className="h-8 w-8 rounded-lg bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 flex items-center justify-center overflow-hidden border border-primary-200 group-hover:scale-110 transition-transform">
                          {u.avatar ? <img src={formatAssetUrl(u.avatar)} className="h-full w-full object-cover" /> : <span className="text-xs font-semibold">{u.name.charAt(0)}</span>}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-gray-900 dark:text-white truncate tracking-tight">{u.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 font-bold tracking-wide truncate">{u.department?.name || 'External'}</p>
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
                    className="w-full px-6 py-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-bold text-gray-800 dark:text-gray-100 placeholder:text-gray-400 placeholder:focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all resize-none shadow-sm font-outfit"
                  />
                  <button aria-label="Send"
                    type="submit"
                    disabled={!newComment.trim()}
                    className="h-12 w-12 bg-primary-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-primary-500/20 hover:scale-110 active:scale-95 transition-all disabled:opacity-50 disabled:grayscale disabled:scale-100"
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
