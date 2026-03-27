import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
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

type TicketStatus = 'PENDING_REQ_MGR' | 'PENDING_REC_MGR' | 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'REJECTED'

const TicketsPage: React.FC = () => {
  const { user } = useAppSelector((state) => state.auth)
  const [tickets, setTickets] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  
  // Create ticket state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [receiverDeptId, setReceiverDeptId] = useState('')
  const [priority, setPriority] = useState('MEDIUM')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const [ticketsRes, deptsRes] = await Promise.all([
        api.get('/tickets'),
        api.get('/departments')
      ])
      setTickets(ticketsRes.data)
      setDepartments(deptsRes.data)
    } catch (error) {
      toast.error('Failed to fetch tickets')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!title || !receiverDeptId) {
      toast.error('Please fill all required fields')
      return
    }
    try {
      await api.post('/tickets', {
        title,
        description,
        receiverDeptId,
        priority
      })
      toast.success('Ticket submitted for approval')
      setShowCreateModal(false)
      setTitle('')
      setDescription('')
      setReceiverDeptId('')
      fetchData()
    } catch (error) {
      toast.error('Failed to create ticket')
    }
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

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg"
          >
            <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
              <PlusIcon className="h-6 w-6 mr-2 text-primary-600" />
              Create Cross-Department Ticket
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Target Department</label>
                <select 
                  className="input"
                  value={receiverDeptId}
                  onChange={(e) => setReceiverDeptId(e.target.value)}
                >
                  <option value="">Select Department</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Ticket Title</label>
                <input 
                  type="text" 
                  className="input" 
                  placeholder="What do you need help with?"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Description</label>
                <textarea 
                  className="input min-h-[100px]" 
                  placeholder="Provide details about your request..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                ></textarea>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Priority</label>
                <div className="flex space-x-2">
                  {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map(p => (
                    <button
                      key={p}
                      onClick={() => setPriority(p)}
                      className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors ${
                        priority === p ? 'bg-primary-600 border-primary-600 text-white' : 'border-gray-200 text-gray-500 hover:border-primary-400'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-8 flex justify-end space-x-3">
              <button onClick={() => setShowCreateModal(false)} className="px-6 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-xl transition-colors">Cancel</button>
              <button 
                onClick={handleCreate}
                className="btn-primary px-8"
              >
                Submit Ticket
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}

export default TicketsPage
