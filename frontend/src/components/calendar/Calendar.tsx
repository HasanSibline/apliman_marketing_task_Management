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
    const [selectedDay, setSelectedDay] = useState<{ day: number, tasks: Task[] } | null>(null)

    const getDays = (date: Date) => {
        const year = date.getFullYear()
        const month = date.getMonth()
        const firstDay = new Date(year, month, 1).getDay()
        const daysInMonth = new Date(year, month + 1, 0).getDate()
        return { firstDay, daysInMonth }
    }

    const { firstDay, daysInMonth } = getDays(viewDate)
    const safeTasks = Array.isArray(tasks) ? tasks : []
    const monthTasks = safeTasks.filter(t => {
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
            <div className="p-8 border-b border-gray-200 bg-white flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                <div className="flex items-center gap-5">
                    <div className="relative">
                        <div className="p-3.5 bg-gradient-to-tr from-primary-600 to-indigo-600 rounded-2xl text-white">
                            <CalendarIcon className="h-7 w-7" />
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
                    <div className="flex p-1 bg-gray-50 rounded-xl border border-gray-200">
                        <button onClick={prevMonth} className="p-2.5 hover:bg-white rounded-lg transition-all text-gray-500 hover:text-primary-600 active:scale-95"><ChevronLeftIcon className="h-5 w-5" /></button>
                        <button onClick={() => setViewDate(new Date())} className="px-4 py-1 text-xs font-black text-gray-700 hover:text-primary-700 transition-colors">TODAY</button>
                        <button onClick={nextMonth} className="p-2.5 hover:bg-white rounded-lg transition-all text-gray-500 hover:text-primary-600 active:scale-95"><ChevronRightIcon className="h-5 w-5" /></button>
                    </div>
                    
                    <button 
                        onClick={refresh}
                        className="p-3 bg-white border border-gray-200 text-gray-500 hover:text-primary-600 hover:border-primary-200 rounded-xl transition-all active:scale-95 group"
                    >
                        <ArrowPathIcon className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
                    </button>
                </div>
            </div>

            {/* Calendar Grid */}
            <div className="p-8 bg-white relative z-0">
                <div className="grid grid-cols-7 gap-6 mb-4">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                        <div key={d} className="text-left pl-4 pb-2 border-b border-gray-100">
                            <span className="text-[12px] font-bold text-gray-400 uppercase tracking-widest">{d}</span>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-7 gap-6">
                    {/* Empty slots for previous month's days */}
                    {Array.from({ length: firstDay }).map((_, i) => (
                        <div key={`empty-${i}`} className="h-40 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200 opacity-50" />
                    ))}

                    {/* Days of the month */}
                    {Array.from({ length: daysInMonth }).map((_, i) => {
                        const day = i + 1
                        const isToday = today.getDate() === day && today.getMonth() === viewDate.getMonth() && today.getFullYear() === viewDate.getFullYear()
                        const dayTasks = monthTasks.filter(t => new Date(t.dueDate!).getDate() === day)

                        return (
                            <div
                                key={day}
                                onClick={() => {
                                    if (dayTasks.length > 0 && onTaskClick) {
                                        setSelectedDay({ day, tasks: dayTasks });
                                    }
                                }}
                                className={`h-40 p-4 rounded-2xl border transition-all relative group flex flex-col cursor-pointer ${
                                    isToday 
                                        ? 'border-primary-400 bg-primary-50/20 ring-2 ring-primary-100' 
                                        : 'border-gray-200 bg-white hover:border-primary-300 hover:bg-gray-50'
                                }`}
                            >
                                <div className="flex items-center justify-between mb-3 shrink-0">
                                    <span className={`text-base font-bold ${isToday ? 'text-primary-700' : 'text-gray-900 group-hover:text-primary-600 transition-colors'}`}>
                                        {day.toString().padStart(2, '0')}
                                    </span>
                                    {dayTasks.length > 0 && (
                                        <div className="h-2 w-2 rounded-full bg-primary-500" />
                                    )}
                                </div>

                                <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                                    <AnimatePresence>
                                        {dayTasks.map(t => (
                                            <motion.button
                                                initial={{ opacity: 0, scale: 0.95 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                whileHover={{ scale: 1.02 }}
                                                key={t.id}
                                                onClick={(e) => { e.stopPropagation(); onTaskClick?.(t.id); }}
                                                className={`w-full text-left p-2 rounded-lg border text-[11px] font-medium transition-colors flex items-start gap-1.5 hover:ring-1 ring-black/5 ${
                                                    PRIORITY_COLORS[t.priority || 1]
                                                }`}
                                                title={t.title}
                                            >
                                                <div className="w-1 h-3 rounded-full bg-current opacity-40 shrink-0 mt-0.5" />
                                                <span className="line-clamp-2 leading-tight break-words whitespace-normal">{t.title}</span>
                                            </motion.button>
                                        ))}
                                    </AnimatePresence>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Legend / Footer */}
            <div className="px-8 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between z-10 relative rounded-b-3xl">
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
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Marketing Inteligence Dashboard</p>
            </div>

            {/* Day Modal */}
            <AnimatePresence>
                {selectedDay && (
                    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 10 }} 
                            animate={{ opacity: 1, scale: 1, y: 0 }} 
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-gray-100 flex flex-col max-h-[80vh]"
                        >
                            <div className="p-6 border-b border-gray-100 flex items-center justify-between shrink-0">
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900">
                                        {viewDate.toLocaleDateString('en-US', { month: 'long' })} {selectedDay.day}, {viewDate.getFullYear()}
                                    </h3>
                                    <p className="text-xs text-gray-500 font-medium mt-1 uppercase tracking-widest">{selectedDay.tasks.length} Task{selectedDay.tasks.length !== 1 ? 's' : ''} Due</p>
                                </div>
                                <button onClick={() => setSelectedDay(null)} className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-600 transition-colors">
                                    <SparklesIcon className="h-5 w-5" />
                                </button>
                            </div>
                            <div className="p-6 overflow-y-auto flex-1 space-y-3">
                                {selectedDay.tasks.map(t => (
                                    <div 
                                        key={t.id} 
                                        onClick={() => { setSelectedDay(null); onTaskClick?.(t.id); }}
                                        className={`p-4 rounded-xl border flex flex-col gap-2 cursor-pointer transition-all hover:ring-2 hover:ring-offset-1 ring-black/5 ${PRIORITY_COLORS[t.priority || 1]}`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <span className="font-bold text-sm tracking-tight">{t.title}</span>
                                        </div>
                                        <div className="flex items-center gap-3 text-xs opacity-75 font-medium mt-1">
                                            <span>Phase: {t.phase.replace(/_/g, ' ')}</span>
                                            {t.assignedTo && <span>• {t.assignedTo.name}</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="p-4 border-t border-gray-100 bg-gray-50 shrink-0 text-right">
                                <button onClick={() => setSelectedDay(null)} className="px-4 py-2 bg-white border border-gray-200 text-gray-700 font-medium text-sm rounded-lg hover:bg-gray-50 transition-colors">
                                    Close
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    )
}

export default Calendar
