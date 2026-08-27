import React, { useState, useEffect, useRef } from 'react'
import { 
  PlusIcon, 
  TicketIcon, 
  CheckCircleIcon, 
  XCircleIcon, 
  ChatBubbleLeftRightIcon,
  ArrowRightIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  XMarkIcon
} from '@heroicons/react/24/outline'
import api, { formatAssetUrl } from '@/services/api'
import { useAppSelector } from '@/hooks/redux'
import { toast } from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import ActionModal from '@/components/ui/ActionModal'
import { confirmDialog, promptDialog } from '@/components/ui/confirm'
import CreateTicketModal from '@/components/tickets/CreateTicketModal'
import Select from '@/components/ui/Select'

type TicketStatus = 'PENDING_REC_MGR' | 'OPEN' | 'ASSIGNED' | 'RESOLVED' | 'CANCELLED' | 'IN_PROGRESS'

/**
 * One page size, named once.
 *
 * It was a bare 10 here and a bare 10 in the service, with nothing tying them
 * together, so the page count silently lied the moment either moved. The request now
 * states the size it is paginating against rather than assuming the server's default
 * matches the arithmetic below.
 */
const PAGE_SIZE = 12

/** What each item in the Sort control asks the server for. */
const SORT_OPTIONS: Record<
  'newest' | 'oldest' | 'deadline' | 'priority',
  { label: string; sortBy: 'createdAt' | 'deadline' | 'priority'; sortDir: 'asc' | 'desc' }
> = {
  newest: { label: 'Newest', sortBy: 'createdAt', sortDir: 'desc' },
  oldest: { label: 'Oldest', sortBy: 'createdAt', sortDir: 'asc' },
  deadline: { label: 'Deadline soonest', sortBy: 'deadline', sortDir: 'asc' },
  priority: { label: 'Priority', sortBy: 'priority', sortDir: 'desc' },
}

/**
 * The exact statuses a ticket can be in, grouped the way the Active/History tabs
 * already group them.
 *
 * The server has no field for "just this one status" — `statusType` only knows
 * Active (not resolved or cancelled), History (resolved or cancelled) and All, which
 * is the right shape for the tabs above this bar but too coarse for someone who
 * wants only the tickets still waiting on them specifically. Narrowing to one exact
 * status is done client-side, against whichever page the tabs already fetched,
 * rather than teaching the server a filter used nowhere else.
 */
const STATUS_OPTIONS: Record<'ACTIVE' | 'HISTORY', { value: TicketStatus; label: string }[]> = {
  ACTIVE: [
    { value: 'PENDING_REC_MGR', label: 'Pending approval' },
    { value: 'OPEN', label: 'Open' },
    { value: 'ASSIGNED', label: 'Assigned' },
    { value: 'IN_PROGRESS', label: 'In progress' },
  ],
  HISTORY: [
    { value: 'RESOLVED', label: 'Resolved' },
    { value: 'CANCELLED', label: 'Cancelled' },
  ],
}

