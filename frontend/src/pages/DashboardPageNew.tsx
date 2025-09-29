import React, { useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  ChartBarIcon,
  ClockIcon,
  CheckCircleIcon,
  UsersIcon,
} from '@heroicons/react/24/outline'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { fetchDashboardAnalytics } from '@/store/slices/analyticsSlice'
import { fetchPhaseCount } from '@/store/slices/tasksSlice'
import StatsCard from '@/components/dashboard/StatsCard'
import TaskPhaseChart from '@/components/dashboard/TaskPhaseChart'
import RecentActivity from '@/components/dashboard/RecentActivity'

const DashboardPage: React.FC = () => {
  const dispatch = useAppDispatch()
  const { user } = useAppSelector((state) => state.auth)
  const { dashboard, isLoading } = useAppSelector((state) => state.analytics)
  const { phaseCount } = useAppSelector((state) => state.tasks)
  const { teamMembers } = useAppSelector((state) => state.presence)

  useEffect(() => {
    dispatch(fetchDashboardAnalytics())
    dispatch(fetchPhaseCount())
  }, [dispatch])

  const stats = [
    {
      title: 'Total Tasks',
      value: dashboard?.totalTasks || 0,
      icon: ChartBarIcon,
      color: 'bg-blue-500',
      change: { value: 12, type: 'increase' as const }
    },
    {
      title: 'Completed Tasks',
      value: dashboard?.completedTasks || 0,
      icon: CheckCircleIcon,
      color: 'bg-green-500',
      change: { value: 8, type: 'increase' as const }
    },
    {
      title: 'Pending Tasks',
      value: dashboard?.pendingTasks || 0,
      icon: ClockIcon,
      color: 'bg-yellow-500',
      change: { value: 3, type: 'decrease' as const }
    },
    {
      title: 'Active Users',
      value: dashboard?.activeUsers || 0,
      icon: UsersIcon,
      color: 'bg-purple-500',
      subtitle: `${teamMembers?.filter((m: any) => m.isOnline).length || 0} online`
    },
  ]

  const onlineMembers = teamMembers?.filter((member: any) => member.isOnline) || []

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-lg p-6 text-white">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="text-3xl font-bold mb-2">
            Welcome back, {user?.name}! 👋
          </h1>
          <p className="text-primary-100">
            Here's what's happening with your tasks today.
          </p>
        </motion.div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
          >
            <StatsCard {...stat} />
          </motion.div>
        ))}
      </div>

      {/* Charts and Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Task Phase Chart */}
        <TaskPhaseChart 
          data={Object.entries(phaseCount || {}).map(([phase, count]) => ({
            phase,
            count: count as number,
            color: '#3B82F6'
          }))}
        />

        {/* Recent Activity */}
        <RecentActivity activities={dashboard?.recentActivity || []} />
      </div>

      {/* Team Status */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Team Status</h2>
          <span className="text-sm text-gray-500">
            {onlineMembers.length} of {teamMembers?.length || 0} online
          </span>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {onlineMembers.slice(0, 6).map((member: any, index: number) => (
            <motion.div
              key={member.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
              className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg"
            >
              <div className="relative">
                <div className="h-10 w-10 rounded-full bg-primary-600 flex items-center justify-center">
                  <span className="text-sm font-medium text-white">
                    {member.name?.charAt(0).toUpperCase() || 'U'}
                  </span>
                </div>
                <div className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-white bg-green-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{member.name}</p>
                <p className="text-xs text-gray-500 truncate">{member.position || 'Team Member'}</p>
              </div>
            </motion.div>
          ))}
          
          {onlineMembers.length === 0 && (
            <div className="col-span-full text-center py-8">
              <UsersIcon className="h-12 w-12 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500">No team members online</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}

export default DashboardPage
