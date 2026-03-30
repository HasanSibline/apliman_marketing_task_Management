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
  const [metadata, setMetadata] = useState<Record<string, any>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deptUsers, setDeptUsers] = useState<any[]>([])
  const [assigneeId, setAssigneeId] = useState('')

  const ticketTypes = [
    { id: 'GENERAL', label: 'General Request' },
    { id: 'PURCHASE_ORDER', label: 'Purchase Order (PO)' },
    { id: 'IT_SUPPORT', label: 'IT Support' },
    { id: 'HR_REQUEST', label: 'HR Request' },
    { id: 'SALES_LEAD', label: 'Sales / Lead' },
    { id: 'PRODUCT_DEV', label: 'Product / Dev Issue' },
    { id: 'QA_DEFECT', label: 'QA / Bug' }
  ]

  const getTargetDept = () => departments.find(d => d.id === receiverDeptId)

  const handleMetadataChange = (key: string, value: any) => {
    setMetadata(prev => ({ ...prev, [key]: value }))
  }

  const renderDynamicFields = () => {
    const dept = getTargetDept()
    if (!dept) return null

    const name = dept.name.toUpperCase()
    
    // IT / SUPPORT
    if (name.includes('IT') || name.includes('SUPPORT') || type === 'IT_SUPPORT') {
      return (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Issue Category</label>
            <select 
              onChange={(e) => handleMetadataChange('it_category', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:bg-white"
            >
              <option value="Hardware">Hardware</option>
              <option value="Software">Software</option>
              <option value="Network">Network / Wifi</option>
              <option value="Access">Access / Permissions</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Machine/Asset ID</label>
            <input 
              type="text" 
              placeholder="e.g. LAP-102"
              onChange={(e) => handleMetadataChange('asset_id', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:bg-white"
            />
          </div>
        </div>
      )
    }

    // HR
    if (name.includes('HR') || name.includes('PEOPLE') || type === 'HR_REQUEST') {
      return (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Type of Document</label>
            <select 
              onChange={(e) => handleMetadataChange('hr_doc_type', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:bg-white"
            >
              <option value="Salary Certificate">Salary Certificate</option>
              <option value="Contract Copy">Contract Copy</option>
              <option value="Insurance Claim">Insurance Claim</option>
              <option value="Vacation Balance">Vacation Balance</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Urgency Justification</label>
            <input 
              type="text" 
              placeholder="e.g. Needed for Visa"
              onChange={(e) => handleMetadataChange('hr_reason', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:bg-white"
            />
          </div>
        </div>
      )
    }

    // SALES / REVENUE / MARKETING
    if (name.includes('SALE') || name.includes('REVENUE') || name.includes('MARKET')) {
      return (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Client / Lead Name</label>
            <input 
              type="text" 
              placeholder="e.g. Global Tech Inc."
              onChange={(e) => handleMetadataChange('lead_name', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:bg-white"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Projected Value ($)</label>
            <input 
              type="number" 
              placeholder="10000"
              onChange={(e) => handleMetadataChange('deal_value', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:bg-white"
            />
          </div>
        </div>
      )
    }

    // QA / PRODUCT / DEV
    if (name.includes('QA') || name.includes('DEV') || name.includes('PROD')) {
      return (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">System Environment</label>
            <select 
              onChange={(e) => handleMetadataChange('environment', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:bg-white"
            >
              <option value="Production">Production (Live)</option>
              <option value="Staging">Staging</option>
              <option value="Beta">Beta</option>
              <option value="Development">Development</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Severity</label>
            <select 
              onChange={(e) => handleMetadataChange('severity', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:bg-white"
            >
              <option value="Minor">Minor / UI</option>
              <option value="Major">Major / Functional</option>
              <option value="Critical">Critical / Blocker</option>
            </select>
          </div>
        </div>
      )
    }

    // FINANCE / ACCOUNTING
    if (name.includes('ACCOUNT') || name.includes('FINANCE') || type === 'PURCHASE_ORDER') {
      return (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Provider / Vendor Name</label>
            <input 
              type="text" 
              placeholder="e.g. AWS Marketplace"
              onChange={(e) => handleMetadataChange('provider', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:bg-white"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Total Amount ($)</label>
            <input 
              type="number" 
              placeholder="0.00"
              onChange={(e) => handleMetadataChange('amount', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:bg-white"
            />
          </div>
        </div>
      )
    }

    return null
  }

  useEffect(() => {
    if (isOpen) {
      fetchDepartments()
    }
  }, [isOpen])

  useEffect(() => {
    if (receiverDeptId) {
      fetchDeptUsers(receiverDeptId)
    } else {
      setDeptUsers([])
      setAssigneeId('')
    }
  }, [receiverDeptId])

  const fetchDeptUsers = async (deptId: string) => {
    try {
      const res = await api.get(`/departments/${deptId}`)
      setDeptUsers(res.data.users || [])
    } catch (error) {
      toast.error('Failed to load department personnel')
    }
  }

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
        assigneeId: assigneeId || null,
        type,
        priority,
        deadline: deadline || undefined,
        metadata
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
    setMetadata({})
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

                {/* Target User */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Target Personnel (Optional)
                  </label>
                  <select
                    value={assigneeId}
                    onChange={(e) => setAssigneeId(e.target.value)}
                    disabled={!receiverDeptId}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 font-medium disabled:bg-gray-50 disabled:text-gray-400"
                  >
                    <option value="">Direct to Department Manager</option>
                    {deptUsers.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                  {!assigneeId && receiverDeptId && (
                    <p className="mt-1 text-[9px] text-gray-400 italic">Requires Dept. Manager Approval</p>
                  )}
                  {assigneeId && (
                    <p className="mt-1 text-[9px] text-primary-600 font-bold italic uppercase tracking-tighter">Bypasses Approval - Direct Entry</p>
                  )}
                </div>
              </div>

              {/* Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Interaction Category *
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 font-medium"
                >
                  {ticketTypes.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
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
                  placeholder="Summarize the core request..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              {/* Dynamic Department-Specific Fields */}
              <motion.div 
                key={receiverDeptId + type}
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-gray-50 rounded-xl p-4 border border-gray-100"
              >
                {renderDynamicFields() || (
                   <p className="text-xs text-gray-400 text-center italic">No additional specialized fields required.</p>
                )}
              </motion.div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Extended Instructions
                </label>
                <textarea
                  placeholder="Provide background context and detailed instructions..."
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
                    Target Deadline
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
