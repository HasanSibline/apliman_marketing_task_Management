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
  const [priority, setPriority] = useState('MEDIUM')
  const [isSubmitting, setIsSubmitting] = useState(false)

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
        priority
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
    setPriority('MEDIUM')
  }

  const priorityOptions = [
    { id: 'LOW', label: 'Low', color: 'bg-slate-100 text-slate-600 border-slate-200' },
    { id: 'MEDIUM', label: 'Medium', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    { id: 'HIGH', label: 'High', color: 'bg-amber-100 text-amber-700 border-amber-200' },
    { id: 'URGENT', label: 'Urgent', color: 'bg-rose-100 text-rose-700 border-rose-200' }
  ]

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
              {/* Target Dept */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Target Department *
                </label>
                <select
                  value={receiverDeptId}
                  onChange={(e) => setReceiverDeptId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">Choose a department...</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>{dept.name}</option>
                  ))}
                </select>
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                />
              </div>

              {/* Priority */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Request Priority
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {priorityOptions.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setPriority(opt.id)}
                      className={`py-2 px-2 rounded-md text-xs font-semibold border transition-all ${
                        priority === opt.id 
                          ? `${opt.color} border-transparent ring-2 ring-offset-1 ring-primary-500` 
                          : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
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
