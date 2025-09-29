import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import { useAppDispatch } from '@/hooks/redux'
import { exportTasks } from '@/store/slices/analyticsSlice'
import toast from 'react-hot-toast'

interface ExportButtonProps {
  filters?: {
    phase?: string
    assignedToId?: string
    createdById?: string
  }
  className?: string
}

const ExportButton: React.FC<ExportButtonProps> = ({ filters = {}, className = '' }) => {
  const dispatch = useAppDispatch()
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      await dispatch(exportTasks(filters)).unwrap()
      toast.success('Tasks exported successfully!')
    } catch (error) {
      console.error('Export error:', error)
      toast.error('Failed to export tasks')
    } finally {
      setExporting(false)
    }
  }

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={handleExport}
      disabled={exporting}
      className={`inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      {exporting ? (
        <>
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-2"></div>
          Exporting...
        </>
      ) : (
        <>
          <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
          Export Tasks
        </>
      )}
    </motion.button>
  )
}

export default ExportButton
