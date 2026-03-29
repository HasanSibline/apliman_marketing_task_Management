import React, { useState, useEffect } from 'react'
import { 
  PlusIcon, 
  TicketIcon, 
  CheckCircleIcon, 
  XCircleIcon, 
  ChatBubbleLeftRightIcon,
  ArrowRightIcon,
  MagnifyingGlassIcon
} from '@heroicons/react/24/outline'
import api from '@/services/api'
import { useAppSelector } from '@/hooks/redux'
import { toast } from 'react-hot-toast'
import CreateTicketModal from '@/components/tickets/CreateTicketModal'
import TicketDetailModal from '@/components/tickets/TicketDetailModal'

type TicketStatus = 'PENDING_REQ_MGR' | 'PENDING_REC_MGR' | 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'REJECTED'

const TicketsPage: React.FC = () => {
  const { user } = useAppSelector((state) => state.auth)
  const [tickets, setTickets] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'HISTORY'>('ACTIVE')
  
  // Detail Modal State
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)

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
    setSelectedTicketId(id)
    setShowDetailModal(true)
  }

  const handleCreateSuccess = () => {
    setPage(1)
    fetchData()
  }

  const handleApprove = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    try {
      await api.patch(`/tickets/${id}/approve`)
      toast.success('Ticket approved')
      fetchData()
    } catch (error) {
      toast.error('Failed to approve ticket')
    }
  }

  const handleReject = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const reason = prompt('Reason for rejection:')
    if (reason === null) return
    try {
      await api.patch(`/tickets/${id}/reject`, { reason })
      toast.error('Ticket rejected')
      fetchData()
    } catch (error) {
      toast.error('Failed to reject ticket')
    }
  }

  const getStatusBadge = (status: TicketStatus) => {
    switch (status) {
      case 'PENDING_REQ_MGR': return <span className="px-2 py-0.5 bg-yellow-100/80 text-yellow-700 rounded-full text-[10px] font-bold uppercase tracking-wider">Pending Req Manager</span>
      case 'PENDING_REC_MGR': return <span className="px-2 py-0.5 bg-orange-100/80 text-orange-700 rounded-full text-[10px] font-bold uppercase tracking-wider">Pending Rec Manager</span>
      case 'OPEN': return <span className="px-2 py-0.5 bg-blue-100/80 text-blue-700 rounded-full text-[10px] font-bold uppercase tracking-wider border border-blue-200">Open</span>
      case 'IN_PROGRESS': return <span className="px-2 py-0.5 bg-indigo-100/80 text-indigo-700 rounded-full text-[10px] font-bold uppercase tracking-wider">Assigned</span>
      case 'RESOLVED': return <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold uppercase tracking-wider border border-emerald-200">Resolved</span>
      case 'REJECTED': return <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded-full text-[10px] font-bold uppercase tracking-wider border border-rose-200">Rejected</span>
      default: return null
    }
  }

  const totalPages = Math.ceil(total / 10)

  return (
    <div className="space-y-6 pb-20">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Organization Tickets</h1>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mt-1">Universal across-department requests</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="btn-primary py-2.5 px-6 shadow-xl shadow-primary-500/10">
          <PlusIcon className="h-4 w-4 mr-2" />
          Create Ticket
        </button>
      </div>

      {/* Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-2 p-1 bg-gray-100 rounded-2xl w-fit">
          <button 
            onClick={() => { setActiveTab('ACTIVE'); setPage(1); }}
            className={`px-6 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'ACTIVE' ? 'bg-white shadow-sm text-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Active Work
          </button>
          <button 
            onClick={() => { setActiveTab('HISTORY'); setPage(1); }}
            className={`px-6 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'HISTORY' ? 'bg-white shadow-sm text-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Ticket History
          </button>
        </div>

        <div className="relative w-full md:w-96">
          <input 
            type="text"
            placeholder="Search by ID, Title, or Dept..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-4 focus:ring-primary-500/5 transition-all font-medium"
          />
          <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden min-h-[400px]">
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
                      {getStatusBadge(ticket.status)}
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-gray-600 bg-gray-100 px-2 py-1 rounded">{ticket.requesterDept?.name || ticket.requester?.department?.name}</span>
                        <ArrowRightIcon className="h-3 w-3 text-gray-300" />
                        <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded border border-indigo-100">{ticket.receiverDept?.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <p className="text-xs font-bold text-gray-900">{ticket.requester?.name}</p>
                      <p className="text-[10px] text-gray-400 font-bold uppercase">Requester</p>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap text-right">
                      <div className="flex justify-end space-x-1">
                        {(((ticket.status === 'PENDING_REQ_MGR' && (ticket.requesterManagerId === user?.id || ticket.requesterDept?.managerId === user?.id)) || 
                          (ticket.status === 'PENDING_REC_MGR' && (ticket.receiverManagerId === user?.id || ticket.receiverDept?.managerId === user?.id))) ||
                          (['COMPANY_ADMIN', 'SUPER_ADMIN'].includes(user?.role || ''))) && 
                          (ticket.status === 'PENDING_REQ_MGR' || ticket.status === 'PENDING_REC_MGR') && (
                          <>
                            <button onClick={(e) => handleApprove(e, ticket.id)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl"><CheckCircleIcon className="h-5 w-5" /></button>
                            <button onClick={(e) => handleReject(e, ticket.id)} className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl"><XCircleIcon className="h-5 w-5" /></button>
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

      {selectedTicketId && (
        <TicketDetailModal
          isOpen={showDetailModal}
          onClose={() => {
            setShowDetailModal(false)
            setSelectedTicketId(null)
          }}
          ticketId={selectedTicketId}
          onUpdate={fetchData}
        />
      )}
    </div>
  )
}

export default TicketsPage
