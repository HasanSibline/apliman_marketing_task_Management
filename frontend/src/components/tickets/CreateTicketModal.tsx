import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  XMarkIcon 
} from '@heroicons/react/24/outline'
import api from '@/services/api'
import { toast } from 'react-hot-toast'

interface CreateTicketModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

const CreateTicketModal: React.FC<CreateTicketModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [departments, setDepartments] = useState<any[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [receiverDeptId, setReceiverDeptId] = useState('')
  const [type, setType] = useState('GENERAL')
  const [priority, setPriority] = useState('MEDIUM')
  const [deadline, setDeadline] = useState('')
  const [amount, setAmount] = useState('')
  const [providerName, setProviderName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const ticketTypes = [
    { id: 'GENERAL', label: 'General Request' },
    { id: 'PURCHASE_ORDER', label: 'Purchase Order (PO)' },
    { id: 'IT_SUPPORT', label: 'IT Support' },
    { id: 'DESIGN_REQUEST', label: 'Design Request' },
    { id: 'LEGAL_CONTRACT', label: 'Legal/Contract' },
    { id: 'MARKETING_ASSET', label: 'Marketing Asset' }
  ]

  useEffect(() => {
    if (isOpen) {
      fetchDepartments()
    }
  }, [isOpen])

  const fetchDepartments = async () => {
    try {
      const res = await api.get('/departments')
      setDepartments(res.data)
    } catch (error) {
      toast.error('Failed to load departments')
    }
  }

  const handleSubmit = async () => {
    if (!title || !receiverDeptId) {
      toast.error('Please fill all required fields')
      return
    }

    setIsSubmitting(true)
    try {
      await api.post('/tickets', {
        title,
        description,
        receiverDeptId,
        type,
        priority,
        deadline: deadline || undefined,
        amount: amount ? parseFloat(amount) : undefined,
        providerName: providerName || undefined
      })
      toast.success('Ticket submitted successfully')
      resetForm()
      onSuccess()
      onClose()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to create ticket')
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetForm = () => {
    setTitle('')
    setDescription('')
    setReceiverDeptId('')
    setType('GENERAL')
    setPriority('MEDIUM')
    setDeadline('')
    setAmount('')
    setProviderName('')
  }



  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/50"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full max-w-lg bg-white rounded-lg shadow-xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Create Cross-Dept Ticket</h2>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            {/* Form */}
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                {/* Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ticket Type *
                  </label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {ticketTypes.map((t) => (
                      <option key={t.id} value={t.id}>{t.label}</option>
                    ))}
                  </select>
                </div>

                {/* Target Dept */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Target Department *
                  </label>
                  <select
                    value={receiverDeptId}
                    onChange={(e) => setReceiverDeptId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 font-medium"
                  >
                    <option value="">Choose a department...</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>{dept.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ticket Title *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Need assistance with server migration"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              {/* PO Specific Fields */}
              {type === 'PURCHASE_ORDER' && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="grid grid-cols-2 gap-4"
                >
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Provider Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Amazon Web Services"
                      value={providerName}
                      onChange={(e) => setProviderName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
                    <input
                      type="number"
                      placeholder="e.g. 1500.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none"
                    />
                  </div>
                </motion.div>
              )}

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description Details
                </label>
                <textarea
                  placeholder="Describe what help you need from the other department..."
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none font-medium text-gray-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Deadline */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Deadline (SLA)
                  </label>
                  <input
                    type="date"
                    value={deadline}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none"
                  />
                </div>

                {/* Priority */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Priority
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                className="btn-secondary"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                className="btn-primary"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

export default CreateTicketModal
