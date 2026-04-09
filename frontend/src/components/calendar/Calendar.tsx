import { useState, useMemo, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useAppSelector } from '@/hooks/redux'
import api from '@/services/api'
import toast from 'react-hot-toast'
import {
    ChevronLeftIcon,
    ChevronRightIcon,
    MagnifyingGlassIcon,
    ClockIcon,
    PlusIcon,
    ArrowPathIcon,
    VideoCameraIcon
} from '@heroicons/react/24/outline'
import { 
    format, 
    startOfWeek, 
    addDays, 
    startOfMonth, 
    endOfMonth, 
    endOfWeek, 
    isSameMonth, 
    isSameDay, 
    addMonths, 
    subMonths,
    eachDayOfInterval,
    isToday,
    setHours,
} from 'date-fns'

interface CalendarEvent {
    id: string
    title: string
    phase?: string
    taskType?: string
    dueDate?: string
    priority?: number
    type: 'TASK' | 'TICKET' | 'MICROSOFT_EVENT'
    ticketNumber?: string
    assignedTo?: { name: string }
    status?: 'Upcoming' | 'Live' | 'Completed'
}

interface CalendarProps {
    events: CalendarEvent[]
    onEventClick?: (id: string, type: 'TASK' | 'TICKET' | 'MICROSOFT_EVENT') => void
}

const PRIORITY_COLORS: Record<number, string> = {
    1: 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50',
    2: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
    3: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
    4: 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100',
    5: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100',
}

type ViewType = 'workWeek' | 'week' | 'day'

