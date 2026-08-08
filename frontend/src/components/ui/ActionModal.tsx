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
          icon: <ExclamationTriangleIcon className="h-6 w-6 text-rose-600 dark:text-rose-400" />,
          button: 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-100',
          bg: 'bg-rose-50 dark:bg-rose-900/30',
          border: 'border-rose-100 dark:border-rose-900/40'
        }
      case 'warning':
        return {
          icon: <ExclamationTriangleIcon className="h-6 w-6 text-amber-600 dark:text-amber-400" />,
          button: 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-100',
          bg: 'bg-amber-50 dark:bg-amber-900/30',
          border: 'border-amber-100 dark:border-amber-900/40'
        }
      case 'success':
        return {
          icon: <CheckCircleIcon className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />,
          button: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-100',
          bg: 'bg-emerald-50 dark:bg-emerald-900/30',
          border: 'border-emerald-100 dark:border-emerald-900/40'
        }
      default:
        return {
          icon: <InformationCircleIcon className="h-6 w-6 text-primary-600 dark:text-primary-400" />,
          button: 'bg-primary-600 hover:bg-primary-700 text-white shadow-primary-100',
          bg: 'bg-primary-50 dark:bg-primary-900/30',
          border: 'border-primary-100 dark:border-primary-900/40'
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
            className="relative w-full max-w-md bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-700 overflow-hidden"
          >
            <div className={`p-8 ${styles.bg} border-b ${styles.border} flex items-center gap-4`}>
              <div className="h-12 w-12 rounded-2xl bg-white dark:bg-gray-800 flex items-center justify-center shadow-sm border border-gray-50 dark:border-gray-700 flex-shrink-0">
                {styles.icon}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight font-outfit">{title}</h3>
                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mt-1">{description}</p>
              </div>
              <button aria-label="Close" onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <div className="p-8 space-y-6">
              {requireReason && (
                <div className="space-y-4">
                  {reasons.length > 0 ? (
                    <div className="space-y-2">
                       <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest ml-1">Selection Logic</label>
                       <select 
                         value={reason}
                         onChange={(e) => setReason(e.target.value)}
                         className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-700 rounded-xl text-xs font-black text-gray-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-primary-500/5 transition-all appearance-none"
                       >
                         <option value="">Choose a reason...</option>
                         {reasons.map(r => <option key={r} value={r}>{r}</option>)}
                         <option value="Other">Other (Specify below)</option>
                       </select>
                    </div>
                  ) : null}
                  
                  {(reasons.length === 0 || reason === 'Other') && (
                    <div className="space-y-2">
                      <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest ml-1">Contextual Background</label>
                      <textarea
                        value={reasons.includes(reason) && reason !== 'Other' ? '' : reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder={reasonPlaceholder}
                        rows={3}
                        className="w-full px-5 py-4 bg-gray-50 dark:bg-gray-900/40 border border-transparent rounded-2xl text-xs font-bold text-gray-800 dark:text-gray-100 focus:outline-none focus:bg-white dark:focus:bg-gray-700 focus:border-primary-500 transition-all font-outfit resize-none shadow-inner"
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 py-4 px-6 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all"
                >
                  {cancelText}
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={isLoading || (requireReason && !reason.trim())}
                  className={`flex-1 py-4 px-6 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all shadow-lg disabled:opacity-50 ${styles.button}`}
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
