import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
    ChevronLeftIcon,
    ChartBarIcon,
    FlagIcon,
    CalendarIcon as CalendarIconOutline,
    ArrowPathIcon,
    ClipboardDocumentListIcon,
    ChevronRightIcon,
    ChevronLeftIcon as ChevronLeftIconSolid,
    CalendarDaysIcon,
    UserCircleIcon,
} from '@heroicons/react/24/outline'
import api from '@/services/api'
import toast from 'react-hot-toast'

// --- Types ---
interface Objective {
    id: string
    title: string
    status: string
    progress: number
}

interface Task {
    id: string
    title: string
    phase: string
    dueDate?: string
    assignedTo?: { id: string; name: string; position?: string }
    currentPhase?: { id: string; name: string; color: string }
}

interface QuarterDetail {
    id: string
    name: string
    year: number
    startDate: string
    endDate: string
    status: 'UPCOMING' | 'ACTIVE' | 'CLOSED'
    totalTasks: number
    completedTasks: number
    objectivesCount: number
    objectives: Objective[]
    tasks: Task[]
}

const STATUS_CONFIG = {
    UPCOMING: { label: 'Upcoming', bg: 'bg-gray-100 text-gray-700', dot: 'bg-gray-400' },
    ACTIVE: { label: 'Active', bg: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
    CLOSED: { label: 'Closed', bg: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
}

// --- Simplified Calendar Component ---
const QuarterCalendar = ({ tasks, startDate, endDate }: { tasks: Task[]; startDate: string; endDate: string }) => {
    const start = new Date(startDate)
    const end = new Date(endDate)
    const [viewDate, setViewDate] = useState(new Date(start))

    const getDays = (date: Date) => {
        const year = date.getFullYear()
        const month = date.getMonth()
        const firstDay = new Date(year, month, 1).getDay()
        const daysInMonth = new Date(year, month + 1, 0).getDate()
        return { firstDay, daysInMonth }
    }

    const { firstDay, daysInMonth } = getDays(viewDate)
    const monthTasks = tasks.filter(t => t.dueDate && new Date(t.dueDate).getMonth() === viewDate.getMonth() && new Date(t.dueDate).getFullYear() === viewDate.getFullYear())

    const nextMonth = () => {
        const next = new Date(viewDate)
        next.setMonth(next.getMonth() + 1)
        if (next <= end) setViewDate(next)
    }

    const prevMonth = () => {
        const prev = new Date(viewDate)
        prev.setMonth(prev.getMonth() - 1)
        if (prev >= start) setViewDate(prev)
    }

    return (
        <div className="bg-white rounded-[32px] border border-gray-100 overflow-hidden shadow-2xl shadow-gray-200/50">
            <div className="p-8 border-b border-gray-50 bg-white flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="h-12 w-12 bg-primary-50 rounded-2xl flex items-center justify-center text-primary-600">
                        <CalendarDaysIcon className="h-6 w-6" />
                    </div>
                    <div>
                        <h3 className="text-2xl font-black text-gray-900 tracking-tight">
                            {viewDate.toLocaleDateString('en-US', { month: 'long' })}
                            <span className="text-primary-600 ml-2">{viewDate.getFullYear()}</span>
                        </h3>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-0.5">Quarterly Schedule</p>
                    </div>
                </div>
                <div className="flex gap-2 p-1.5 bg-gray-50 rounded-2xl border border-gray-100">
                    <button onClick={prevMonth} className="p-2.5 hover:bg-white hover:shadow-sm rounded-xl transition-all text-gray-400 hover:text-primary-600 active:scale-95"><ChevronLeftIconSolid className="h-5 w-5" /></button>
                    <button onClick={nextMonth} className="p-2.5 hover:bg-white hover:shadow-sm rounded-xl transition-all text-gray-400 hover:text-primary-600 active:scale-95"><ChevronRightIcon className="h-5 w-5" /></button>
                </div>
            </div>
            <div className="p-8">
                <div className="grid grid-cols-7 gap-4 mb-6">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                        <div key={d} className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] text-center">{d}</div>
                    ))}
                </div>
                <div className="grid grid-cols-7 gap-4">
                    {Array.from({ length: firstDay }).map((_, i) => (
                        <div key={`empty-${i}`} className="h-40 bg-gray-50/20 rounded-[24px] border border-dashed border-gray-100" />
                    ))}
                    {Array.from({ length: daysInMonth }).map((_, i) => {
                        const day = i + 1
                        const dayDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day)
                        const isToday = new Date().toDateString() === dayDate.toDateString()
                        const dayTasks = monthTasks.filter(t => t.dueDate && new Date(t.dueDate).getDate() === day)
                        
                        return (
                            <div key={day} className={`h-40 p-4 rounded-[28px] border transition-all duration-300 flex flex-col group relative overflow-hidden ${
                                isToday 
                                ? 'bg-primary-50/30 border-primary-100' 
                                : 'bg-white border-gray-50 hover:border-primary-200 hover:shadow-lg hover:shadow-primary-100/20'
                            }`}>
                                <div className="flex items-center justify-between mb-3">
                                    <span className={`text-sm font-black ${isToday ? 'text-primary-600' : 'text-gray-400 group-hover:text-primary-600'}`}>
                                        {day.toString().padStart(2, '0')}
                                    </span>
                                    {dayTasks.length > 0 && (
                                        <div className="h-1.5 w-1.5 rounded-full bg-primary-500 shadow-sm" />
                                    )}
                                </div>
                                <div className="space-y-2 flex-1 overflow-y-auto scrollbar-hide">
                                    {dayTasks.map(t => (
                                        <motion.div 
                                            key={t.id}
                                            whileHover={{ x: 2 }}
                                            className="text-[10px] font-bold leading-tight p-2.5 bg-white text-gray-700 rounded-xl border border-gray-100 shadow-sm hover:border-primary-200 hover:text-primary-700 transition"
                                            title={t.title}
                                        >
                                            <div className="flex items-center gap-1.5">
                                                <div className="h-1 w-1 rounded-full bg-primary-500 shrink-0" />
                                                <span className="truncate">{t.title}</span>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                                {isToday && <div className="absolute top-0 right-0 p-1 bg-primary-500 text-[8px] font-black text-white rounded-bl-xl uppercase tracking-tighter">Today</div>}
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

const QuarterDetailPage: React.FC = () => {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const [quarter, setQuarter] = useState<QuarterDetail | null>(null)
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<'overview' | 'objectives' | 'tasks' | 'calendar'>('overview')

    useEffect(() => {
        fetchDetail()
    }, [id])

    const fetchDetail = async () => {
        setLoading(true)
        try {
            const { data } = await api.get(`/quarters/${id}`)
            setQuarter(data)
        } catch {
            toast.error('Failed to load quarter details')
            navigate('/quarters')
        } finally {
            setLoading(false)
        }
    }

    if (loading) return (
        <div className="flex flex-col items-center justify-center min-h-[400px]">
            <ArrowPathIcon className="h-10 w-10 text-primary-500 animate-spin" />
            <p className="mt-4 text-gray-500 font-medium">Loading quarter details...</p>
        </div>
    )

    if (!quarter) return null

    const cfg = STATUS_CONFIG[quarter.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.UPCOMING
    const completionPct = quarter.totalTasks > 0 ? Math.round((quarter.completedTasks / quarter.totalTasks) * 100) : 0

    return (
        <div className="space-y-6 max-w-6xl mx-auto pb-12">
            {/* Back & Breadcrumbs */}
            <button
                onClick={() => navigate('/quarters')}
                className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-primary-600 transition"
            >
                <ChevronLeftIcon className="h-4 w-4" />
                Back to Quarters
            </button>

            {/* Header Section */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-8">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="space-y-3">
                            <div className="flex items-center gap-3">
                                <h1 className="text-4xl font-black text-gray-900 tracking-tight">{quarter.name} {quarter.year}</h1>
                                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${cfg.bg}`}>
                                    <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
                                    {cfg.label}
                                </span>
                            </div>
                            <p className="text-gray-500 font-medium flex items-center gap-2">
                                <CalendarDaysIcon className="h-5 w-5 text-gray-400" />
                                {new Date(quarter.startDate).toLocaleDateString()} &mdash; {new Date(quarter.endDate).toLocaleDateString()}
                            </p>
                        </div>

                        {/* Stats Summary */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            <div className="bg-primary-50 p-4 rounded-xl border border-primary-100 flex flex-col items-center justify-center min-w-[120px]">
                                <span className="text-xs font-bold text-primary-600 uppercase tracking-widest mb-1">Completion</span>
                                <span className="text-2xl font-black text-primary-900">{completionPct}%</span>
                            </div>
                            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex flex-col items-center justify-center min-w-[120px]">
                                <span className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-1">Objectives</span>
                                <span className="text-2xl font-black text-blue-900">{quarter.objectivesCount}</span>
                            </div>
                            <div className="bg-green-50 p-4 rounded-xl border border-green-100 flex flex-col items-center justify-center min-w-[120px] md:col-span-1 col-span-2">
                                <span className="text-xs font-bold text-green-600 uppercase tracking-widest mb-1">Total Tasks</span>
                                <span className="text-2xl font-black text-green-900">{quarter.totalTasks}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="px-8 border-t border-gray-100 flex gap-8">
                    {[
                        { id: 'overview', label: 'Overview', icon: ChartBarIcon },
                        { id: 'objectives', label: 'Objectives', icon: FlagIcon },
                        { id: 'tasks', label: 'Tasks', icon: ClipboardDocumentListIcon },
                        { id: 'calendar', label: 'Calendar', icon: CalendarIconOutline },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`py-4 flex items-center gap-2 text-sm font-bold border-b-2 transition-all ${
                                activeTab === tab.id ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-400 hover:text-gray-600'
                            }`}
                        >
                            <tab.icon className="h-4 w-4" />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab Content */}
            <div className="space-y-6">
                {activeTab === 'overview' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Objectives Highlight */}
                        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                <FlagIcon className="h-5 w-5 text-primary-500" />
                                Key Objectives
                            </h3>
                            <div className="space-y-4">
                                {quarter.objectives.slice(0, 3).map(obj => (
                                    <div key={obj.id} className="space-y-1">
                                        <div className="flex items-center justify-between text-sm font-medium">
                                            <span className="text-gray-900">{obj.title}</span>
                                            <span className="text-gray-500">{obj.progress}%</span>
                                        </div>
                                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                            <div className="h-full bg-primary-500 transition-all" style={{ width: `${obj.progress}%` }} />
                                        </div>
                                    </div>
                                ))}
                                {quarter.objectives.length > 3 && (
                                    <button onClick={() => setActiveTab('objectives')} className="text-primary-600 text-xs font-bold hover:underline">
                                        View all {quarter.objectives.length} objectives
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Recent Tasks */}
                        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                <ClipboardDocumentListIcon className="h-5 w-5 text-blue-500" />
                                Recent Tasks
                            </h3>
                            <div className="space-y-3">
                                {quarter.tasks.slice(0, 4).map(task => (
                                    <Link key={task.id} to={`/tasks/${task.id}`} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition group border border-transparent hover:border-primary-100 shadow-sm">
                                        <span className="text-sm font-bold text-gray-800 group-hover:text-primary-600 truncate">{task.title}</span>
                                        {task.currentPhase ? (
                                            <span 
                                                className="text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter"
                                                style={{ backgroundColor: `${task.currentPhase.color}20`, color: task.currentPhase.color }}
                                            >
                                                {task.currentPhase.name}
                                            </span>
                                        ) : (
                                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-tighter ml-2 bg-white px-1.5 py-0.5 rounded border border-gray-100">
                                                {task.phase.replace(/_/g, ' ')}
                                            </span>
                                        )}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'objectives' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {quarter.objectives.map(obj => (
                            <Link key={obj.id} to={`/objectives/${obj.id}`} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm hover:border-primary-300 transition-all group">
                                <div className="flex items-start justify-between mb-3">
                                    <h4 className="font-bold text-gray-900 group-hover:text-primary-600">{obj.title}</h4>
                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${obj.status === 'ON_TRACK' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                        {obj.status}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-primary-600 transition-all" style={{ width: `${obj.progress}%` }} />
                                    </div>
                                    <span className="text-xs font-black text-primary-600">{obj.progress}%</span>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}

            {activeTab === 'tasks' && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden overflow-x-auto">
                    <table className="min-w-full w-full text-left table-fixed">
                        <thead className="bg-gray-50 text-[10px] font-black uppercase text-gray-400 border-b border-gray-100 tracking-widest">
                            <tr>
                                <th className="px-6 py-4 w-[40%]">Task Name</th>
                                <th className="px-6 py-4 w-[20%]">Phase</th>
                                <th className="px-6 py-4 w-[25%]">Assignee</th>
                                <th className="px-6 py-4 w-[15%]">Due Date</th>
                                <th className="px-6 py-4 w-[5%] whitespace-nowrap"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                                {quarter.tasks.map(task => (
                                    <tr key={task.id} className="hover:bg-gray-50/50 transition">
                                    <td className="px-6 py-4 truncate text-sm font-bold text-gray-900" title={task.title}>{task.title}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {task.currentPhase ? (
                                            <span 
                                                className="text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider block w-max"
                                                style={{ backgroundColor: `${task.currentPhase.color}15`, color: task.currentPhase.color, border: `1px solid ${task.currentPhase.color}30` }}
                                            >
                                                {task.currentPhase.name}
                                            </span>
                                        ) : (
                                            <span className="text-[10px] font-bold px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full uppercase tracking-wider block w-max">
                                                {task.phase.replace(/_/g, ' ')}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {task.assignedTo ? (
                                            <div className="flex items-center gap-2">
                                                <div className="h-6 w-6 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 shrink-0">
                                                    <UserCircleIcon className="h-4 w-4" />
                                                </div>
                                                <span className="text-xs text-gray-700 font-bold truncate">{task.assignedTo.name}</span>
                                            </div>
                                        ) : (
                                            <span className="text-xs text-gray-400">-</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500 font-black">{task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '-'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right">
                                        <Link to={`/tasks/${task.id}`} className="p-2 text-gray-300 hover:text-primary-600 transition inline-block">
                                            <ChevronRightIcon className="h-4 w-4" />
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {activeTab === 'calendar' && (
                    <QuarterCalendar tasks={quarter.tasks} startDate={quarter.startDate} endDate={quarter.endDate} />
                )}
            </div>
        </div>
    )
}

export default QuarterDetailPage
