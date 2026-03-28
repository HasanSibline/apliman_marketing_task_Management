import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  PlusIcon, 
  XMarkIcon, 
  PaperAirplaneIcon,
  TagIcon,
  ChatBubbleBottomCenterTextIcon,
  BuildingOfficeIcon,
  FlagIcon
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

          {/* Modal Content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden border border-gray-200"
          >
            {/* Header */}
            <div className="p-8 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-primary-600 rounded-xl shadow-lg shadow-primary-200">
                    <PaperAirplaneIcon className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900">Create Cross-Dept Ticket</h3>
                    <p className="text-sm text-gray-500 mt-1">Submit a formal request to another team</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 group"
                >
                  <XMarkIcon className="h-6 w-6 group-hover:text-gray-600" />
                </button>
              </div>
            </div>

            {/* Form */}
            <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
              {/* Target Dept */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
                  <BuildingOfficeIcon className="h-4 w-4 text-primary-600" />
                  Target Department <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={receiverDeptId}
                    onChange={(e) => setReceiverDeptId(e.target.value)}
                    className="w-full pl-4 pr-10 py-3.5 bg-gray-50 border-2 border-gray-100 rounded-xl focus:ring-4 focus:ring-primary-600/10 focus:border-primary-600 focus:bg-white transition-all appearance-none text-gray-900 font-medium"
                  >
                    <option value="">Choose a department...</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>{dept.name}</option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                    <TagIcon className="h-5 w-5" />
                  </div>
                </div>
              </div>

              {/* Title */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
                  <TagIcon className="h-4 w-4 text-primary-600" />
                  Ticket Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Need assistance with server migration"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-3.5 bg-gray-50 border-2 border-gray-100 rounded-xl focus:ring-4 focus:ring-primary-600/10 focus:border-primary-600 focus:bg-white transition-all text-gray-900 font-medium placeholder:text-gray-400"
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
                  <ChatBubbleBottomCenterTextIcon className="h-4 w-4 text-primary-600" />
                  Description Details
                </label>
                <textarea
                  placeholder="Describe what help you need from the other department..."
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-4 py-3.5 bg-gray-50 border-2 border-gray-100 rounded-xl focus:ring-4 focus:ring-primary-600/10 focus:border-primary-600 focus:bg-white transition-all text-gray-900 font-medium placeholder:text-gray-400 resize-none"
                />
              </div>

              {/* Priority */}
              <div className="space-y-3 pt-2">
                <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
                  <FlagIcon className="h-4 w-4 text-primary-600" />
                  Request Priority
                </label>
                <div className="grid grid-cols-4 gap-3">
                  {priorityOptions.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setPriority(opt.id)}
                      className={`py-3 rounded-xl text-xs font-bold border-2 transition-all duration-300 flex flex-col items-center justify-center gap-1 ${
                        priority === opt.id 
                          ? `${opt.color.replace('bg-opacity-50', 'bg-opacity-100')} border-transparent scale-105 shadow-md` 
                          : 'bg-white border-gray-100 text-gray-400 hover:border-gray-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-8 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={onClose}
                className="px-8 py-3.5 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="px-10 py-3.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-bold shadow-lg shadow-primary-200 transition-all disabled:opacity-50 flex items-center gap-2 hover:scale-[1.02] active:scale-95"
              >
                {isSubmitting ? (
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <PlusIcon className="h-5 w-5" />
                )}
                Submit Request
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

export default CreateTicketModal
