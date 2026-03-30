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
import { quartersApi } from '@/services/api'

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
    <div className="space-y-8 pb-12">
      {/* Premium Header Strip */}
      <div className="bg-gradient-to-br from-primary-800 via-primary-700 to-primary-900 rounded-[3rem] p-10 text-white shadow-2xl relative overflow-hidden border-8 border-white/5">
        <div className="absolute -top-24 -right-24 h-96 w-96 bg-primary-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" />
        <div className="absolute -bottom-24 -left-24 h-96 w-96 bg-indigo-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20" />
        
        <motion.div
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           className="relative z-10 flex flex-col md:flex-row md:items-center gap-8"
        >
          {/* User Profile Image & Greeting */}
          <div className="flex items-center gap-6">
             <div className="h-24 w-24 rounded-[2rem] bg-white/20 border-4 border-white/10 p-1 flex-shrink-0 shadow-2xl relative group">
                {user?.avatar ? (
                  <img src={user.avatar} className="h-full w-full object-cover rounded-[1.8rem]" alt={user.name} />
                ) : (
                  <div className="h-full w-full rounded-[1.8rem] bg-primary-500 flex items-center justify-center text-3xl font-black text-white">
                    {user?.name?.charAt(0)}
                  </div>
                )}
                <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-emerald-500 border-4 border-primary-700 shadow-lg" title="Live System Connection" />
             </div>
             
             <div className="space-y-1">
               <h1 className="text-4xl md:text-5xl font-black font-outfit tracking-tighter leading-tight">
                 {getGreeting()}, <span className="text-primary-300">{user?.name?.split(' ')[0]}</span>
               </h1>
               
               {/* Small Weather Inline */}
               {weather && (
                  <div className="flex items-center gap-2 text-primary-100/80 font-bold text-sm tracking-tight opacity-90">
                     {weather.temperature > 25 ? <SunIcon className="h-4 w-4 text-amber-300" /> : <CloudIcon className="h-4 w-4 text-sky-200" />}
                     <span>{Math.round(weather.temperature)}°C</span>
                     <span className="h-1 w-1 rounded-full bg-white/20 mx-1" />
                     <span className="uppercase tracking-widest text-[10px]">Local Conditions Synchronized</span>
                  </div>
               )}
               
               <p className="text-primary-100 font-bold opacity-60 text-xs italic tracking-tight hidden md:block">
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

      {/* Tactical Center: Analytics & Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Leaderboard Module */}
        <motion.div
           initial={{ opacity: 0, x: -30 }}
           animate={{ opacity: 1, x: 0 }}
           className="lg:col-span-1 bg-white rounded-[3rem] shadow-xl border border-gray-100 flex flex-col h-[600px] overflow-hidden"
        >
          <div className="p-8 border-b border-gray-50 bg-gray-50/50">
             <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shadow-sm">
                   <TrophyIcon className="h-7 w-7" />
                </div>
                <div>
                   <h3 className="text-xl font-black text-gray-900 tracking-tight">Performance Elite</h3>
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest italic tracking-tighter">Global Competition Leaderboard</p>
                </div>
             </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
             {topPerformers.map((performer: any, index: number) => {
               const isTopThree = index < 3;
               const decorationColors = [
                 'bg-gradient-to-br from-amber-400 to-amber-600 shadow-amber-200',
                 'bg-gradient-to-br from-gray-300 to-gray-500 shadow-gray-200',
                 'bg-gradient-to-br from-orange-400 to-orange-600 shadow-orange-200'
               ];
                return (
                  <div 
                    key={index} 
                    className={`flex items-center justify-between p-5 rounded-[2rem] transition-all group
                      ${isTopThree ? 'bg-gray-900 text-white shadow-2xl scale-[1.05] border border-white/10' : 'bg-gray-50 text-gray-900 hover:bg-white hover:shadow-lg border border-transparent hover:border-gray-100'}`}
                  >
                     <div className="flex items-center gap-4">
                        <div className="relative">
                           <div className={`h-12 w-12 rounded-[1.2rem] flex items-center justify-center overflow-hidden border-2
                             ${isTopThree ? 'border-primary-400/50' : 'border-white'}`}>
                              {performer.avatar ? (
                                <img src={performer.avatar} className="h-full w-full object-cover" alt={performer.name} />
                              ) : (
                                <div className={`h-full w-full flex items-center justify-center font-black text-sm
                                  ${isTopThree ? 'bg-primary-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                                   {performer.name?.charAt(0)}
                                </div>
                              )}
                           </div>
                           {isTopThree && (
                              <span className={`absolute -top-2 -right-2 h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-black shadow-lg border-2 border-gray-900
                                ${decorationColors[index]}`}>
                                 {index + 1}
                              </span>
                           )}
                        </div>
                        <div className="min-w-0">
                           <p className={`text-xs font-black uppercase tracking-tight truncate ${isTopThree ? 'text-white' : 'text-gray-900'}`}>{performer.name}</p>
                           <p className={`text-[9px] font-bold italic uppercase tracking-tighter truncate ${isTopThree ? 'text-gray-400' : 'text-gray-400'}`}>{performer.position}</p>
                        </div>
                     </div>
                     <div className="flex flex-col items-end">
                        <span className={`text-sm font-black ${isTopThree ? 'text-primary-400' : 'text-primary-600'}`}>{performer.tasksCompleted}</span>
                        <span className="text-[8px] font-black uppercase tracking-widest opacity-50">SLA Res</span>
                     </div>
                  </div>
                )

             })}

             {topPerformers.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center py-20 grayscale opacity-10">
                   <ChartBarIcon className="h-24 w-24 mb-4" />
                   <p className="text-sm font-black uppercase tracking-widest">Awaiting results</p>
                </div>
             )}
          </div>
        </motion.div>

        {/* Global Analytics Section */}
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
                  className="bg-white rounded-[3rem] p-8 border border-gray-100 shadow-xl"
               >
                  <div className="flex items-center justify-between mb-8">
                     <div className="flex items-center gap-4">
                        <div className="h-14 w-14 rounded-3xl bg-primary-50 text-primary-600 flex items-center justify-center">
                           <FlagIcon className="h-8 w-8" />
                        </div>
                        <div>
                           <h3 className="text-2xl font-black text-gray-900 tracking-tighter">Strategic Quarter Hub</h3>
                           <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest italic">{activeQuarter.name} Velocity Profile</p>
                        </div>
                     </div>
                     <div className="text-right">
                        <p className="text-4xl font-black text-primary-600 tracking-tighter">{activeQuarter.avgProgress}%</p>
                        <p className="text-[8px] font-black uppercase tracking-[0.2em] text-gray-300 italic underline decoration-primary-100">Company Momentum</p>
                     </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                     <div className="p-6 bg-gray-50 rounded-[2rem] border border-gray-100">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 italic">Active Target Set</p>
                        <p className="text-3xl font-black text-gray-900">{activeQuarter.objectives?.length || 0}</p>
                     </div>
                     <div className="p-6 bg-gray-50 rounded-[2rem] border border-gray-100">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 italic">Task Satisfaction Density</p>
                        <p className="text-3xl font-black text-gray-900">{activeQuarter.completedTasksCount} / {activeQuarter.totalTasksCount}</p>
                     </div>
                  </div>
               </motion.div>
            )}
        </div>
      </div>
    </div>
  )
}

export default DashboardPage
