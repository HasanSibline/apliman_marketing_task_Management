import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    ChevronLeftIcon,
    ChevronRightIcon,
    CalendarIcon,
    ArrowPathIcon,
    SparklesIcon,
} from '@heroicons/react/24/outline'

interface Task {
    id: string
    title: string
    phase: string
    dueDate?: string
    priority?: number
    assignedTo?: { name: string }
}

interface CalendarProps {
    tasks: Task[]
    onTaskClick?: (id: string) => void
}

const PRIORITY_COLORS: Record<number, string> = {
    1: 'bg-white/60 text-gray-700 border-gray-100/50 hover:bg-white',
    2: 'bg-blue-50/80 text-blue-700 border-blue-100/50 hover:bg-blue-50',
    3: 'bg-amber-50/80 text-amber-700 border-amber-100/50 hover:bg-amber-50',
    4: 'bg-orange-50/80 text-orange-700 border-orange-100/50 hover:bg-orange-50',
    5: 'bg-red-50/80 text-red-700 border-red-100/50 hover:bg-red-50',
}

const Calendar: React.FC<CalendarProps> = ({ tasks, onTaskClick }) => {
    const [viewDate, setViewDate] = useState(new Date())
    const [isRefreshing, setIsRefreshing] = useState(false)

    const getDays = (date: Date) => {
        const year = date.getFullYear()
        const month = date.getMonth()
        const firstDay = new Date(year, month, 1).getDay()
        const daysInMonth = new Date(year, month + 1, 0).getDate()
        return { firstDay, daysInMonth }
    }

    const { firstDay, daysInMonth } = getDays(viewDate)
    const monthTasks = tasks.filter(t => {
        if (!t.dueDate) return false
        const d = new Date(t.dueDate)
        return d.getMonth() === viewDate.getMonth() && d.getFullYear() === viewDate.getFullYear()
    })

    const nextMonth = () => {
        const next = new Date(viewDate)
        next.setMonth(next.getMonth() + 1)
        setViewDate(next)
    }

    const prevMonth = () => {
        const prev = new Date(viewDate)
        prev.setMonth(prev.getMonth() - 1)
        setViewDate(prev)
    }

    const refresh = () => {
        setIsRefreshing(true)
        setTimeout(() => setIsRefreshing(false), 1000)
    }

    const today = new Date()

    return (
        <div className="bg-white rounded-[32px] shadow-2xl shadow-primary-500/10 border border-gray-100 overflow-hidden backdrop-blur-sm">
            {/* Premium Header */}
            <div className="p-8 border-b border-gray-50 bg-gradient-to-br from-white via-white to-primary-50/30 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-5">
                    <div className="relative">
                        <div className="p-3.5 bg-gradient-to-tr from-primary-600 to-indigo-600 rounded-2xl text-white shadow-xl shadow-primary-200">
                            <CalendarIcon className="h-7 w-7" />
                        </div>
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 rounded-full border-2 border-white shadow-sm flex items-center justify-center">
                            <SparklesIcon className="h-2.5 w-2.5 text-white" />
                        </div>
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-gray-900 tracking-tight leading-none mb-1.5 uppercase">
                            {viewDate.toLocaleDateString('en-US', { month: 'long' })}
                            <span className="text-primary-600 ml-2">{viewDate.getFullYear()}</span>
                        </h2>
                        <div className="flex items-center gap-2">
                            <div className="h-1.5 w-1.5 rounded-full bg-success-500" />
                            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">{monthTasks.length} Scheduled Deadlines</p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex p-1 bg-gray-100/50 rounded-2xl border border-gray-100">
                        <button onClick={prevMonth} className="p-2.5 hover:bg-white hover:shadow-sm rounded-xl transition-all text-gray-500 hover:text-primary-600 active:scale-95"><ChevronLeftIcon className="h-5 w-5" /></button>
                        <button onClick={() => setViewDate(new Date())} className="px-4 py-1 text-xs font-black text-gray-700 hover:text-primary-700 transition-colors">TODAY</button>
                        <button onClick={nextMonth} className="p-2.5 hover:bg-white hover:shadow-sm rounded-xl transition-all text-gray-500 hover:text-primary-600 active:scale-95"><ChevronRightIcon className="h-5 w-5" /></button>
                    </div>
                    
                    <button 
                        onClick={refresh}
                        className="p-3 bg-white border border-gray-100 text-gray-400 hover:text-primary-600 hover:border-primary-100 hover:shadow-lg hover:shadow-primary-100 rounded-2xl transition-all active:scale-95 group"
                    >
                        <ArrowPathIcon className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
                    </button>
                </div>
            </div>

            {/* Calendar Grid */}
            <div className="p-8 bg-white">
                <div className="grid grid-cols-7 gap-6 mb-6">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                        <div key={d} className="text-center pb-2">
                            <span className="text-[11px] font-black text-gray-300 uppercase tracking-[0.2em]">{d}</span>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-7 gap-6">
                    {/* Empty slots for previous month's days */}
                    {Array.from({ length: firstDay }).map((_, i) => (
                        <div key={`empty-${i}`} className="h-36 bg-gray-50/30 rounded-3xl border border-dashed border-gray-100/50 opacity-40" />
                    ))}

                    {/* Days of the month */}
                    {Array.from({ length: daysInMonth }).map((_, i) => {
                        const day = i + 1
                        const isToday = today.getDate() === day && today.getMonth() === viewDate.getMonth() && today.getFullYear() === viewDate.getFullYear()
                        const dayTasks = monthTasks.filter(t => new Date(t.dueDate!).getDate() === day)

                        return (
                            <div
                                key={day}
                                className={`h-36 p-4 rounded-[28px] border transition-all relative group flex flex-col ${
                                    isToday 
                                        ? 'border-primary-600 bg-primary-50/40 ring-4 ring-primary-50 shadow-xl shadow-primary-200/20' 
                                        : 'border-gray-50 bg-white hover:border-primary-100 hover:bg-primary-50/10 hover:shadow-xl hover:shadow-primary-100/10'
                                }`}
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <span className={`text-base font-black tracking-tighter ${isToday ? 'text-primary-700' : 'text-gray-900 group-hover:text-primary-600 transition-colors'}`}>
                                        {day.toString().padStart(2, '0')}
                                    </span>
                                    {dayTasks.length > 0 && (
                                        <div className="h-2 w-2 rounded-full bg-primary-500 shadow-[0_0_10px_rgba(59,130,246,0.8)] animate-pulse" />
                                    )}
                                </div>

                                <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-gray-100 scrollbar-track-transparent">
                                    <AnimatePresence>
                                        {dayTasks.map(t => (
                                            <motion.button
                                                initial={{ opacity: 0, scale: 0.95 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                whileHover={{ y: -2, scale: 1.02 }}
                                                key={t.id}
                                                onClick={() => onTaskClick?.(t.id)}
                                                className={`w-full text-left p-2 rounded-xl border text-[10px] font-black truncate transition-all shadow-sm flex items-center gap-2 ${
                                                    PRIORITY_COLORS[t.priority || 1]
                                                }`}
                                                title={t.title}
                                            >
                                                <div className="w-1 h-3 rounded-full bg-current opacity-30 shrink-0" />
                                                <span className="truncate leading-tight tracking-tight">{t.title}</span>
                                            </motion.button>
                                        ))}
                                    </AnimatePresence>
                                </div>

                                {isToday && (
                                    <div className="absolute -bottom-1 -right-1">
                                         <div className="w-3 h-3 bg-primary-600 rounded-full border-2 border-white" />
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Legend / Footer */}
            <div className="px-8 py-5 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Urgent</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-blue-400" />
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">High</span>
                    </div>
                </div>
                <p className="text-[10px] font-bold text-primary-400 uppercase tracking-widest italic">Marketing Inteligence Dashboard</p>
            </div>
        </div>
    )
}

export default Calendar
