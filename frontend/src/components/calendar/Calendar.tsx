import { useState, useMemo, useRef, useEffect } from 'react'
import { taskStage } from '@/lib/taskStage'
import { confirmDialog } from '@/components/ui/confirm'
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
    start?: string       // Microsoft events expose start; used as fallback when dueDate is absent
    priority?: number
    type: 'TASK' | 'TICKET' | 'MICROSOFT_EVENT'
    ticketNumber?: string
    assignedTo?: { name: string }
    status?: 'Upcoming' | 'Live' | 'Completed'
}

interface CalendarProps {
    events: CalendarEvent[]
    onEventClick?: (id: string, type: 'TASK' | 'TICKET' | 'MICROSOFT_EVENT') => void
    onRefresh?: () => void
}

const PRIORITY_COLORS: Record<number, string> = {
    1: 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700',
    2: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900/30',
    3: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/30',
    4: 'bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 hover:bg-orange-100 dark:hover:bg-orange-900/30',
    5: 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 hover:bg-red-100 dark:hover:bg-red-900/30',
}

type ViewType = 'workWeek' | 'week' | 'day'

export default function Calendar({ events, onEventClick, onRefresh }: CalendarProps) {
    const navigate = useNavigate()
    const { user } = useAppSelector((state) => state.auth)
    const [currentDate, setCurrentDate] = useState(new Date())
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedDate, setSelectedDate] = useState(new Date())
    const [viewType, setViewType] = useState<ViewType>('week')
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [isSyncing, setIsSyncing] = useState(false)
    const [filterType, setFilterType] = useState<'all' | 'milestone' | 'tickets' | 'teams'>('all')
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
            // A finished task is not a deadline. It was still being drawn on its due
            // date, in the same red as work that is genuinely late, so a board that
            // was fully cleared still looked like a day full of missed deadlines.
            if (event.type === 'TASK' && taskStage(event as any) === 'COMPLETED') return false

            const matchesSearch = event.title.toLowerCase().includes(searchQuery.toLowerCase())
            let matchesFilter = true
            if (filterType === 'milestone') matchesFilter = event.taskType === 'MILESTONE'
            if (filterType === 'tickets') matchesFilter = event.type === 'TICKET'
            if (filterType === 'teams') matchesFilter = event.type === 'MICROSOFT_EVENT'
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
        onRefresh?.()
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
                toast('Redirecting to Microsoft login…', { duration: 3000 })
                // Small delay so the toast is visible before navigation
                setTimeout(() => { window.location.href = res.data.url }, 400)
            } else {
                toast.error('Could not retrieve Microsoft auth URL. Please try again.')
                setIsSyncing(false)
            }
        } catch (error: any) {
            const msg = error.response?.data?.message || error.message || 'Unknown error'
            toast.error(`Failed to initialize Microsoft sync: ${msg}`)
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
                <div className="flex items-center justify-between mb-4 px-1 text-gray-900 dark:text-white border-b border-gray-50 dark:border-gray-700 pb-2">
                    <span className="text-sm font-bold">{format(selectedDate, 'MMMM yyyy')}</span>
                    <div className="flex space-x-1">
                        <button onClick={() => setSelectedDate(subMonths(selectedDate, 1))} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500 dark:text-gray-400">
                            <ChevronLeftIcon className="h-4 w-4" />
                        </button>
                        <button onClick={() => setSelectedDate(addMonths(selectedDate, 1))} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500 dark:text-gray-400">
                            <ChevronRightIcon className="h-4 w-4" />
                        </button>
                    </div>
                </div>
                <div className="grid grid-cols-7 gap-y-1 text-center font-bold text-gray-500 dark:text-gray-400 text-xs mb-2">
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
                                    text-xs py-1.5 rounded-md cursor-pointer transition-all
                                    ${isSelected ? 'bg-primary-600 text-white font-bold' : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200'}
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
        <div className="flex h-full bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-sm border border-gray-200 dark:border-gray-700">
            {/* Sidebar like Teams */}
            <div className="w-64 flex-shrink-0 bg-gray-50/10 dark:bg-gray-900/10 border-r border-gray-200 dark:border-gray-700 flex flex-col pt-4">
                <div className="px-6 flex items-center justify-between mb-2">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Calendar</h2>
                    <button aria-label="Refresh" onClick={handleRefresh} className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-primary-600 transition-colors">
                        <ArrowPathIcon className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto overflow-x-hidden">
                    {renderMiniCalendar()}
                    
                    <div className="px-5 mt-4 space-y-6">
                        {/* Search & Filter */}
                        <div className="space-y-3">
                            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-wide px-1">Search Tasks</p>
                            <div className="relative">
                                <MagnifyingGlassIcon className="absolute left-3 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
                                <input 
                                    type="text" 
                                    placeholder="Keywords..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-1 focus:ring-primary-500 focus:border-primary-500 transition-all placeholder:text-gray-300"
                                />
                            </div>
                        </div>

                        {/* Category Checklist */}
                        <div className="space-y-2">
                            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-wide px-1">Calendars</p>
                            <div className="space-y-1">
                                <button 
                                    onClick={() => setFilterType('all')}
                                    className={`w-full flex items-center space-x-3 px-3 py-2 text-sm rounded-lg text-left transition-all ${
                                        filterType === 'all' ? 'bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700 ring-1 ring-primary-500/10' : 'text-gray-500 dark:text-gray-400 hover:bg-white/50'
                                    }`}
                                >
                                    <div className={`h-3 w-3 rounded-full ${filterType === 'all' ? 'bg-primary-600 shadow-sm' : 'border-2 border-gray-200 dark:border-gray-700'}`} />
                                    <span className={filterType === 'all' ? 'font-bold text-gray-900 dark:text-white' : 'font-medium'}>My Tasks</span>
                                </button>
                                <button 
                                    onClick={() => setFilterType('tickets')}
                                    className={`w-full flex items-center space-x-3 px-3 py-2 text-sm rounded-lg text-left transition-all ${
                                        filterType === 'tickets' ? 'bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700 ring-1 ring-primary-500/10' : 'text-gray-500 dark:text-gray-400 hover:bg-white/50'
                                    }`}
                                >
                                    <div className={`h-3 w-3 rounded-full ${filterType === 'tickets' ? 'bg-primary-600 shadow-sm' : 'border-2 border-gray-200 dark:border-gray-700'}`} />
                                    <span className={filterType === 'tickets' ? 'font-bold text-gray-900 dark:text-white' : 'font-medium'}>Tickets</span>
                                </button>
                                {user?.isMicrosoftSynced && (
                                    <button 
                                        onClick={() => setFilterType('teams')}
                                        className={`w-full flex items-center space-x-3 px-3 py-2 text-sm rounded-lg text-left transition-all ${
                                            filterType === 'teams' ? 'bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700 ring-1 ring-primary-500/10' : 'text-gray-500 dark:text-gray-400 hover:bg-white/50'
                                        }`}
                                    >
                                        <div className={`h-3 w-3 rounded-full ${filterType === 'teams' ? 'bg-[#6264A7] shadow-sm' : 'border-2 border-gray-200 dark:border-gray-700'}`} />
                                        <span className={filterType === 'teams' ? 'font-bold text-gray-900 dark:text-white' : 'font-medium'}>Teams Meetings</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Area */}
            <div className="flex-1 flex flex-col bg-white dark:bg-gray-800">
                {/* Control Header */}
                <div className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-gray-100 bg-white px-4 py-2 dark:border-gray-700 dark:bg-gray-800">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <div className="flex items-center space-x-4">
                            <button 
                                onClick={goToToday}
                                className="px-4 py-1.5 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-md transition-colors"
                            >
                                Today
                            </button>
                            <div className="flex items-center space-x-0.5">
                                <button aria-label="Previous" onClick={prevInterval} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md text-gray-500 dark:text-gray-400">
                                    <ChevronLeftIcon className="h-4 w-4" />
                                </button>
                                <button aria-label="Next" onClick={nextInterval} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md text-gray-500 dark:text-gray-400">
                                    <ChevronRightIcon className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                        {/* Shorter and unbreakable. "August 10 to 16, 2026" is wide
                            enough to wrap in a toolbar, and a date that folds onto two
                            lines reads as a layout fault rather than as a date. */}
                        <h3 className="whitespace-nowrap border-l border-gray-200 pl-4 text-sm font-semibold text-gray-900 dark:border-gray-700 dark:text-white">
                            {format(displayDays[0], 'd MMM')} to {format(displayDays[displayDays.length-1], 'd MMM yyyy')}
                        </h3>
                    </div>
                    
                    <div className="flex items-center space-x-3">
                        <div className="flex items-center bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
                            {(['day', 'workWeek', 'week'] as ViewType[]).map((v) => (
                                <button
                                    key={v}
                                    onClick={() => setViewType(v)}
                                    className={`whitespace-nowrap rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                                        viewType === v ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                    }`}
                                >
                                    {v === 'workWeek' ? 'Work week' : v.charAt(0).toUpperCase() + v.slice(1)}
                                </button>
                            ))}
                        </div>
                        <div className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold shadow-sm transition-all ${
                            user?.isMicrosoftSynced 
                            ? 'bg-blue-50 text-blue-700 border border-blue-100' 
                            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}>
                            <div className="flex items-center space-x-2">
                                <svg className="h-4 w-4" viewBox="0 0 23 23" fill="currentColor">
                                    <path d="M0 0h11v11H0z" fill="#f25022"/><path d="M12 0h11v11H12z" fill="#7fba00"/><path d="M0 12h11v11H0z" fill="#00a4ef"/><path d="M12 12h11v11H12z" fill="#ffb900"/>
                                </svg>
                                <span>{user?.isMicrosoftSynced ? 'Microsoft Synced' : 'Sync Microsoft'}</span>
                            </div>
                            
                            {user?.isMicrosoftSynced ? (
                                <button 
                                    onClick={async () => {
                                        if (await confirmDialog({
      title: 'Disconnect Microsoft?',
      description:
        'Meetings stop syncing to your calendar. Nothing already in Aura is removed, and you can reconnect at any time.',
      confirmText: 'Disconnect',
      variant: 'warning',
    })) {
                                            try {
                                                await api.post('/microsoft/disconnect')
                                                toast.success('Disconnected successfully')
                                                window.location.reload() 
                                            } catch {
                                                toast.error('Failed to disconnect')
                                            }
                                        }
                                    }}
                                    className="ml-2 pl-2 border-l border-blue-200 text-xs text-blue-400 hover:text-red-500 transition-colors uppercase tracking-tighter"
                                >
                                    Unsync
                                </button>
                            ) : (
                                <button 
                                    onClick={handleMicrosoftSync}
                                    disabled={isSyncing}
                                    className="ml-2 text-xs text-primary-500 hover:underline uppercase tracking-tighter"
                                >
                                    {isSyncing ? 'Connecting...' : 'Connect'}
                                </button>
                            )}
                        </div>

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
                <div className="grid grid-cols-[64px_1fr] bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 shrink-0">
                    <div className="flex items-end justify-center pb-2 border-r border-gray-50 dark:border-gray-700">
                        <span className="text-xs font-semibold text-gray-300 mb-2">GMT</span>
                    </div>
                    <div 
                        className="grid"
                        style={{ gridTemplateColumns: `repeat(${displayDays.length}, 1fr)` }}
                    >
                        {displayDays.map((day: Date) => (
                            <div key={day.toString()} className="flex flex-col items-center py-4 border-r border-gray-50 dark:border-gray-700 last:border-r-0">
                                <span className={`text-xs font-semibold uppercase tracking-wide mb-1 ${isToday(day) ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400'}`}>
                                    {format(day, 'EEE')}
                                </span>
                                <div className={`flex items-center justify-center h-10 w-10 rounded-full text-2xl font-light ${
                                    isToday(day) ? 'bg-primary-600 text-white font-bold' : 'text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
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
                    className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 bg-white dark:bg-gray-800"
                >
                    <div className="grid grid-cols-[64px_1fr] relative min-h-[1440px]">
                        {/* Hour markers */}
                        <div className="bg-white dark:bg-gray-800 border-r border-gray-100 dark:border-gray-700">
                            {hours.map(h => (
                                <div key={h} className="h-[60px] flex items-start justify-center pt-1 border-b border-gray-50 dark:border-gray-700 border-r-0">
                                    <span className="text-xs font-bold text-gray-300">
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
                                    <div key={h} className="h-[60px] border-b border-gray-50 dark:border-gray-700 bg-white dark:bg-gray-800" />
                                ))}
                            </div>

                            {/* Column content */}
                            {displayDays.map((day: Date) => {
                                // Resolve the event date: prefer dueDate, fallback to start (Microsoft events)
                // Parse into a local Date so timezone offsets don't shift the day.
                const getEventDate = (e: CalendarEvent): Date | null => {
                    const raw = e.dueDate || e.start;
                    if (!raw) return null;
                    return new Date(raw); // JS Date always converts to local time for comparison
                };

                const dayEvents = sortedEvents.filter((e: CalendarEvent) => {
                    const d = getEventDate(e);
                    return d !== null && isSameDay(d, day);
                })
                                const isCurrentDay = isToday(day)

                                return (
                                    <div key={day.toString()} className="relative border-r border-gray-100 dark:border-gray-700 last:border-r-0 h-full group">
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
                                            const date = getEventDate(event) ?? new Date(event.dueDate ?? event.start ?? Date.now())

                                            /**
                                             * A task due on a day has no time of day.
                                             *
                                             * A date picked without a clock is stored at midnight UTC, and this
                                             * grid draws it at whatever hour that lands on locally: three in the
                                             * morning here, which is a time nobody chose and nobody works. It
                                             * looked like data and was an offset.
                                             *
                                             * Midnight UTC is treated as "no time given" and pinned to the top of
                                             * the day instead. A meeting genuinely at midnight UTC loses its slot
                                             * by this rule, which is the right trade: those are rare, and being
                                             * an hour out on one is better than every dated task in the app
                                             * claiming a working hour it never had.
                                             */
                                            // Judged against the column this event is
                                            // actually drawn in, which is chosen from the
                                            // local date. Deciding in UTC while placing
                                            // locally put a task due the 12th at the top
                                            // of the 11th for anyone west of UTC.
                                            const allDay =
                                                date.getHours() === 0 &&
                                                date.getMinutes() === 0 &&
                                                date.getSeconds() === 0

                                            const topPos = allDay ? 2 : (date.getHours() * 60) + date.getMinutes()
                                            
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
                                                        height: '75px',
                                                        left: '6px',
                                                        right: '6px',
                                                    }}
                                                    className={`
                                                        z-10 rounded-lg border-l-4 shadow-md p-2 cursor-pointer
                                                        flex flex-col justify-between overflow-hidden border border-gray-200/50
                                                        ${PRIORITY_COLORS[event.priority || 1]}
                                                    `}
                                                >
                                                    <div className="flex items-start justify-between gap-1 overflow-hidden">
                                                        <span className="text-xs font-semibold truncate leading-tight tracking-tight">
                                                            {event.type === 'TICKET' && <span className="text-xs opacity-50 mr-1">{event.ticketNumber}</span>}
                                                            {event.title}
                                                        </span>
                                                        <ClockIcon className="h-3 w-3 opacity-30 shrink-0" />
                                                    </div>

                                                    <div className="flex flex-wrap items-center gap-1.5 mt-auto">
                                                        {/* "3:00 AM" on a task due today is an offset being read
                                                            aloud as a decision. Say the truth instead. */}
                                                        <span className="whitespace-nowrap text-xs font-semibold opacity-70">
                                                            {allDay ? 'All day' : format(date, 'h:mm a')}
                                                        </span>
                                                        
                                                        {event.type === 'TICKET' && (
                                                            <span className="text-xs font-semibold bg-white/20 px-1 py-0.5 rounded">TICKET</span>
                                                        )}
                                                        
                                                        {event.type === 'MICROSOFT_EVENT' && (
                                                            <div className="flex flex-wrap items-center gap-1">
                                                                <span className={`
                                                                    text-xs font-semibold px-1 py-0.5 rounded uppercase flex items-center gap-1 shadow-sm
                                                                    ${event.status === 'Live' ? 'bg-indigo-600 text-white animate-pulse' : 'bg-[#6264A7] text-white opacity-80'}
                                                                `}>
                                                                    <VideoCameraIcon className="h-2 w-2" />
                                                                    TEAMS
                                                                </span>
                                                                {event.status === 'Live' && (
                                                                    <span className="text-xs font-semibold bg-green-500 text-white px-1 rounded-sm tracking-tighter shadow-sm animate-bounce">LIVE</span>
                                                                )}
                                                                {event.status === 'Completed' && (
                                                                    <span className="text-xs font-semibold bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1 rounded-sm tracking-tighter mt-1">DONE</span>
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
