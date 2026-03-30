import React, { useState, useEffect } from 'react'
import { 
  PlusIcon, 
  TicketIcon, 
  CheckCircleIcon, 
  XCircleIcon, 
  ChatBubbleLeftRightIcon,
  ArrowRightIcon,
  TrashIcon,
  MagnifyingGlassIcon
} from '@heroicons/react/24/outline'
import api, { formatAssetUrl } from '@/services/api'
import { useAppSelector } from '@/hooks/redux'
import { toast } from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import ActionModal from '@/components/ui/ActionModal'
import CreateTicketModal from '@/components/tickets/CreateTicketModal'

type TicketStatus = 'PENDING_REQ_MGR' | 'PENDING_REC_MGR' | 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED' | 'CANCELLED'

const TicketsPage: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAppSelector((state) => state.auth)
  const isAdmin = ['COMPANY_ADMIN', 'SUPER_ADMIN'].includes(user?.role || '');
  const [tickets, setTickets] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'HISTORY'>('ACTIVE')
  
  // Tactical Modal States
  const [actionModal, setActionModal] = useState<{
    isOpen: boolean;
    type: 'approve' | 'reject' | 'delete';
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

  useEffect(() => {
    fetchData()
  }, [page, activeTab, search])

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const ticketsRes = await api.get('/tickets', { 
        params: { 
          page, 
          statusType: activeTab,
          search 
        } 
      })
      setTickets(ticketsRes.data.tickets || [])
      setTotal(ticketsRes.data.total || 0)
    } catch (error) {
      toast.error('Failed to fetch tickets')
    } finally {
      setIsLoading(false)
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
        toast.success('Interaction Authorized')
      } else if (type === 'reject') {
        await api.patch(`/tickets/${targetId}/reject`, { reason })
        toast.error('Interaction Terminated')
      } else if (type === 'delete') {
        await api.delete(`/tickets/${targetId}`)
        toast.success('Record Pruned')
      }
      fetchData()
    } catch (error) {
      toast.error('Operational synchronization failed')
    }
  }

  const promptAction = (e: React.MouseEvent, type: 'approve' | 'reject' | 'delete', id: string) => {
    e.stopPropagation()
    if (type === 'delete') {
      setActionModal({
        isOpen: true,
        type: 'delete',
        title: 'Strategic Deletion',
        description: 'Permanently remove this engagement record from all operational logs?',
        targetId: id
      })
    } else if (type === 'reject') {
      setActionModal({
        isOpen: true,
        type: 'reject',
        title: 'Tactical Rejection',
        description: 'Identify the operational reason for terminating this request flow.',
        targetId: id,
        requireReason: true,
        reasons: ['Incomplete Specifications', 'Budgetary Constraints', 'Personnel Overload', 'Incorrect Target', 'Duplicate Interaction']
      })
    } else if (type === 'approve') {
      setActionModal({
        isOpen: true,
        type: 'approve',
        title: 'Operational Authorization',
        description: 'Authorize this engagement stage and proceed to the next industrial phase?',
        targetId: id
      })
    }
  }

  const getStatusBadge = (ticket: any) => {
    switch (ticket.status as TicketStatus) {
      case 'PENDING_REQ_MGR': 
        return <span className="px-3 py-1 bg-amber-50 text-amber-700 rounded-lg text-[9px] font-black uppercase tracking-[0.1em] border border-amber-100 italic">Awaiting Alignment: {ticket.requesterManager?.name || 'Manager'}</span>
      case 'PENDING_REC_MGR': 
        return <span className="px-3 py-1 bg-orange-50 text-orange-700 rounded-lg text-[9px] font-black uppercase tracking-[0.1em] border border-orange-100 italic">Awaiting Priority: {ticket.receiverManager?.name || ticket.receiverDept?.manager?.name || 'Dept. Manager'}</span>
      case 'OPEN': return <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-lg text-[9px] font-black uppercase tracking-[0.1em] border border-blue-100">Log Open</span>
      case 'ASSIGNED': return <span className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-[9px] font-black uppercase tracking-[0.1em] border border-indigo-100">Task Assigned</span>
      case 'IN_PROGRESS': return <span className="px-3 py-1 bg-purple-50 text-purple-700 rounded-lg text-[9px] font-black uppercase tracking-[0.1em] border border-purple-100">Processing</span>
      case 'RESOLVED': return <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-[9px] font-black uppercase tracking-[0.1em] border border-emerald-100">Task Finalized</span>
      case 'CANCELLED': return <span className="px-3 py-1 bg-rose-50 text-rose-700 rounded-lg text-[9px] font-black uppercase tracking-[0.1em] border border-rose-100">Entry Denied</span>
      default: return null
    }
  }

  const totalPages = Math.ceil(total / 10)

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-20">
      {/* Strategic Header (Aligned with Strategic Hub) */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-xl p-8 text-white shadow-sm border border-primary-500/20 relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2 font-bold text-primary-100 uppercase tracking-widest text-[10px]">
              <TicketIcon className="h-4 w-4" />
              Logistics Hub
            </div>
            <h1 className="text-3xl font-black mb-1 leading-tight font-outfit uppercase tracking-tight">Logistics & Requests</h1>
            <p className="text-primary-50 font-medium max-w-lg opacity-90">Universal Organizational Interaction Log · Real-time mission tracking and tactical coordination.</p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowCreateModal(true)} 
              className="flex items-center gap-2 px-6 py-3 bg-white text-primary-700 rounded-lg font-black text-[11px] uppercase tracking-widest hover:bg-primary-50 active:scale-95 transition-all shadow-sm"
            >
              <PlusIcon className="h-4 w-4" />
              Initiate Request
            </button>
          </div>
        </div>
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-20 -mt-20 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full -ml-16 -mb-16 blur-2xl pointer-events-none" />
      </div>

      {/* Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl w-fit">
          <button
            onClick={() => { setActiveTab('ACTIVE'); setPage(1); }}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'ACTIVE' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Active
          </button>
          <button
            onClick={() => { setActiveTab('HISTORY'); setPage(1); }}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'HISTORY' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            History
          </button>
        </div>

        <div className="relative w-full md:w-80">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Search by ID, department, or title..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-11 pr-4 py-2.5 w-full border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm placeholder:text-gray-400 text-sm"
          />
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-gray-600">Loading tickets...</p>
          </div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-16">
            <TicketIcon className="h-16 w-16 text-gray-200 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No tickets found</h3>
            <p className="text-gray-500 mb-6">No tickets match your current filters.</p>
            <button onClick={() => setShowCreateModal(true)} className="btn-primary">
              <PlusIcon className="h-4 w-4 mr-2" />
              New Request
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">ID &amp; Title</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Route</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Requester</th>
                  <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {tickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    onClick={() => handleOpenDetail(ticket.id)}
                    className="hover:bg-gray-50 transition-colors cursor-pointer group"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-primary-600 mb-0.5">{ticket.ticketNumber}</span>
                        <span className="text-sm font-semibold text-gray-900 group-hover:text-primary-600 transition-colors truncate max-w-xs">{ticket.title}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(ticket)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full">
                          {ticket.requester?.department?.name || 'General'}
                        </span>
                        <ArrowRightIcon className="h-3 w-3 text-gray-400" />
                        <span className="text-xs font-medium text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-full">
                          {ticket.receiverDept?.name || 'IT'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-200 flex-shrink-0">
                          {ticket.requester?.avatar ? (
                            <img src={formatAssetUrl(ticket.requester.avatar)} className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-xs font-semibold text-gray-500">{ticket.requester?.name?.charAt(0)}</span>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{ticket.requester?.name}</p>
                          <p className="text-xs text-gray-500">{ticket.requester?.department?.name || 'No dept'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex justify-end gap-1">
                        {isAdmin && (
                          <button
                            onClick={(e) => promptAction(e, 'delete', ticket.id)}
                            className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        )}
                        {(((ticket.status === 'PENDING_REQ_MGR' && (ticket.requesterManagerId === user?.id || ticket.requesterDept?.managerId === user?.id)) ||
                          (ticket.status === 'PENDING_REC_MGR' && (ticket.receiverManagerId === user?.id || ticket.receiverDept?.managerId === user?.id))) ||
                          isAdmin) &&
                          (ticket.status === 'PENDING_REQ_MGR' || ticket.status === 'PENDING_REC_MGR') && (
                          <>
                            <button onClick={(e) => promptAction(e, 'approve', ticket.id)} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"><CheckCircleIcon className="h-4 w-4" /></button>
                            <button onClick={(e) => promptAction(e, 'reject', ticket.id)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"><XCircleIcon className="h-4 w-4" /></button>
                          </>
                        )}
                        <button className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"><ChatBubbleLeftRightIcon className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer / Pagination */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-gray-50">
          <p className="text-sm text-gray-500">
            Showing <span className="font-semibold text-gray-700">{tickets.length}</span> of <span className="font-semibold text-gray-700">{total}</span> tickets
          </p>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <span className="text-sm font-medium text-gray-700 px-2">{page} / {totalPages || 1}</span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </div>

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