const TicketsPage: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAppSelector((state) => state.auth)
  const isAdmin = ['COMPANY_ADMIN', 'SUPER_ADMIN'].includes(user?.role || '');
  const [tickets, setTickets] = useState<any[]>([])
  /** Set when the list request failed, so the empty state does not speak for it. */
  const [loadError, setLoadError] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  /**
   * Selection is cleared whenever the list changes.
   *
   * Ticking rows then paging or searching would otherwise act on tickets that are no
   * longer visible, which is the one thing a bulk action must never do: nobody can
   * check what they are about to approve if it is not on screen.
   */
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'HISTORY'>('ACTIVE')

  // Filter/sort bar. Priority and department are sent to the server, same as search;
  // status is narrower than anything the server knows how to filter by (see
  // STATUS_OPTIONS above) and is applied to the page already on screen.
  const [priorityFilter, setPriorityFilter] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sortOption, setSortOption] = useState<keyof typeof SORT_OPTIONS>('newest')
  const [departments, setDepartments] = useState<any[]>([])

  // A specific status from one tab rarely means anything on the other: "Resolved"
  // is not a choice while looking at Active tickets. Switching tabs drops it rather
  // than silently filtering the new tab down to zero rows.
  useEffect(() => {
    setStatusFilter('')
  }, [activeTab])

  useEffect(() => {
    api
      .get('/departments')
      .then((res) => setDepartments(Array.isArray(res.data) ? res.data : res.data?.departments ?? []))
      .catch(() => toast.error('Failed to load departments'))
  }, [])

  // Confirmation dialog state
  const [actionModal, setActionModal] = useState<{
    isOpen: boolean;
    type: 'approve' | 'reject' | 'delete' | 'accept_invite' | 'decline_invite';
    title: string;
    description: string;
    targetId?: string;
    requireReason?: boolean;
    reasons?: string[];
  }>({
    isOpen: false,
    type: 'approve',
    title: '',
    description: '',
  })

  // Typing fired a request per character, and eight of them can come back in any
  // order, so the list could settle on the results for "campai". Waiting for a pause
  // sends one request for the word that was actually typed.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(id)
  }, [search])

  useEffect(() => {
    fetchData()
  }, [page, activeTab, debouncedSearch, priorityFilter, departmentFilter, sortOption])

  /**
   * Only the newest request may write to the list.
   *
   * Debouncing alone did not close the race. Typing also resets the page, and that
   * state change fires its own fetch immediately, 300ms ahead of the debounced one,
   * carrying the *previous* search term. Whichever answers last wins, so the list
   * could end up showing unfiltered results under a filled-in search box. Stamping
   * each request and ignoring stale answers is what actually fixes it; the debounce
   * just stops us making eight of them.
   */
  const requestId = useRef(0)

  const fetchData = async () => {
    const mine = ++requestId.current
    setIsLoading(true)
    setLoadError(false)
    try {
      const { sortBy, sortDir } = SORT_OPTIONS[sortOption]
      const ticketsRes = await api.get('/tickets', {
        params: {
          page,
          statusType: activeTab,
          search: debouncedSearch,
          limit: PAGE_SIZE,
          priority: priorityFilter || undefined,
          departmentId: departmentFilter || undefined,
          sortBy,
          sortDir,
        }
      })
      if (mine !== requestId.current) return
      setTickets(ticketsRes.data.tickets || [])
      setTotal(ticketsRes.data.total || 0)
      setSelected(new Set())
    } catch (error) {
      if (mine !== requestId.current) return
      // Recorded, because the empty state below blames the user's filters and offers
      // "New Request". Telling someone their filters match nothing, when the truth is
      // that the list never arrived, invites them to raise a duplicate.
      setLoadError(true)
      toast.error('Could not load tickets')
    } finally {
      if (mine === requestId.current) setIsLoading(false)
    }
  }

  const handleOpenDetail = (id: string) => {
    navigate(`/tickets/${id}`)
  }

  const handleCreateSuccess = () => {
    setPage(1)
    fetchData()
  }

  const handleConfirmAction = async (reason?: string) => {
    const { type, targetId } = actionModal
    setActionModal(p => ({ ...p, isOpen: false }))

    try {
      if (type === 'approve') {
        await api.patch(`/tickets/${targetId}/approve`)
        toast.success('Request approved')
      } else if (type === 'reject') {
        await api.patch(`/tickets/${targetId}/reject`, { reason })
        toast.success('Request declined')
      } else if (type === 'delete') {
        await api.delete(`/tickets/${targetId}`)
        toast.success('Ticket deleted')
      } else if (type === 'accept_invite') {
        await api.post(`/tickets/${targetId}/accept`)
        toast.success('You joined this ticket')
      } else if (type === 'decline_invite') {
        await api.post(`/tickets/${targetId}/decline`, { reason })
        toast.success('Invitation declined')
      }
      fetchData()
    } catch (error) {
      toast.error('Something went wrong. Please try again.')
    }
  }

  const promptAction = (e: React.MouseEvent, type: 'approve' | 'reject' | 'delete' | 'accept_invite' | 'decline_invite', id: string) => {
    e.stopPropagation()
    if (type === 'delete') {
      setActionModal({
        isOpen: true,
        type: 'delete',
        title: 'Delete this ticket?',
        description: 'The ticket and its whole history are removed permanently. This cannot be undone.',
        targetId: id
      })
    } else if (type === 'reject') {
      setActionModal({
        isOpen: true,
        type: 'reject',
        title: 'Decline this request?',
        description: 'The reason is shown to whoever raised it, so say what would change your mind.',
        targetId: id,
        requireReason: true,
        reasons: ['Not enough detail', 'No budget for it', 'Too much on right now', 'Wrong team', 'Already raised elsewhere']
      })
    } else if (type === 'approve') {
      setActionModal({
        isOpen: true,
        type: 'approve',
        title: 'Approve this request?',
        description: 'It moves on to be assigned and worked on.',
        targetId: id
      })
    } else if (type === 'accept_invite') {
      setActionModal({
        isOpen: true,
        type: 'accept_invite',
        title: 'Join this ticket?',
        description: 'You will be listed on it and can work on it with the others assigned.',
        targetId: id
      })
    } else if (type === 'decline_invite') {
      setActionModal({
        isOpen: true,
        type: 'decline_invite',
        title: 'Decline this invitation?',
        description: 'Whoever invited you sees the reason, so they know where to take it next.',
        targetId: id,
        requireReason: true,
        reasons: ['Too much on right now', 'Not my area', 'Clashes with something else', 'Reassigned elsewhere', 'Outside my department']
      })
    }
  }

  const getStatusBadge = (ticket: any) => {
    switch (ticket.status as TicketStatus) {
      case 'PENDING_REC_MGR': 
        return <span className="status-badge bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">Pending Approval</span>
      case 'OPEN': return <span className="status-badge bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">Open</span>
      case 'ASSIGNED': 
        const acceptedCount = ticket.assignments?.filter((a: any) => a.status === 'ACCEPTED').length || 0;
        return (
          <span className="status-badge bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">
            Assigned: {acceptedCount > 1 ? `${acceptedCount} people` : (ticket.assignee?.name || '1 person')}
          </span>
        )
      case 'RESOLVED': return <span className="status-badge bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">Resolved</span>
      case 'CANCELLED': return <span className="status-badge bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300">Cancelled</span>
      default: return null
    }
  }

  /**
   * The same test the per-row approve and decline buttons use.
   *
   * Gating on status alone offered a checkbox and an Approve bar to a requester whose
   * every id the server would refuse: a control that exists only to fail.
   */
  const canDecide = (t: any) =>
    t.status === 'PENDING_REC_MGR' &&
    (isAdmin || t.receiverManagerId === user?.id || t.receiverDept?.managerId === user?.id)

  /** The fetched page, narrowed by the Status dropdown. See STATUS_OPTIONS above. */
  const visibleTickets = statusFilter ? tickets.filter((t) => t.status === statusFilter) : tickets

  const decidable = visibleTickets.filter(canDecide)
  const selectedIds = [...selected].filter((id) => decidable.some((t) => t.id === id))

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const decide = async (action: 'approve' | 'reject') => {
    if (selectedIds.length === 0) return

    let reason: string | undefined
    if (action === 'reject') {
      const given = await promptDialog({
        title: `Decline ${selectedIds.length} ${selectedIds.length === 1 ? 'request' : 'requests'}?`,
        description: 'The same reason is sent to everyone who raised them, so keep it general.',
        inputLabel: 'Reason',
        placeholder: 'Why these cannot go ahead',
        confirmText: 'Decline them',
        variant: 'danger',
      })
      if (given === null) return
      reason = given
    } else if (!(await confirmDialog({
      title: `Approve ${selectedIds.length} ${selectedIds.length === 1 ? 'request' : 'requests'}?`,
      description: 'Each one moves on to be assigned and worked on.',
      confirmText: 'Approve them',
    }))) {
      return
    }

    setBulkBusy(true)
    try {
      const { data } = await api.post('/tickets/bulk/decide', { ids: selectedIds, action, reason })
      if (data?.done > 0) toast.success(`${data.done} updated`)

      // Named, not counted. Being allowed six of ten is normal, and a silent
      // difference between what was ticked and what changed is what people notice a
      // week later.
      const skipped: { title: string; reason: string }[] = data?.skipped ?? []
      if (skipped.length > 0) {
        toast(
          `${skipped.length} left unchanged: ` +
            skipped.slice(0, 2).map((x) => `${x.title} (${x.reason})`).join('; ') +
            (skipped.length > 2 ? `, and ${skipped.length - 2} more` : ''),
          { duration: 9000, icon: '⚠️' },
        )
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Could not update those tickets')
    } finally {
      setBulkBusy(false)
      // Always, including after a failure: some of the batch may already have gone
      // through, and leaving those on screen as pending invites approving them twice.
      fetchData()
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-6">
      {/*
        A plain page header, like every other page.

        This was a full-bleed gradient banner with two blurred decorative orbs, an
        eyebrow reading "Logistics Hub" and the subtitle "Universal Organizational
        Interaction Log · Real-time ticket tracking and tactical coordination". None
        of that says anything a person needs, it costs a third of the first screen
        before a single ticket appears, and it made this the only page in the app
        that announces itself in a different voice.
      */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Tickets</h1>
          <p className="page-subtitle">
            Requests between people and departments, and what has happened to each one.
          </p>
        </div>

        <button onClick={() => setShowCreateModal(true)} className="btn-primary">
          <PlusIcon className="mr-2 h-4 w-4" />
          New request
        </button>
      </div>

      {/* Pending Requests Section */}
      {tickets.some(t => t.assignments?.some((a: any) => a.userId === user?.id && a.status === 'PENDING')) && (
        <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 rounded-xl p-6 shadow-sm animate-in slide-in-from-top-4 duration-500">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            <h3 className="text-xs font-semibold text-amber-800 dark:text-amber-300 tracking-wide leading-none">Pending Requests</h3>
          </div>
          <div className="space-y-3">
            {tickets.filter(t => t.assignments?.some((a: any) => a.userId === user?.id && a.status === 'PENDING')).map(ticket => (
              <div key={ticket.id} className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-white dark:bg-gray-800 rounded-xl border border-amber-100 dark:border-amber-900/40 shadow-sm hover:border-amber-300 transition-all">
                <div className="flex items-center gap-4">
                   <div className="h-10 w-10 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                      <TicketIcon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                   </div>
                   <div className="min-w-0">
                      <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 tracking-tight mb-0.5">{ticket.ticketNumber}</p>
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white truncate max-w-md">{ticket.title}</h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-bold tracking-wide mt-1">Invited by {ticket.requester?.name}</p>
                   </div>
                </div>
                <div className="flex items-center gap-2">
                   <button 
                     onClick={(e) => { e.stopPropagation(); promptAction(e, 'accept_invite', ticket.id); }}
                     className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-semibold tracking-wide hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/25 flex items-center gap-2"
                   >
                     <CheckCircleIcon className="h-4 w-4" /> Access
                   </button>
                   <button 
                     onClick={(e) => { e.stopPropagation(); promptAction(e, 'decline_invite', ticket.id); }}
                     className="px-4 py-2 bg-white dark:bg-gray-800 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-900/40 rounded-lg text-xs font-semibold tracking-wide hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-all flex items-center gap-2"
                   >
                     <XCircleIcon className="h-4 w-4" /> Decline
                   </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl w-fit">
          <button
            onClick={() => { setActiveTab('ACTIVE'); setPage(1); }}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'ACTIVE' ? 'bg-white dark:bg-gray-800 text-primary-600 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            Active
          </button>
          <button
            onClick={() => { setActiveTab('HISTORY'); setPage(1); }}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'HISTORY' ? 'bg-white dark:bg-gray-800 text-primary-600 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            History
          </button>
        </div>

        <div className="relative w-full md:w-80">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <MagnifyingGlassIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Search by ID, department, or title..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-11 pr-4 py-2.5 w-full border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all shadow-sm placeholder:text-gray-400 text-sm"
          />
        </div>
      </div>

      {/* Filter / sort bar */}
      <div className="surface flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex-1 min-w-[10rem]">
          <label className="form-label" htmlFor="ticket-filter-priority">Priority</label>
          <Select
            id="ticket-filter-priority"
            value={priorityFilter}
            onChange={(e) => { setPriorityFilter(e.target.value); setPage(1) }}
            className="select-field w-full"
          >
            <option value="">All priorities</option>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </Select>
        </div>

        <div className="flex-1 min-w-[10rem]">
          <label className="form-label" htmlFor="ticket-filter-department">Department</label>
          <Select
            id="ticket-filter-department"
            value={departmentFilter}
            onChange={(e) => { setDepartmentFilter(e.target.value); setPage(1) }}
            className="select-field w-full"
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </Select>
        </div>

        <div className="flex-1 min-w-[10rem]">
          <label className="form-label" htmlFor="ticket-filter-status">Status</label>
          <Select
            id="ticket-filter-status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="select-field w-full"
          >
            <option value="">{activeTab === 'HISTORY' ? 'All closed' : 'All open'}</option>
            {STATUS_OPTIONS[activeTab].map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </Select>
        </div>

        <div className="flex-1 min-w-[10rem]">
          <label className="form-label" htmlFor="ticket-sort">Sort</label>
          <Select
            id="ticket-sort"
            value={sortOption}
            onChange={(e) => { setSortOption(e.target.value as keyof typeof SORT_OPTIONS); setPage(1) }}
            className="select-field w-full"
          >
            {Object.entries(SORT_OPTIONS).map(([key, opt]) => (
              <option key={key} value={key}>{opt.label}</option>
            ))}
          </Select>
        </div>
      </div>

      <div className="surface overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-gray-600 dark:text-gray-300">Loading tickets...</p>
          </div>
        ) : loadError ? (
          <div className="text-center py-16">
            <TicketIcon className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Tickets could not be loaded</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6">Nothing is wrong with your filters. Try again.</p>
            <button onClick={fetchData} className="btn-primary">Try again</button>
          </div>
        ) : visibleTickets.length === 0 ? (
          <div className="text-center py-16">
            <TicketIcon className="h-16 w-16 text-gray-200 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No tickets found</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6">No tickets match your current filters.</p>
            <button onClick={() => setShowCreateModal(true)} className="btn-primary">
              <PlusIcon className="h-4 w-4 mr-2" />
              New Request
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900/40">
                <tr>
                  {decidable.length > 0 && (
                    <th scope="col" className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label="Select every request awaiting approval"
                        checked={selectedIds.length > 0 && selectedIds.length === decidable.length}
                        onChange={() =>
                          setSelected(
                            selectedIds.length === decidable.length
                              ? new Set()
                              : new Set(decidable.map((t) => t.id)),
                          )
                        }
                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-900"
                      />
                    </th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">ID &amp; Title</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Route</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Requester</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700">
                {visibleTickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    onClick={() => handleOpenDetail(ticket.id)}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer group"
                  >
                    {decidable.length > 0 && (
                      <td className="w-10 px-4 py-4" onClick={(e) => e.stopPropagation()}>
                        {canDecide(ticket) && (
                          <input
                            type="checkbox"
                            aria-label={`Select ${ticket.ticketNumber}`}
                            checked={selected.has(ticket.id)}
                            onChange={() => toggle(ticket.id)}
                            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-900"
                          />
                        )}
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-primary-600 dark:text-primary-400 mb-0.5">{ticket.ticketNumber}</span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-primary-600 transition-colors truncate max-w-xs">{ticket.title}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {getStatusBadge(ticket)}
                        {ticket.isOverdue && (
                          <span className="status-badge bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                            Overdue
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {/*
                        This column is the ticket's routing, not a label, so it must not
                        guess. It used to read `|| 'General'` and `|| 'IT'`, which meant a
                        ticket with no receiving department was rendered as routed to a
                        department called IT: a specific, plausible, checkable claim that
                        the data does not support, in the one column people scan to find
                        out where a request went. TicketDetailPage renders the same field
                        with no default, so the two screens disagreed about the same
                        ticket.
                      */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-full">
                          {ticket.requester?.department?.name ?? 'No department'}
                        </span>
                        <ArrowRightIcon className="h-3 w-3 text-gray-500 dark:text-gray-400" />
                        <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 px-2.5 py-1 rounded-full">
                          {ticket.receiverDept?.name ?? 'Unrouted'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden border border-gray-200 dark:border-gray-700 flex-shrink-0">
                          {ticket.requester?.avatar ? (
                            <img src={formatAssetUrl(ticket.requester.avatar)} className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{ticket.requester?.name?.charAt(0)}</span>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{ticket.requester?.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{ticket.requester?.department?.name || 'No dept'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex justify-end gap-1">
                        {isAdmin && (
                          <button
                            onClick={(e) => promptAction(e, 'delete', ticket.id)}
                            className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition-colors"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        )}
                        {((ticket.status === 'PENDING_REC_MGR' && (ticket.receiverManagerId === user?.id || ticket.receiverDept?.managerId === user?.id)) ||
                          isAdmin) &&
                          ticket.status === 'PENDING_REC_MGR' && (
                          <>
                            <button onClick={(e) => promptAction(e, 'approve', ticket.id)} className="p-1.5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-lg transition-colors"><CheckCircleIcon className="h-4 w-4" /></button>
                            <button onClick={(e) => promptAction(e, 'reject', ticket.id)} className="p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition-colors"><XCircleIcon className="h-4 w-4" /></button>
                          </>
                        )}
                        <button aria-label="View conversation" className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 dark:text-gray-400 dark:hover:bg-primary-900/30 rounded-lg transition-colors"><ChatBubbleLeftRightIcon className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer / Pagination */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-900/40">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Showing <span className="font-semibold text-gray-700 dark:text-gray-200">{visibleTickets.length}</span> of <span className="font-semibold text-gray-700 dark:text-gray-200">{total}</span> tickets
          </p>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200 px-2">{page} / {totalPages || 1}</span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div
          role="region"
          aria-label="Selected requests"
          className="sticky bottom-4 z-30 mx-auto flex w-fit max-w-full flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-lg dark:border-gray-700 dark:bg-gray-800"
        >
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            {selectedIds.length} selected
          </span>
          <span className="hidden h-5 w-px bg-gray-200 sm:block dark:bg-gray-700" aria-hidden="true" />
          <button onClick={() => decide('approve')} disabled={bulkBusy} className="btn-primary">
            <CheckCircleIcon className="mr-2 h-4 w-4" />
            Approve
          </button>
          <button
            onClick={() => decide('reject')}
            disabled={bulkBusy}
            className="btn-secondary text-red-600 hover:text-red-700 dark:text-red-400"
          >
            <XCircleIcon className="mr-2 h-4 w-4" />
            Decline
          </button>
          <button
            onClick={() => setSelected(new Set())}
            aria-label="Clear selection"
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
      )}

      <CreateTicketModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={handleCreateSuccess}
      />

      <ActionModal
        isOpen={actionModal.isOpen}
        onClose={() => setActionModal(p => ({ ...p, isOpen: false }))}
        onConfirm={handleConfirmAction}
        title={actionModal.title}
        description={actionModal.description}
        variant={actionModal.type === 'delete' ? 'danger' : actionModal.type === 'reject' ? 'warning' : 'success'}
        requireReason={actionModal.requireReason}
        reasons={actionModal.reasons}
      />
    </div>
  )
}

export default TicketsPage
