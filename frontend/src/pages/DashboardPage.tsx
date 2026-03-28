import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { usersApi, quartersApi } from '@/services/api'
import { FlagIcon, CalendarIcon } from '@heroicons/react/24/outline'

const DashboardPage: React.FC = () => {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { user } = useAppSelector((state) => state.auth)
  const { dashboard, isLoading } = useAppSelector((state) => state.analytics)
  const { phaseCount } = useAppSelector((state) => state.tasks)
  const { teamMembers: presenceTeamMembers } = useAppSelector((state) => state.presence)
  const [allTeamMembers, setAllTeamMembers] = useState<any[]>([])
  const [activeQuarter, setActiveQuarter] = useState<any>(null)

  const isAdmin = user && ['SUPER_ADMIN', 'COMPANY_ADMIN', 'ADMIN'].includes(user.role)
  const hasStrategyAccess = isAdmin || (user?.strategyAccess && user.strategyAccess !== 'NONE')

  useEffect(() => {
    dispatch(fetchDashboardAnalytics())
    dispatch(fetchPhaseCount())
    loadTeamMembers()
    loadActiveQuarter()
    
    // Refresh workflow counts periodically to catch new/deleted workflows
    const intervalId = setInterval(() => {
      dispatch(fetchPhaseCount())
    }, 60000) // Refresh every 60 seconds
    
    return () => clearInterval(intervalId)
  }, [dispatch])

  const loadTeamMembers = async () => {
    try {
      const members = await usersApi.getAll({ status: 'ACTIVE' })
      setAllTeamMembers(members)
    } catch (error) {
      console.error('Failed to load team members:', error)
    }
  }

  const loadActiveQuarter = async () => {
    try {
      const quarter = await quartersApi.getActive()
      setActiveQuarter(quarter)
    } catch (error) {
      console.error('Failed to load active quarter:', error)
    }
  }

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
      subtitle: `${presenceTeamMembers?.filter((m: any) => m.isOnline).length || 0} online`
    },
  ]

  // Combine presence data with all team members
  const onlineMembers = presenceTeamMembers?.filter((member: any) => member.isOnline) || []
  
  // If no online members from presence, show all team members from the database
  const displayMembers = onlineMembers.length > 0 ? onlineMembers : allTeamMembers.slice(0, 6)

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

      {/* Active Quarter Summary */}
      {activeQuarter && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className={`bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden ${hasStrategyAccess ? 'hover:shadow-md cursor-pointer transition-shadow' : ''}`}
          onClick={() => hasStrategyAccess && navigate('/quarters')}
        >
          <div className="p-1 bg-primary-600"></div>
          <div className="p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div className="flex items-center space-x-3">
                <div className="p-3 bg-primary-50 rounded-lg">
                  <CalendarIcon className="h-6 w-6 text-primary-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Active Strategic Quarter</h2>
                  <p className="text-sm text-gray-500">{activeQuarter.name} {activeQuarter.year} • Ends {new Date(activeQuarter.endDate).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex flex-col items-end">
                  <div className="text-2xl font-bold text-primary-600">{activeQuarter.avgProgress}%</div>
                  <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">Overall Objective Progress</div>
                </div>
                {hasStrategyAccess && (
                  <button className="text-xs font-bold text-primary-600 bg-primary-50 px-2.5 py-1 rounded-full hover:bg-primary-100 transition-colors">
                    Full Report →
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Left Side: Stats */}
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-600 font-medium">Task Completion</span>
                    <span className="text-gray-900 font-bold">{activeQuarter.completedTasksCount} / {activeQuarter.totalTasksCount}</span>
                  </div>
                  <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${activeQuarter.totalTasksCount > 0 ? (activeQuarter.completedTasksCount / activeQuarter.totalTasksCount) * 100 : 0}%` }}
                      transition={{ duration: 1, delay: 0.4 }}
                      className="h-full bg-primary-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                    <div className="text-sm text-gray-500 mb-1">Total Objectives</div>
                    <div className="text-2xl font-bold text-gray-900">{activeQuarter.objectives?.length || 0}</div>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                    <div className="text-sm text-gray-500 mb-1">Key Results</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {activeQuarter.objectives?.reduce((acc: number, obj: any) => acc + (obj.keyResults?.length || 0), 0) || 0}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Side: Key Objectives */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center">
                  <FlagIcon className="h-3 w-3 mr-1" />
                  Key Objectives
                </h3>
                <div className="space-y-3">
                  {activeQuarter.objectives?.slice(0, 3).map((obj: any) => (
                    <div key={obj.id} className="space-y-1.5">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-800 font-medium truncate pr-4">{obj.title}</span>
                        <span className="text-xs font-bold text-primary-600">{obj.progress}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary-400 rounded-full transition-all duration-500"
                          style={{ width: `${obj.progress}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  {activeQuarter.objectives?.length === 0 && (
                    <p className="text-sm text-gray-500 italic">No objectives set for this quarter</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Task Phase Chart */}
      <div className="grid grid-cols-1 gap-6">
        <TaskPhaseChart 
          data={Object.entries(phaseCount || {}).map(([phase, data]: [string, any]) => ({
            phase,
            count: typeof data === 'number' ? data : data.count || 0,
            subtasksCount: typeof data === 'object' ? data.subtasksCount : undefined,
            color: typeof data === 'object' ? data.color : '#3B82F6'
          }))}
        />
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
            {onlineMembers.length > 0 
              ? `${onlineMembers.length} of ${allTeamMembers.length} online`
              : `${allTeamMembers.length} team members`}
          </span>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayMembers.slice(0, 6).map((member: any, index: number) => {
            const isOnline = onlineMembers.some((om: any) => om.id === member.id)
            return (
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
                  {isOnline && (
                    <div className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-white bg-green-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{member.name}</p>
                  <p className="text-xs text-gray-500 truncate">{member.position || 'Team Member'}</p>
                </div>
              </motion.div>
            )
          })}
          
          {displayMembers.length === 0 && (
            <div className="col-span-full text-center py-8">
              <UsersIcon className="h-12 w-12 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500">No team members found</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}

export default DashboardPage
