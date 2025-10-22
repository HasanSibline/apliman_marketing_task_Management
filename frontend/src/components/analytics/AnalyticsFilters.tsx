import React from 'react'
import { FunnelIcon, CalendarIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { motion } from 'framer-motion'

interface AnalyticsFiltersProps {
  dateRange: { from: string; to: string }
  onDateRangeChange: (range: { from: string; to: string }) => void
  workflowFilter: string
  onWorkflowChange: (workflow: string) => void
  phaseFilter: string
  onPhaseChange: (phase: string) => void
  workflows: any[]
  phases: any[]
  onClearFilters: () => void
}

const AnalyticsFilters: React.FC<AnalyticsFiltersProps> = ({
  dateRange,
  onDateRangeChange,
  workflowFilter,
  onWorkflowChange,
  phaseFilter,
  onPhaseChange,
  workflows,
  phases,
  onClearFilters,
}) => {
  const hasFilters = dateRange.from || dateRange.to || workflowFilter || phaseFilter

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl border border-gray-200 shadow-sm p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FunnelIcon className="h-5 w-5 text-primary-600" />
          <h3 className="text-lg font-bold text-gray-900">Filters</h3>
        </div>
        {hasFilters && (
          <button
            onClick={onClearFilters}
            className="text-sm text-error-600 hover:text-error-700 font-medium flex items-center gap-1"
          >
            <XMarkIcon className="h-4 w-4" />
            Clear All
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Date Range From */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <CalendarIcon className="h-4 w-4 inline mr-1" />
            Date From
          </label>
          <input
            type="date"
            value={dateRange.from}
            onChange={(e) => onDateRangeChange({ ...dateRange, from: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
          />
        </div>

        {/* Date Range To */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <CalendarIcon className="h-4 w-4 inline mr-1" />
            Date To
          </label>
          <input
            type="date"
            value={dateRange.to}
            onChange={(e) => onDateRangeChange({ ...dateRange, to: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
          />
        </div>

        {/* Workflow Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Workflow
          </label>
          <select
            value={workflowFilter}
            onChange={(e) => onWorkflowChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
          >
            <option value="">All Workflows</option>
            {workflows.map((workflow) => (
              <option key={workflow.id} value={workflow.id}>
                {workflow.name}
              </option>
            ))}
          </select>
        </div>

        {/* Phase Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Phase
          </label>
          <select
            value={phaseFilter}
            onChange={(e) => onPhaseChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
          >
            <option value="">All Phases</option>
            {phases.map((phase) => (
              <option key={phase.id} value={phase.id}>
                {phase.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </motion.div>
  )
}

export default AnalyticsFilters

