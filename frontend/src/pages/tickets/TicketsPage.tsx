import React, { useState, useEffect } from 'react'
import { 
  PlusIcon, 
  TicketIcon, 
  CheckCircleIcon, 
  XCircleIcon, 
  ChatBubbleLeftRightIcon,
  ArrowRightIcon
} from '@heroicons/react/24/outline'
import api from '@/services/api'
import { useAppSelector } from '@/hooks/redux'
import { toast } from 'react-hot-toast'
import CreateTicketModal from '@/components/tickets/CreateTicketModal'

type TicketStatus = 'PENDING_REQ_MGR' | 'PENDING_REC_MGR' | 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'REJECTED'

const TicketsPage: React.FC = () => {
  const { user } = useAppSelector((state) => state.auth)
  const [tickets, setTickets] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const ticketsRes = await api.get('/tickets')
      setTickets(ticketsRes.data)
    } catch (error) {
      toast.error('Failed to fetch tickets')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateSuccess = () => {
    fetchData()
  }

  const handleApprove = async (id: string) => {
    try {
      await api.patch(`/tickets/${id}/approve`)
      toast.success('Ticket approved')
      fetchData()
    } catch (error) {
      toast.error('Failed to approve ticket')
    }
  }

  const handleReject = async (id: string) => {
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
      case 'PENDING_REQ_MGR': return <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">Pending Req Manager</span>
      case 'PENDING_REC_MGR': return <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">Pending Rec Manager</span>
      case 'OPEN': return <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">Open</span>
      case 'IN_PROGRESS': return <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium">In Progress</span>
      case 'RESOLVED': return <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">Resolved</span>
      case 'REJECTED': return <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">Rejected</span>
      default: return null
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inter-departmental Tickets</h1>
          <p className="text-gray-600 mt-1">Submit and track requests between departments</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="btn-primary">
          <PlusIcon className="h-4 w-4 mr-2" />
          New Ticket
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center">
            <div className="animate-spin inline-block w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full mb-4"></div>
            <p className="text-gray-500">Loading tickets...</p>
          </div>
        ) : tickets.length === 0 ? (
          <div className="p-12 text-center">
            <TicketIcon className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">No tickets found</p>
            <p className="text-sm text-gray-400 mt-1">Tickets you create or need to approve will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ticket</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Departments</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Requester</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {tickets.map((ticket) => (
                  <tr key={ticket.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-primary-600">{ticket.ticketNumber}</span>
                        <span className="text-sm font-medium text-gray-900 truncate max-w-xs">{ticket.title}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(ticket.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex items-center space-x-1">
                        <span>{ticket.requesterDept?.name}</span>
                        <ArrowRightIcon className="h-3 w-3 text-gray-400" />
                        <span>{ticket.receiverDept?.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {ticket.requester?.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-2">
                        {/* Approval buttons for managers */}
                        {((ticket.status === 'PENDING_REQ_MGR' && ticket.requesterDept?.managerId === user?.id) || 
                          (ticket.status === 'PENDING_REC_MGR' && ticket.receiverDept?.managerId === user?.id)) && (
                          <>
                            <button 
                              onClick={() => handleApprove(ticket.id)}
                              className="p-1 text-green-600 hover:bg-green-50 rounded"
                              title="Approve"
                            >
                              <CheckCircleIcon className="h-5 w-5" />
                            </button>
                            <button 
                              onClick={() => handleReject(ticket.id)}
                              className="p-1 text-red-600 hover:bg-red-50 rounded"
                              title="Reject"
                            >
                              <XCircleIcon className="h-5 w-5" />
                            </button>
                          </>
                        )}
                        <button className="p-1 text-gray-400 hover:text-primary-600">
                          <ChatBubbleLeftRightIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Ticket Modal */}
      <CreateTicketModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={handleCreateSuccess}
      />
    </div>
  )
}

export default TicketsPage