export default function Calendar({ events, onEventClick }: CalendarProps) {
    const navigate = useNavigate()
    const { user } = useAppSelector((state) => state.auth)
    const [currentDate, setCurrentDate] = useState(new Date())
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedDate, setSelectedDate] = useState(new Date())
    const [viewType, setViewType] = useState<ViewType>('week')
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [isSyncing, setIsSyncing] = useState(false)
    const [filterType, setFilterType] = useState<'all' | 'milestone' | 'tickets'>('all')
    const scrollContainerRef = useRef<HTMLDivElement>(null)

    // Center scroll on business hours initially
    useEffect(() => {
        if (scrollContainerRef.current) {
            const currentHour = new Date().getHours()
            const scrollHour = currentHour > 6 ? currentHour - 2 : 0
            scrollContainerRef.current.scrollTop = scrollHour * 60
        }
    }, [])

    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
    
    const displayDays = useMemo(() => {
        if (viewType === 'day') return [currentDate]
        if (viewType === 'workWeek') return eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 4) })
        return eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) })
    }, [currentDate, weekStart, viewType])

    const hours = Array.from({ length: 24 }, (_, i) => i)

    const sortedEvents = useMemo(() => {
        const safeEvents = Array.isArray(events) ? events : []
        return safeEvents.filter(event => {
            const matchesSearch = event.title.toLowerCase().includes(searchQuery.toLowerCase())
            let matchesFilter = true
            if (filterType === 'milestone') matchesFilter = event.taskType === 'MILESTONE'
            if (filterType === 'tickets') matchesFilter = event.type === 'TICKET'
            return matchesSearch && matchesFilter
        })
    }, [events, searchQuery, filterType])

    const nextInterval = () => {
        if (viewType === 'day') setCurrentDate(addDays(currentDate, 1))
        else setCurrentDate(addDays(currentDate, 7))
    }
    
    const prevInterval = () => {
        if (viewType === 'day') setCurrentDate(addDays(currentDate, -1))
        else setCurrentDate(addDays(currentDate, -7))
    }

    const goToToday = () => {
        setCurrentDate(new Date())
        setSelectedDate(new Date())
    }

    const handleRefresh = () => {
        setIsRefreshing(true)
        setTimeout(() => setIsRefreshing(false), 800)
    }

    const handleMicrosoftSync = async () => {
        if (user?.isMicrosoftSynced) {
            toast.success('Your Microsoft Calendar is already synced!')
            return
        }

        setIsSyncing(true)
        try {
            const res = await api.get('/microsoft/auth-url')
            if (res.data?.url) {
                window.location.href = res.data.url
            }
        } catch (error) {
            toast.error('Failed to initialize Microsoft sync')
        } finally {
            setIsSyncing(false)
        }
    }

    const renderMiniCalendar = () => {
        const monthStart = startOfMonth(selectedDate)
        const monthEnd = endOfMonth(monthStart)
        const miniStart = startOfWeek(monthStart)
        const miniEnd = endOfWeek(monthEnd)
        const calendarDays = eachDayOfInterval({ start: miniStart, end: miniEnd })

        return (
            <div className="p-4 select-none">
                <div className="flex items-center justify-between mb-4 px-1 text-gray-900 border-b border-gray-50 pb-2">
                    <span className="text-sm font-bold">{format(selectedDate, 'MMMM yyyy')}</span>
                    <div className="flex space-x-1">
                        <button onClick={() => setSelectedDate(subMonths(selectedDate, 1))} className="p-1 hover:bg-gray-100 rounded text-gray-500">
                            <ChevronLeftIcon className="h-4 w-4" />
                        </button>
                        <button onClick={() => setSelectedDate(addMonths(selectedDate, 1))} className="p-1 hover:bg-gray-100 rounded text-gray-500">
                            <ChevronRightIcon className="h-4 w-4" />
                        </button>
                    </div>
                </div>
                <div className="grid grid-cols-7 gap-y-1 text-center font-bold text-gray-400 text-[10px] mb-2">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => <div key={d}>{d}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-y-1 text-center">
                    {calendarDays.map((day, i) => {
                        const isSelected = isSameDay(day, selectedDate)
                        const isInMonth = isSameMonth(day, monthStart)
                        const isTodayDate = isToday(day)
                        
                        return (
                            <div 
                                key={i}
                                onClick={() => {
                                    setSelectedDate(day)
                                    setCurrentDate(day)
                                }}
                                className={`
                                    text-[11px] py-1.5 rounded-md cursor-pointer transition-all
                                    ${isSelected ? 'bg-primary-600 text-white font-bold' : 'hover:bg-gray-100 text-gray-700'}
                                    ${!isInMonth ? 'opacity-30' : ''}
                                    ${isTodayDate && !isSelected ? 'text-primary-600 font-bold' : ''}
                                `}
                            >
                                {format(day, 'd')}
                            </div>
                        )
                    })}
                </div>
            </div>
        )
    }

    return (
        <div className="flex h-full bg-white rounded-xl overflow-hidden shadow-sm border border-gray-200">
            {/* Sidebar like Teams */}
            <div className="w-64 flex-shrink-0 bg-gray-50/10 border-r border-gray-200 flex flex-col pt-4">
                <div className="px-6 flex items-center justify-between mb-2">
                    <h2 className="text-xl font-bold text-gray-900">Calendar</h2>
                    <button onClick={handleRefresh} className="p-1.5 text-gray-400 hover:text-primary-600 transition-colors">
                        <ArrowPathIcon className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto overflow-x-hidden">
                    {renderMiniCalendar()}
                    
                    <div className="px-5 mt-4 space-y-6">
                        {/* Search & Filter */}
                        <div className="space-y-3">
                            <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest px-1">Search Tasks</p>
                            <div className="relative">
                                <MagnifyingGlassIcon className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                                <input 
                                    type="text" 
                                    placeholder="Keywords..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-gray-200 rounded-lg focus:ring-1 focus:ring-primary-500 focus:border-primary-500 transition-all placeholder:text-gray-300"
                                />
                            </div>
                        </div>

                        {/* Category Checklist */}
                        <div className="space-y-2">
                            <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest px-1">Calendars</p>
                            <div className="space-y-1">
                                <button 
                                    onClick={() => setFilterType('all')}
                                    className={`w-full flex items-center space-x-3 px-3 py-2 text-sm rounded-lg text-left transition-all ${
                                        filterType === 'all' ? 'bg-white shadow-sm border border-gray-100 ring-1 ring-primary-500/10' : 'text-gray-500 hover:bg-white/50'
                                    }`}
                                >
                                    <div className={`h-3 w-3 rounded-full ${filterType === 'all' ? 'bg-primary-600 shadow-sm' : 'border-2 border-gray-200'}`} />
                                    <span className={filterType === 'all' ? 'font-bold text-gray-900' : 'font-medium'}>My Tasks</span>
                                </button>
                                <button 
                                    onClick={() => setFilterType('tickets')}
                                    className={`w-full flex items-center space-x-3 px-3 py-2 text-sm rounded-lg text-left transition-all ${
                                        filterType === 'tickets' ? 'bg-white shadow-sm border border-gray-100 ring-1 ring-primary-500/10' : 'text-gray-500 hover:bg-white/50'
                                    }`}
                                >
                                    <div className={`h-3 w-3 rounded-full ${filterType === 'tickets' ? 'bg-primary-600 shadow-sm' : 'border-2 border-gray-200'}`} />
                                    <span className={filterType === 'tickets' ? 'font-bold text-gray-900' : 'font-medium'}>Tickets</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Area */}
            <div className="flex-1 flex flex-col bg-white">
                {/* Control Header */}
                <div className="h-14 flex items-center justify-between px-6 border-b border-gray-100 bg-white shrink-0">
                    <div className="flex items-center space-x-6">
                        <div className="flex items-center space-x-4">
                            <button 
                                onClick={goToToday}
                                className="px-4 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-100 border border-gray-200 rounded-md transition-colors"
                            >
                                Today
                            </button>
                            <div className="flex items-center space-x-0.5">
                                <button onClick={prevInterval} className="p-1.5 hover:bg-gray-100 rounded-md text-gray-500">
                                    <ChevronLeftIcon className="h-4 w-4" />
                                </button>
                                <button onClick={nextInterval} className="p-1.5 hover:bg-gray-100 rounded-md text-gray-500">
                                    <ChevronRightIcon className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                        <h3 className="text-base font-bold text-gray-900 border-l border-gray-200 pl-6">
                            {format(displayDays[0], 'MMMM d')} – {format(displayDays[displayDays.length-1], isSameMonth(displayDays[0], displayDays[displayDays.length-1]) ? 'd, yyyy' : 'MMMM d, yyyy')}
                        </h3>
                    </div>
                    
                    <div className="flex items-center space-x-3">
                        <div className="flex items-center bg-gray-100 p-1 rounded-lg">
                            {(['day', 'workWeek', 'week'] as ViewType[]).map((v) => (
                                <button
                                    key={v}
                                    onClick={() => setViewType(v)}
                                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                                        viewType === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                                    }`}
                                >
                                    {v === 'workWeek' ? 'Work week' : v.charAt(0).toUpperCase() + v.slice(1)}
                                </button>
                            ))}
                        </div>
                        <button 
                            onClick={handleMicrosoftSync}
                            disabled={isSyncing}
                            className={`flex items-center space-x-2 px-4 py-1.5 rounded-lg text-sm font-bold transition-all shadow-sm ${
                                user?.isMicrosoftSynced 
                                ? 'bg-green-50 text-green-700 border border-green-200' 
                                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                            }`}
                        >
                            <div className={`h-2 w-2 rounded-full ${user?.isMicrosoftSynced ? 'bg-green-500' : 'bg-gray-300'}`} />
                            <span>{user?.isMicrosoftSynced ? 'Microsoft Synced' : 'Sync Microsoft'}</span>
                            {isSyncing && <ArrowPathIcon className="h-4 w-4 animate-spin" />}
                        </button>

                        <button 
                            onClick={() => navigate('/tasks')}
                            className="flex items-center space-x-2 px-4 py-1.5 bg-primary-600 text-white text-sm font-bold rounded-lg hover:bg-primary-700 transition-colors"
                        >
                            <PlusIcon className="h-4 w-4" />
                            <span>New Task</span>
                        </button>
                    </div>
                </div>

                {/* Day Header Bar */}
                <div className="grid grid-cols-[64px_1fr] bg-white border-b border-gray-100 shrink-0">
                    <div className="flex items-end justify-center pb-2 border-r border-gray-50">
                        <span className="text-[10px] font-black text-gray-300 mb-2">GMT</span>
                    </div>
                    <div 
                        className="grid"
                        style={{ gridTemplateColumns: `repeat(${displayDays.length}, 1fr)` }}
                    >
                        {displayDays.map((day: Date) => (
                            <div key={day.toString()} className="flex flex-col items-center py-4 border-r border-gray-50 last:border-r-0">
                                <span className={`text-[10px] font-black uppercase tracking-widest mb-1 ${isToday(day) ? 'text-primary-600' : 'text-gray-400'}`}>
                                    {format(day, 'EEE')}
                                </span>
                                <div className={`flex items-center justify-center h-10 w-10 rounded-full text-2xl font-light ${
                                    isToday(day) ? 'bg-primary-600 text-white font-bold' : 'text-gray-900 hover:bg-gray-100'
                                }`}>
                                    {format(day, 'd')}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Main Scrollable Grid */}
                <div 
                    ref={scrollContainerRef}
                    className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 bg-white"
                >
                    <div className="grid grid-cols-[64px_1fr] relative min-h-[1440px]">
                        {/* Hour markers */}
                        <div className="bg-white border-r border-gray-100">
                            {hours.map(h => (
                                <div key={h} className="h-[60px] flex items-start justify-center pt-1 border-b border-gray-50 border-r-0">
                                    <span className="text-[11px] font-bold text-gray-300">
                                        {format(setHours(new Date(), h), 'h a')}
                                    </span>
                                </div>
                            ))}
                        </div>

                        {/* Task columns grid */}
                        <div 
                            className="grid relative h-full"
                            style={{ gridTemplateColumns: `repeat(${displayDays.length}, 1fr)` }}
                        >
                            {/* Horizontal separators */}
                            <div className="absolute inset-0 z-0">
                                {hours.map(h => (
                                    <div key={h} className="h-[60px] border-b border-gray-50 bg-white" />
                                ))}
                            </div>

                            {/* Column content */}
                            {displayDays.map((day: Date) => {
                                const dayEvents = sortedEvents.filter((e: CalendarEvent) => e.dueDate && isSameDay(new Date(e.dueDate), day))
                                const isCurrentDay = isToday(day)

                                return (
                                    <div key={day.toString()} className="relative border-r border-gray-100 last:border-r-0 h-full group">
                                        {/* Current Time Line */}
                                        {isCurrentDay && (
                                            <div 
                                                className="absolute left-0 right-0 z-30 flex items-center pointer-events-none"
                                                style={{ top: `${(new Date().getHours() * 60) + new Date().getMinutes()}px` }}
                                            >
                                                <div className="h-2 w-2 rounded-full bg-primary-600 -ml-1 shadow-sm" />
                                                <div className="h-[2px] flex-1 bg-primary-500 shadow-sm" />
                                            </div>
                                        )}

                                        {dayEvents.map((event: CalendarEvent) => {
                                            const date = new Date(event.dueDate!)
                                            const topPos = (date.getHours() * 60) + date.getMinutes()
                                            
                                            return (
                                                <motion.div
                                                    key={event.id}
                                                    initial={{ opacity: 0, scale: 0.95 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    whileHover={{ scale: 1.01, zIndex: 10 }}
                                                    onClick={() => onEventClick?.(event.id, event.type)}
                                                    style={{ 
                                                        position: 'absolute',
                                                        top: `${topPos}px`,
                                                        height: '52px',
                                                        left: '6px',
                                                        right: '6px',
                                                    }}
                                                    className={`
                                                        z-10 rounded-lg border-l-4 shadow-md p-3 cursor-pointer
                                                        flex flex-col justify-center overflow-hidden border border-gray-200/50
                                                        ${PRIORITY_COLORS[event.priority || 1]}
                                                    `}
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="text-xs font-bold truncate leading-tight tracking-tight uppercase">
                                                            {event.type === 'TICKET' && <span className="text-[10px] opacity-50 mr-1">{event.ticketNumber}</span>}
                                                            {event.title}
                                                        </span>
                                                        <ClockIcon className="h-3 w-3 opacity-30 shrink-0" />
                                                    </div>
                                                    <div className="flex items-center gap-1.5 mt-0.5 opacity-60">
                                                        <span className="text-[10px] font-black">{format(date, 'h:mm a')}</span>
                                                        {event.type === 'TICKET' && (
                                                            <span className="text-[9px] font-black bg-white/20 px-1.5 py-0.5 rounded uppercase">TICKET</span>
                                                        )}
                                                        {event.type === 'MICROSOFT_EVENT' && (
                                                            <div className="flex items-center gap-1">
                                                                <span className={`
                                                                    text-[9px] font-black px-1.5 py-0.5 rounded uppercase flex items-center gap-1 shadow-sm
                                                                    ${event.status === 'Live' ? 'bg-indigo-600 text-white animate-pulse' : 'bg-[#6264A7] text-white opacity-80'}
                                                                `}>
                                                                    <VideoCameraIcon className="h-2 w-2" />
                                                                    TEAMS
                                                                </span>
                                                                {event.status === 'Live' && (
                                                                    <span className="text-[8px] font-black bg-green-500 text-white px-1 rounded-sm uppercase tracking-tighter">LIVE</span>
                                                                )}
                                                                {event.status === 'Completed' && (
                                                                    <span className="text-[8px] font-black bg-gray-200 text-gray-500 px-1 rounded-sm uppercase tracking-tighter">DONE</span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </motion.div>
                                            )
                                        })}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
