import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  TicketIcon,
  ClockIcon,
  ShieldCheckIcon,
  BuildingOfficeIcon,
} from '@heroicons/react/24/outline'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { analyticsApi } from '@/services/api'
import toast from 'react-hot-toast'
import { useChartTheme } from '@/theme/chartTheme'

const TicketAnalytics: React.FC = () => {
  const chart = useChartTheme()
  const [isLoading, setIsLoading] = useState(true)
  const [ticketData, setTicketData] = useState<any>(null)
  /**
   * Same distinction TeamAnalytics draws: a failed request is not a company with no
   * tickets, and the two need different empty-state copy.
   */
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    loadTicketAnalytics()
  }, [])

  const loadTicketAnalytics = async () => {
    setIsLoading(true)
    setLoadError(false)
    try {
      const data = await analyticsApi.getTicketAnalytics()
      setTicketData(data)
    } catch (error: any) {
      setLoadError(true)
      toast.error(error.response?.data?.message || 'Failed to load ticket analytics')
    } finally {
      setIsLoading(false)
    }
  }

  const chrome = (
    <div>
      <h2 className="section-title">Ticket analytics</h2>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        How fast tickets close, whether they close on time, and where they pile up.
      </p>
    </div>
  )

  if (isLoading) {
    return (
      <div className="space-y-6">
        {chrome}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="surface p-6 animate-pulse">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-4"></div>
              <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="surface p-6 animate-pulse">
              <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
              <div className="h-80 bg-gray-200 dark:bg-gray-700 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!ticketData) {
    return (
      <div className="space-y-6">
        {chrome}
        <div className="surface flex min-h-[320px] items-center justify-center">
          <div className="p-8 text-center">
            {loadError ? (
              <>
                <TicketIcon className="h-16 w-16 text-error-500 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Ticket analytics could not be loaded</h3>
                <p className="text-gray-500 dark:text-gray-400">The server did not answer. Your ticket data is fine.</p>
                <button onClick={loadTicketAnalytics} className="btn-primary mt-4">Try again</button>
              </>
            ) : (
              <>
                <TicketIcon className="h-16 w-16 text-gray-500 dark:text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No Ticket Data</h3>
                <p className="text-gray-500 dark:text-gray-400">Ticket analytics will appear here.</p>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  const {
    averageResolutionHours = 0,
    slaComplianceRate = 0,
    backlogByAge = { fresh: 0, aging: 0, stale: 0 },
    volumeByDepartment = [],
    totalTickets = 0,
  } = ticketData

  const backlogChartData = [
    { name: 'Fresh (0-2d)', value: backlogByAge.fresh },
    { name: 'Aging (3-7d)', value: backlogByAge.aging },
    { name: 'Stale (8d+)', value: backlogByAge.stale },
  ]

  const departmentChartData = volumeByDepartment.map((d: any) => ({
    name: d.departmentName,
    count: d.count,
  }))

  return (
    <div className="space-y-6">
      {chrome}

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-primary-50 dark:from-primary-900/20 to-white dark:to-gray-800 rounded-xl shadow-sm p-6 border border-primary-100 dark:border-primary-900/40"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Avg. Resolution Time</p>
              <h3 className="text-3xl font-bold text-gray-900 dark:text-white">
                {averageResolutionHours >= 24
                  ? `${(averageResolutionHours / 24).toFixed(1)}d`
                  : `${averageResolutionHours.toFixed(1)}h`}
              </h3>
              <p className="text-sm text-primary-600 dark:text-primary-400 mt-2 font-medium">
                {totalTickets} total tickets
              </p>
            </div>
            <div className="h-14 w-14 bg-primary-600 rounded-xl flex items-center justify-center shadow-lg">
              <ClockIcon className="h-8 w-8 text-white" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-br from-success-50 dark:from-success-900/20 to-white dark:to-gray-800 rounded-xl shadow-sm p-6 border border-success-100 dark:border-success-900/40"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">SLA Compliance</p>
              <h3 className="text-3xl font-bold text-gray-900 dark:text-white">
                {slaComplianceRate}%
              </h3>
              <p className="text-sm text-success-600 dark:text-success-400 mt-2 font-medium">
                Of tickets with a deadline
              </p>
            </div>
            <div className="h-14 w-14 bg-success-600 rounded-xl flex items-center justify-center shadow-lg">
              <ShieldCheckIcon className="h-8 w-8 text-white" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gradient-to-br from-warning-50 dark:from-warning-900/20 to-white dark:to-gray-800 rounded-xl shadow-sm p-6 border border-warning-100 dark:border-warning-900/40"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Open Backlog</p>
              <h3 className="text-3xl font-bold text-gray-900 dark:text-white">
                {backlogByAge.fresh + backlogByAge.aging + backlogByAge.stale}
              </h3>
              <p className="text-sm text-warning-600 dark:text-warning-400 mt-2 font-medium">
                {backlogByAge.stale} stale (8d+)
              </p>
            </div>
            <div className="h-14 w-14 bg-warning-600 rounded-xl flex items-center justify-center shadow-lg">
              <TicketIcon className="h-8 w-8 text-white" />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Backlog by age */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="surface p-6 border border-gray-200 dark:border-gray-700"
        >
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Backlog by Age</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={backlogChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                <XAxis dataKey="name" tick={{ fontSize: 11, ...chart.tick }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, ...chart.tick }} />
                <Tooltip contentStyle={chart.tooltip} labelStyle={chart.tooltipLabel} />
                <Bar dataKey="value" fill="#F59E0B" name="Open tickets" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Volume by department */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="surface p-6 border border-gray-200 dark:border-gray-700"
        >
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Volume by Department</h3>
          {departmentChartData.length === 0 ? (
            <div className="h-80 flex items-center justify-center text-gray-500 dark:text-gray-400">
              <div className="text-center">
                <BuildingOfficeIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                No tickets yet
              </div>
            </div>
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={departmentChartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, ...chart.tick }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11, ...chart.tick }}
                    width={110}
                  />
                  <Tooltip contentStyle={chart.tooltip} labelStyle={chart.tooltipLabel} />
                  <Bar dataKey="count" fill="#3B82F6" name="Tickets" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  )
}

export default TicketAnalytics
