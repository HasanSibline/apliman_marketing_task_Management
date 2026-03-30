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
import api from '@/services/api'
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
    <div className="space-y-6 pb-20">
      {/* Strategic Header */}
      <div className="flex justify-between items-center bg-white p-8 rounded-2xl border border-gray-100">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight font-outfit uppercase">Logistics & Requests</h1>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mt-2 italic underline decoration-gray-50">Universal Organizational Interaction Log</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="px-8 py-3.5 bg-primary-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary-700 transition-all flex items-center gap-2">
          <PlusIcon className="h-4 w-4" />
          Initiate Request
        </button>
      </div>

      {/* Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-2 p-1 bg-gray-50 border border-gray-100 rounded-2xl w-fit">
          <button 
            onClick={() => { setActiveTab('ACTIVE'); setPage(1); }}
            className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'ACTIVE' ? 'bg-white text-primary-600 border border-gray-100' : 'text-gray-400 hover:text-gray-600'}`}
          >
            Active Tickets
          </button>
          <button 
            onClick={() => { setActiveTab('HISTORY'); setPage(1); }}
            className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'HISTORY' ? 'bg-white text-primary-600 border border-gray-100' : 'text-gray-400 hover:text-gray-600'}`}
          >
            History Tickets
          </button>
        </div>

        <div className="relative w-full md:w-[400px]">
          <input 
            type="text"
            placeholder="FILTER LOGS BY ID / DEPT / TITLE..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-12 pr-4 py-4 bg-white border border-gray-100 rounded-2xl text-[11px] font-black uppercase tracking-widest focus:outline-none focus:border-primary-500 transition-all placeholder:text-gray-300"
          />
          <MagnifyingGlassIcon className="h-5 w-5 absolute left-4 top-1/2 -translate-y-1/2 text-primary-600" />
        </div>
      </div>

      <div className="bg-white rounded-[2rem] border border-gray-100 overflow-hidden min-h-[400px] shadow-none">
        {isLoading ? (
          <div className="p-20 text-center">
            <div className="animate-spin inline-block w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full mb-4"></div>
            <p className="text-gray-400 italic text-sm">Processing records...</p>
          </div>
        ) : tickets.length === 0 ? (
          <div className="p-20 text-center">
            <TicketIcon className="h-16 w-16 text-gray-100 mx-auto mb-4" />
            <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">No records found</p>
            <p className="text-sm text-gray-500 mt-2 px-12">We couldn't find any tickets matching your access or search criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-50">
              <thead className="bg-gray-50/30">
                <tr>
                  <th className="px-6 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">ID & Title</th>
                  <th className="px-6 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Stage</th>
                  <th className="px-6 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Path</th>
                  <th className="px-6 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Requester</th>
                  <th className="px-6 py-5 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-50 text-gray-700">
                {tickets.map((ticket) => (
                  <tr 
                    key={ticket.id} 
                    onClick={() => handleOpenDetail(ticket.id)}
                    className="hover:bg-gray-50/50 transition-all cursor-pointer group"
                  >
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-primary-600 tracking-tighter mb-0.5">{ticket.ticketNumber}</span>
                        <span className="text-sm font-black text-gray-900 group-hover:text-primary-600 transition-colors uppercase tracking-tight truncate max-w-xs">{ticket.title}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      {getStatusBadge(ticket)}
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-gray-600 bg-gray-100 px-2.5 py-1 rounded-xl border border-gray-100 uppercase tracking-tighter">
                          {ticket.requester?.department?.name || 'General'}
                        </span>
                        <ArrowRightIcon className="h-3.5 w-3.5 text-gray-300" />
                        <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-xl border border-indigo-100 uppercase tracking-tighter shadow-sm">
                          {ticket.receiverDept?.name || 'IT'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <p className="text-xs font-bold text-gray-900">{ticket.requester?.name}</p>
                      <p className="text-[10px] text-gray-400 font-bold uppercase">Requester</p>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap text-right">
                      <div className="flex justify-end space-x-1">
                        {isAdmin && (
                          <button 
                            onClick={(e) => promptAction(e, 'delete', ticket.id)}
                            className="p-2 text-rose-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                          >
                            <TrashIcon className="h-5 w-5" />
                          </button>
                        )}
                        {(((ticket.status === 'PENDING_REQ_MGR' && (ticket.requesterManagerId === user?.id || ticket.requesterDept?.managerId === user?.id)) || 
                          (ticket.status === 'PENDING_REC_MGR' && (ticket.receiverManagerId === user?.id || ticket.receiverDept?.managerId === user?.id))) ||
                          isAdmin) && 
                          (ticket.status === 'PENDING_REQ_MGR' || ticket.status === 'PENDING_REC_MGR') && (
                          <>
                            <button onClick={(e) => promptAction(e, 'approve', ticket.id)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl"><CheckCircleIcon className="h-5 w-5" /></button>
                            <button onClick={(e) => promptAction(e, 'reject', ticket.id)} className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl"><XCircleIcon className="h-5 w-5" /></button>
                          </>
                        )}
                        <button className="p-2 text-gray-400 hover:text-primary-600"><ChatBubbleLeftRightIcon className="h-5 w-5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between">
           <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest italic">
             Viewing {tickets.length} of {total} total records
           </p>
           <div className="flex items-center space-x-2">
              <button 
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 transition-all shadow-sm"
              >
                Previous
              </button>
              <div className="px-4 py-2 rounded-xl bg-white border border-gray-200 text-[10px] font-black text-primary-600">
                {page} / {totalPages || 1}
              </div>
              <button 
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 transition-all shadow-sm"
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
