import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  XMarkIcon, 
  ExclamationTriangleIcon,
  CheckCircleIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline'

interface ActionModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (reason?: string) => void
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'info' | 'success'
  requireReason?: boolean
  reasonPlaceholder?: string
  reasons?: string[]
  isLoading?: boolean
}

const ActionModal: React.FC<ActionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'info',
  requireReason = false,
  reasonPlaceholder = 'Provide a reason...',
  reasons = [],
  isLoading = false
}) => {
  const [reason, setReason] = useState('')

  const handleConfirm = () => {
    onConfirm(requireReason ? reason : undefined)
    setReason('')
  }

  const getVariantStyles = () => {
    switch (variant) {
      case 'danger':
        return {
          icon: <ExclamationTriangleIcon className="h-6 w-6 text-rose-600" />,
          button: 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-100',
          bg: 'bg-rose-50',
          border: 'border-rose-100'
        }
      case 'warning':
        return {
          icon: <ExclamationTriangleIcon className="h-6 w-6 text-amber-600" />,
          button: 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-100',
          bg: 'bg-amber-50',
          border: 'border-amber-100'
        }
      case 'success':
        return {
          icon: <CheckCircleIcon className="h-6 w-6 text-emerald-600" />,
          button: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-100',
          bg: 'bg-emerald-50',
          border: 'border-emerald-100'
        }
      default:
        return {
          icon: <InformationCircleIcon className="h-6 w-6 text-primary-600" />,
          button: 'bg-primary-600 hover:bg-primary-700 text-white shadow-primary-100',
          bg: 'bg-primary-50',
          border: 'border-primary-100'
        }
    }
  }

  const styles = getVariantStyles()

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden"
          >
            <div className={`p-8 ${styles.bg} border-b ${styles.border} flex items-center gap-4`}>
              <div className="h-12 w-12 rounded-2xl bg-white flex items-center justify-center shadow-sm border border-gray-50 flex-shrink-0">
                {styles.icon}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight font-outfit">{title}</h3>
                <p className="text-xs font-bold text-gray-500 mt-1">{description}</p>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <div className="p-8 space-y-6">
              {requireReason && (
                <div className="space-y-4">
                  {reasons.length > 0 ? (
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Selection Logic</label>
                       <select 
                         value={reason}
                         onChange={(e) => setReason(e.target.value)}
                         className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-xs font-black text-gray-900 focus:outline-none focus:ring-4 focus:ring-primary-500/5 transition-all appearance-none"
                       >
                         <option value="">Choose a reason...</option>
                         {reasons.map(r => <option key={r} value={r}>{r}</option>)}
                         <option value="Other">Other (Specify below)</option>
                       </select>
                    </div>
                  ) : null}
                  
                  {(reasons.length === 0 || reason === 'Other') && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Contextual Background</label>
                      <textarea
                        value={reasons.includes(reason) && reason !== 'Other' ? '' : reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder={reasonPlaceholder}
                        rows={3}
                        className="w-full px-5 py-4 bg-gray-50 border border-transparent rounded-2xl text-xs font-bold text-gray-800 focus:outline-none focus:bg-white focus:border-primary-500 transition-all font-outfit resize-none shadow-inner"
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 py-4 px-6 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
                >
                  {cancelText}
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={isLoading || (requireReason && !reason.trim())}
                  className={`flex-1 py-4 px-6 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg disabled:opacity-50 ${styles.button}`}
                >
                  {isLoading ? 'Processing...' : confirmText}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

export default ActionModal
