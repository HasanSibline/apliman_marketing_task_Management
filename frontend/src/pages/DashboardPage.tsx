import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ChartBarIcon,
  ClockIcon,
  CheckCircleIcon,
  UsersIcon,
  FlagIcon, 
  CloudIcon,
  SunIcon,
  TrophyIcon,
} from '@heroicons/react/24/outline'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { fetchDashboardAnalytics } from '@/store/slices/analyticsSlice'
import { fetchPhaseCount } from '@/store/slices/tasksSlice'
import StatsCard from '@/components/dashboard/StatsCard'
import TaskPhaseChart from '@/components/dashboard/TaskPhaseChart'
import Avatar from '@/components/common/Avatar'
import { quartersApi, formatAssetUrl } from '@/services/api'

const DashboardPage: React.FC = () => {
  const dispatch = useAppDispatch()
  const { user } = useAppSelector((state) => state.auth)
  const { dashboard, isLoading } = useAppSelector((state) => state.analytics)
  const { phaseCount } = useAppSelector((state) => state.tasks)
  const { teamMembers: presenceTeamMembers } = useAppSelector((state) => state.presence)
  const [activeQuarter, setActiveQuarter] = useState<any>(null)
  const [weather, setWeather] = useState<any>(null)

  const isAdmin = user && ['SUPER_ADMIN', 'COMPANY_ADMIN', 'ADMIN'].includes(user.role)
  const hasStrategyAccess = isAdmin || (user?.strategyAccess && user.strategyAccess !== 'NONE')

  useEffect(() => {
    dispatch(fetchDashboardAnalytics())
    dispatch(fetchPhaseCount())
    loadActiveQuarter()
    fetchWeather()
    
    const intervalId = setInterval(() => {
      dispatch(fetchPhaseCount())
    }, 60000)
    
    return () => clearInterval(intervalId)
  }, [dispatch])

  const fetchWeather = async () => {
    try {
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(async (position) => {
          const { latitude, longitude } = position.coords;
          const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`);
          const data = await res.json();
          setWeather(data.current_weather);
        }, (err) => {
          console.log('Location denied:', err.message);
        });
      }
    } catch (error) {
      console.error("Weather fetch failed");
    }
  }

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good Morning'
    if (hour < 18) return 'Good Afternoon'
    return 'Good Evening'
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
      title: 'Active Interaction Tasks',
      value: dashboard?.totalTasks || 0,
      icon: ChartBarIcon,
      color: 'bg-primary-600',
    },
    {
      title: 'Resolution Success',
      value: dashboard?.completedTasks || 0,
      icon: CheckCircleIcon,
      color: 'bg-emerald-600',
    },
    {
      title: 'Ongoing Operational',
      value: dashboard?.pendingTasks || 0,
      icon: ClockIcon,
      color: 'bg-amber-600',
    },
    {
      title: 'Synchronized Talent',
      value: dashboard?.activeUsers || 0,
      icon: UsersIcon,
      color: 'bg-indigo-600',
      subtitle: `${presenceTeamMembers?.filter((m: any) => m.isOnline).length || 0} online`
    },
  ]

  const topPerformers = dashboard?.topPerformers || []

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Strategic Command Strip */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-lg p-6 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-20 -mt-20 blur-3xl pointer-events-none" />
        
        <motion.div
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           className="relative z-10 flex flex-col md:flex-row md:items-center gap-8"
        >
          {/* User Profile Identity */}
          <div className="flex items-center gap-6">
             <div className="h-20 w-20 rounded-2xl bg-white/20 border-2 border-white/20 p-0.5 flex-shrink-0 relative">
                 <Avatar 
                    src={user?.avatar} 
                    name={user?.name} 
                    size="lg" 
                    rounded="2xl" 
                    className="h-full w-full"
                 />
                <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-emerald-500 border-4 border-primary-600 shadow-sm" />
             </div>
             
             <div className="space-y-1">
               <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-tight">
                 {getGreeting()}, <span className="text-primary-100">{user?.name?.split(' ')[0]}</span>
               </h1>
               
               {/* Atmospheric Synchronisation (Weather) */}
               {weather && (
                  <div className="flex items-center gap-3 text-primary-100/90 font-black text-[10px] tracking-[0.2em] uppercase italic opacity-80 mt-2">
                     <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1 rounded-full border border-white/10">
                        {weather.temperature > 25 ? <SunIcon className="h-3 w-3 text-amber-300" /> : <CloudIcon className="h-3 w-3 text-sky-100" />}
                        <span>{Math.round(weather.temperature)}°C</span>
                     </div>
                     <span className="opacity-50 tracking-widest">Atmosphere Synced</span>
                  </div>
               )}
               
               <p className="text-primary-100 font-bold opacity-70 text-xs italic tracking-tight hidden md:block">
                 Operational profile verified. Accessing {isAdmin ? "Global Enterprise Intelligence" : "Individual Success Tracker"}.
               </p>
             </div>
          </div>
        </motion.div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
          >
            <StatsCard {...stat} />
          </motion.div>
        ))}
      </div>

      {/* Tactical Hub Visualization */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Analytics on Left (2/3 width) */}
        <div className="lg:col-span-2 space-y-8">
           <TaskPhaseChart 
              data={Object.entries(phaseCount || {}).map(([phase, data]: [string, any]) => ({
                phase,
                count: typeof data === 'number' ? data : data.count || 0,
                subtasksCount: typeof data === 'object' ? data.subtasksCount : undefined,
                color: typeof data === 'object' ? data.color : '#3B82F6'
              }))}
            />

            {(hasStrategyAccess || isAdmin) && activeQuarter && (
               <motion.div
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white rounded-xl p-8 border border-gray-100"
               >
                  <div className="flex items-center justify-between mb-8">
                     <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-2xl bg-primary-50 text-primary-600 flex items-center justify-center border border-primary-100">
                           <FlagIcon className="h-6 w-6" />
                        </div>
                        <div>
                           <h3 className="text-lg font-bold text-gray-900 tracking-tight">Strategy Velocity Hub</h3>
                           <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{activeQuarter.name} Planning Archive</p>
                        </div>
                     </div>
                     <div className="text-right">
                        <p className="text-4xl font-black text-primary-600 tracking-tighter">{activeQuarter.avgProgress}%</p>
                        <p className="text-[9px] font-black uppercase tracking-widest text-gray-300">Quarterly Momentum</p>
                     </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                     <div className="p-6 bg-gray-50 rounded-2xl border border-gray-100">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 italic">Active Target Set</p>
                        <p className="text-3xl font-black text-gray-900 leading-none">{activeQuarter.objectives?.length || 0}</p>
                     </div>
                     <div className="p-6 bg-gray-50 rounded-2xl border border-gray-100">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 italic">Operation Completion</p>
                        <p className="text-3xl font-black text-gray-900 leading-none">{activeQuarter.completedTasksCount} / {activeQuarter.totalTasksCount}</p>
                     </div>
                  </div>
               </motion.div>
            )}
        </div>

        {/* Leaderboard on Right (1/3 width) */}
        <motion.div
           initial={{ opacity: 0, x: 30 }}
           animate={{ opacity: 1, x: 0 }}
           className="lg:col-span-1 bg-white rounded-xl border border-gray-100 flex flex-col h-full overflow-hidden"
        >
          <div className="p-6 border-b border-gray-50 bg-gray-50/50">
             <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
                   <TrophyIcon className="h-6 w-6" />
                </div>
                <div>
                   <h3 className="text-lg font-black text-gray-900 tracking-tight leading-none mb-1">Performance Elite</h3>
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Global Competition</p>
                </div>
             </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar min-h-[500px]">
             {topPerformers.map((performer: any, index: number) => {
               const isTopThree = index < 3;
               const rankGradients = [
                 'bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600', // Gold
                 'bg-gradient-to-r from-slate-400 via-slate-300 to-slate-500', // Silver
                 'bg-gradient-to-r from-orange-600 via-orange-500 to-orange-700'  // Bronze
               ];
               const rankLabels = ['Supreme', 'Excellence', 'Merit'];
                return (
                  <div 
                    key={index} 
                    className={`flex items-center justify-between p-4 rounded-2xl transition-all group border
                      ${isTopThree ? `${rankGradients[index]} text-white border-white/20` : 'bg-gray-50 text-gray-900 hover:bg-white hover:border-gray-200 border-transparent transition-colors'}`}
                  >
                     <div className="flex items-center gap-4">
                        <div className="relative">
                           <div className={`h-12 w-12 rounded-xl flex items-center justify-center overflow-hidden border-2
                             ${isTopThree ? 'border-white/30 bg-white/10' : 'border-white bg-gray-200'}`}>
                              {performer.avatar ? (
                                <img src={formatAssetUrl(performer.avatar)} className="h-full w-full object-cover" alt={performer.name} />
                              ) : (
                                <div className={`h-full w-full flex items-center justify-center font-black text-sm
                                  ${isTopThree ? 'text-white' : 'text-gray-500'}`}>
                                   {performer.name?.charAt(0)}
                                </div>
                              )}
                           </div>
                           {isTopThree && (
                              <div className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-white flex items-center justify-center border-2 border-gray-900 shadow-none scale-110">
                                 <span className={`text-[10px] font-black ${index === 0 ? 'text-amber-500' : index === 1 ? 'text-slate-500' : 'text-orange-600'}`}>
                                    {index + 1}
                                 </span>
                              </div>
                           )}
                        </div>
                        <div className="min-w-0">
                           <p className={`text-[11px] font-black uppercase tracking-tight truncate ${isTopThree ? 'text-white' : 'text-gray-900'}`}>{performer.name}</p>
                           <p className={`text-[9px] font-bold uppercase tracking-tight truncate ${isTopThree ? 'text-white/70' : 'text-gray-400'}`}>
                              {isTopThree ? rankLabels[index] : performer.position}
                           </p>
                        </div>
                     </div>
                     <div className="flex flex-col items-end">
                        <span className={`text-sm font-black ${isTopThree ? 'text-white' : 'text-primary-600'}`}>{performer.tasksCompleted}</span>
                        <span className={`text-[8px] font-black uppercase tracking-widest ${isTopThree ? 'text-white/40' : 'text-gray-300'}`}>SLA Res</span>
                     </div>
                  </div>
                )

             })}

             {topPerformers.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center py-20 grayscale opacity-20">
                   <ChartBarIcon className="h-16 w-16 mb-4" />
                   <p className="text-xs font-black uppercase tracking-widest">Waiting for data</p>
                </div>
             )}
          </div>
        </motion.div>
      </div>
    </div>
  )
}

export default DashboardPage
