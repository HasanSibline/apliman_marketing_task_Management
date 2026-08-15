import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import FormDialog from '@/components/ui/FormDialog'
import TicketPreflightDialog from './TicketPreflightDialog'
import api from '@/services/api'
import { toast } from 'react-hot-toast'
import Select from '@/components/ui/Select'

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
  const [category, setCategory] = useState('')

  // A category chosen for one department is meaningless to the next, and leaving it
  // selected is how you send Design a purchase order.
  useEffect(() => {
    setCategory('')
  }, [receiverDeptId])
  const [priority, setPriority] = useState('MEDIUM')
  const [deadline, setDeadline] = useState('')
  const [metadata, setMetadata] = useState<Record<string, any>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPreflight, setShowPreflight] = useState(false)
  const [deptUsers, setDeptUsers] = useState<any[]>([])
  const [assigneeId, setAssigneeId] = useState('')
  const [requiresApproval, setRequiresApproval] = useState(false)
  const [approverId, setApproverId] = useState('')

  /**
   * What this department can be asked for.
   *
   * One hardcoded list served every department, so a request to Finance was offered
   * "QA / Bug" and a request to Design was offered "Purchase Order". Worse, four of
   * the seven were not values the server accepts, so choosing HR Request, Sales /
   * Lead, Product / Dev Issue or QA / Bug failed to create the ticket at all.
   *
   * Categories now belong to the department, set by an admin under Departments. A
   * department nobody has set up yet falls back to a general list rather than an
   * empty picker, so a company can raise tickets on day one.
   */
  const FALLBACK_CATEGORIES = ['General request', 'Question', 'Problem to fix', 'Something new']

  const targetDept = departments.find((d) => d.id === receiverDeptId)
  const categories: string[] =
    (targetDept?.ticketCategories?.length ? targetDept.ticketCategories : FALLBACK_CATEGORIES)

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
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 tracking-wide mb-1">Issue Category</label>
            <Select 
              value={metadata.it_category ?? ''}
              onChange={(e) => handleMetadataChange('it_category', e.target.value)}
              className="select-field w-full text-sm"
            >
              <option value="Hardware">Hardware</option>
              <option value="Software">Software</option>
              <option value="Network">Network / Wifi</option>
              <option value="Access">Access / Permissions</option>
            </Select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 tracking-wide mb-1">Machine/Asset ID</label>
            <input 
              type="text" 
              placeholder="e.g. LAP-102"
              onChange={(e) => handleMetadataChange('asset_id', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-gray-50 dark:bg-gray-900/40 focus:bg-white dark:focus:bg-gray-700"
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
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 tracking-wide mb-1">Type of Document</label>
            <Select 
              value={metadata.hr_doc_type ?? ''}
              onChange={(e) => handleMetadataChange('hr_doc_type', e.target.value)}
              className="select-field w-full text-sm"
            >
              <option value="Salary Certificate">Salary Certificate</option>
              <option value="Contract Copy">Contract Copy</option>
              <option value="Insurance Claim">Insurance Claim</option>
              <option value="Vacation Balance">Vacation Balance</option>
            </Select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 tracking-wide mb-1">Urgency Justification</label>
            <input 
              type="text" 
              placeholder="e.g. Needed for Visa"
              onChange={(e) => handleMetadataChange('hr_reason', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-gray-50 dark:bg-gray-900/40 focus:bg-white dark:focus:bg-gray-700"
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
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 tracking-wide mb-1">Client / Lead Name</label>
            <input 
              type="text" 
              placeholder="e.g. Global Tech Inc."
              onChange={(e) => handleMetadataChange('lead_name', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-gray-50 dark:bg-gray-900/40 focus:bg-white dark:focus:bg-gray-700"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 tracking-wide mb-1">Projected Value ($)</label>
            <input 
              type="number" 
              placeholder="10000"
              onChange={(e) => handleMetadataChange('deal_value', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-gray-50 dark:bg-gray-900/40 focus:bg-white dark:focus:bg-gray-700"
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
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 tracking-wide mb-1">System Environment</label>
            <Select 
              value={metadata.environment ?? ''}
              onChange={(e) => handleMetadataChange('environment', e.target.value)}
              className="select-field w-full text-sm"
            >
              <option value="Production">Production (Live)</option>
              <option value="Staging">Staging</option>
              <option value="Beta">Beta</option>
              <option value="Development">Development</option>
            </Select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 tracking-wide mb-1">Severity</label>
            <Select 
              value={metadata.severity ?? ''}
              onChange={(e) => handleMetadataChange('severity', e.target.value)}
              className="select-field w-full text-sm"
            >
              <option value="Minor">Minor / UI</option>
              <option value="Major">Major / Functional</option>
              <option value="Critical">Critical / Blocker</option>
            </Select>
          </div>
        </div>
      )
    }

    // FINANCE / ACCOUNTING
    if (name.includes('ACCOUNT') || name.includes('FINANCE') || type === 'PURCHASE_ORDER') {
      return (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 tracking-wide mb-1">Provider / Vendor Name</label>
            <input 
              type="text" 
              placeholder="e.g. AWS Marketplace"
              onChange={(e) => handleMetadataChange('provider', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-gray-50 dark:bg-gray-900/40 focus:bg-white dark:focus:bg-gray-700"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 tracking-wide mb-1">Total Amount ($)</label>
            <input 
              type="number" 
              placeholder="0.00"
              onChange={(e) => handleMetadataChange('amount', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-gray-50 dark:bg-gray-900/40 focus:bg-white dark:focus:bg-gray-700"
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

  /**
   * Send now checks first.
   *
   * Validation stays here and runs before anything is shown: there is no point asking
   * about duplicates for a draft that is missing its department. Once it passes, the
   * pre-flight dialog opens and the ticket is created only when that is confirmed, so
   * Keep editing genuinely leaves nothing behind.
   */
  const handleSend = () => {
    if (!title || !receiverDeptId) {
      toast.error('Add a title and choose a department first')
      return
    }

    if (!requiresApproval && !assigneeId) {
      toast.error('Choose who this is for, or ask for approval instead')
      return
    }

    setShowPreflight(true)
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      await api.post('/tickets', {
        title,
        description,
        receiverDeptId,
        assigneeId: assigneeId || null,
        type,
        category,
        priority,
        deadline: deadline || undefined,
        metadata,
        requiresApproval,
        approverId: requiresApproval ? approverId : undefined
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
    setRequiresApproval(false)
    setApproverId('')
  }



  return (
    <>
    <FormDialog
      isOpen={isOpen}
      onClose={onClose}
      busy={isSubmitting}
      width="md"
      title="Ask another department for something"
      description="They see it as a ticket and decide whether to take it on."
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary" disabled={isSubmitting}>
            Cancel
          </button>
          <button type="button" onClick={handleSend} className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Sending…' : 'Send request'}
          </button>
        </>
      }
    >
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Target Dept */}
                <div>
                  <label className="form-label">
                    Target Department *
                  </label>
                  <Select
                    value={receiverDeptId}
                    onChange={(e) => setReceiverDeptId(e.target.value)}
                    className="select-field w-full"
                  >
                    <option value="">Choose a department...</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>{dept.name}</option>
                    ))}
                  </Select>
                </div>

                {/* Target User */}
                <div>
                  <label className="form-label">
                    Target Personnel {!requiresApproval && '*'}
                  </label>
                  <Select
                    value={assigneeId}
                    onChange={(e) => setAssigneeId(e.target.value)}
                    disabled={!receiverDeptId}
                    className="select-field w-full"
                  >
                    <option value="">Direct to Department Manager</option>
                    {deptUsers.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </Select>
                </div>
              </div>

              {/* Approval Checkbox */}
              <div className="flex items-center gap-3 p-3 bg-primary-50/50 dark:bg-primary-900/40 rounded-xl border border-primary-100 dark:border-primary-900/40">
                <input 
                  type="checkbox" 
                  id="requiresApproval"
                  checked={requiresApproval}
                  onChange={(e) => setRequiresApproval(e.target.checked)}
                  className="h-4 w-4 text-primary-600 dark:text-primary-400 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded cursor-pointer"
                />
                <label htmlFor="requiresApproval" className="text-xs font-bold text-gray-700 dark:text-gray-200 cursor-pointer flex flex-col">
                  Require manager approval
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 normal-case">If checked, the target department manager must authorize this ticket before it goes LIVE.</span>
                </label>
              </div>

              {requiresApproval && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  className="space-y-2 p-3 bg-white dark:bg-gray-800 border border-primary-50 dark:border-primary-900/40 rounded-xl shadow-sm"
                >
                  <label className="block text-xs font-semibold text-primary-600 dark:text-primary-400 tracking-wide ml-1">Selecting Authorization Authority *</label>
                  <Select
                    value={approverId}
                    onChange={(e) => setApproverId(e.target.value)}
                    className="select-field w-full text-xs"
                  >
                    <option value="">Designate Approver...</option>
                    {deptUsers.filter(u => ['MANAGER', 'ADMIN', 'COMPANY_ADMIN'].includes(u.role)).map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                    {deptUsers.filter(u => !['MANAGER', 'ADMIN', 'COMPANY_ADMIN'].includes(u.role)).length > 0 && (
                       <optgroup label="Core Personnel">
                         {deptUsers.filter(u => !['MANAGER', 'ADMIN', 'COMPANY_ADMIN'].includes(u.role)).map(u => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                         ))}
                       </optgroup>
                    )}
                  </Select>
                  <p className="text-xs font-bold text-gray-500 dark:text-gray-400 px-1 leading-none">The selected individual will automatically be deployed to the Tactical Squad.</p>
                </motion.div>
              )}

              {/* Type */}
              <div>
                <label className="form-label">
                  What is this about? *
                </label>
                <Select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={!receiverDeptId}
                  className="select-field"
                >
                  {!receiverDeptId && <option value="">Choose a department first</option>}
                  {receiverDeptId &&
                    categories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                </Select>
                <p className="form-hint">
                  {targetDept?.ticketCategories?.length
                    ? `What ${targetDept.name} takes requests for.`
                    : 'This department has not set its own categories yet.'}
                </p>
              </div>

              {/* Title */}
              <div>
                <label className="form-label">
                  Ticket Title *
                </label>
                <input
                  type="text"
                  placeholder="Summarize the core request..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="input-field"
                />
              </div>

              {/* Dynamic Department-Specific Fields */}
              <motion.div 
                key={receiverDeptId + type}
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-gray-50 dark:bg-gray-900/40 rounded-xl p-4 border border-gray-100 dark:border-gray-700"
              >
                {renderDynamicFields() || (
                   <p className="text-xs text-gray-500 dark:text-gray-400 text-center">No additional specialized fields required.</p>
                )}
              </motion.div>

              {/* Description */}
              <div>
                <label className="form-label">
                  Extended Instructions
                </label>
                <textarea
                  placeholder="Provide background context and detailed instructions..."
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none font-medium text-gray-800 dark:text-gray-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Deadline */}
                <div>
                  <label className="form-label">
                    Target Deadline
                  </label>
                  <input
                    type="date"
                    value={deadline}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none"
                  />
                </div>

                {/* Priority */}
                <div>
                  <label className="form-label">
                    Priority
                  </label>
                  <Select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="select-field w-full"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </Select>
                </div>
              </div>
            </div>
    </FormDialog>

    {/* Sits outside the form dialog rather than inside it. Both portal to the body, so
        this one lands on top; nested inside, it would be clipped by the form's own
        scrolling body. */}
    <TicketPreflightDialog
      isOpen={showPreflight}
      draft={{ title, description, receiverDeptId, category }}
      submitting={isSubmitting}
      onCancel={() => setShowPreflight(false)}
      onConfirm={async () => {
        await handleSubmit()
        setShowPreflight(false)
      }}
      onResolved={() => {
        // Answered by what they just read, so nothing is raised. The form closes with
        // it: leaving a half-filled ticket open behind an "all done" is an invitation
        // to send it by accident a minute later.
        setShowPreflight(false)
        resetForm()
        onClose()
        toast.success('Nothing raised. Glad that was already answered.')
      }}
    />
    </>
  )
}

export default CreateTicketModal
