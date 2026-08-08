import React from 'react'
import { motion } from 'framer-motion'

interface StatsCardProps {
  title: string
  value: number | string
  icon: React.ComponentType<any>
  color: string
  change?: {
    value: number
    type: 'increase' | 'decrease'
  }
  subtitle?: string
}

const StatsCard: React.FC<StatsCardProps> = ({ 
  title, 
  value, 
  icon: Icon, 
  color, 
  change,
  subtitle 
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-6 flex items-start justify-between group hover:border-primary-100 dark:hover:border-primary-800 transition-all h-full"
    >
      <div className="flex-1">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-wide mb-1">{title}</p>
        <p className="text-3xl font-semibold text-gray-900 dark:text-white tracking-tighter">{value}</p>
          {subtitle && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{subtitle}</p>
          )}
          {change && (
            <div className="flex items-center mt-2">
              <span className={`text-sm font-medium ${
                change.type === 'increase' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              }`}>
                {change.type === 'increase' ? '+' : '-'}{Math.abs(change.value)}%
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400 ml-1">from last month</span>
            </div>
          )}
        </div>
        <div className={`p-3 rounded-lg ${color}`}>
          <Icon className="h-6 w-6 text-white" />
        </div>
    </motion.div>
  )
}

export default StatsCard
