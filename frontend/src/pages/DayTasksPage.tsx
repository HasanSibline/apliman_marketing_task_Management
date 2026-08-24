import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { fetchTasks } from '@/store/slices/tasksSlice'
import TaskListItem from '@/components/tasks/TaskListItem'
import { ArrowLeftIcon, CalendarDaysIcon, MagnifyingGlassIcon, FunnelIcon } from '@heroicons/react/24/outline'
import EmptyState from '@/components/common/EmptyState'
import Select from '@/components/ui/Select'

export default function DayTasksPage() {
    const { date } = useParams<{ date: string }>()
    const navigate = useNavigate()
    const dispatch = useAppDispatch()
    const { tasks: allTasks, isLoading } = useAppSelector((state) => state.tasks)
    /**
     * Whether the fetch below actually succeeded.
     *
     * Filling the store fixed half of "this page lies about an empty day". The other
     * half is here: if the fetch fails, `allTasks` is [] and the page states, as a
     * fact, that nothing is scheduled for this date. A person planning around that is
     * being misled by a network error.
     *
     * Tracked from this dispatch rather than read off `state.tasks.error`, which is
     * shared with createTask and updateTask and so cannot answer this question.
     */
    const [loadError, setLoadError] = useState<string | null>(null)

    const [searchQuery, setSearchQuery] = useState('')
    const [selectedPhase, setSelectedPhase] = useState('ALL')

    /**
     * This page has to fill the store it reads from.
     *
     * It reads `state.tasks` and nothing on this route ever put anything there. The
     * calendar it is reached from fetches into its own local state, so on a deep link,
     * a refresh, or an arrival from the calendar, the list was empty and the page said
     * "Nothing due this day" about a day with tasks on it. It only appeared to work if
     * the user happened to have opened the board earlier in the same session.
     */
    const load = useCallback(async () => {
        const result = await dispatch(fetchTasks({ limit: 10000 }))
        setLoadError(
            fetchTasks.rejected.match(result)
                ? (result.payload as string) || 'The server did not answer.'
                : null,
        )
    }, [dispatch])

    useEffect(() => {
        load()
    }, [load])

    // Filter tasks exactly by the specified date string (YYYY-MM-DD or similar standard JS output)
    const dayTasksRaw = useMemo(() => {
        if (!date) return []
        // Parsed as a local date, not a UTC instant. `new Date('2026-08-24')` is
        // midnight UTC, while a task's due date is rendered with toDateString in local
        // time, so west of UTC the two sides landed on different days and the page
        // listed yesterday's tasks under yesterday's heading.
        const [y, m, d] = date.split('-').map(Number)
        const target = Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)
            ? new Date(y, m - 1, d)
            : new Date(date)
        const targetDateStr = target.toDateString()
        
        return allTasks.filter(task => {
            if (!task.dueDate) return false
            const taskDateStr = new Date(task.dueDate).toDateString()
            return taskDateStr === targetDateStr
        })
    }, [allTasks, date])

    const availablePhases = useMemo(() => {
        const p = new Set<string>()
        dayTasksRaw.forEach(t => t.currentPhase?.name && p.add(t.currentPhase.name))
        return Array.from(p).sort()
    }, [dayTasksRaw])

    const dayTasks = useMemo(() => {
        return dayTasksRaw.filter(task => {
            const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                  task.description?.toLowerCase().includes(searchQuery.toLowerCase())
            const matchesPhase = selectedPhase === 'ALL' || task.currentPhase?.name === selectedPhase
            return matchesSearch && matchesPhase
        })
    }, [dayTasksRaw, searchQuery, selectedPhase])

    // Same local parse as above, so the heading and the list cannot name different days.
    const headingDate = useMemo(() => {
        if (!date) return null
        const [y, m, d] = date.split('-').map(Number)
        return Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)
            ? new Date(y, m - 1, d)
            : new Date(date)
    }, [date])

    const formattedDate = headingDate ? headingDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }) : 'Unknown Date'

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            {/* Header */}
            <div className="flex items-center gap-4">
                <button 
                    onClick={() => navigate(-1)} 
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                >
                    <ArrowLeftIcon className="h-5 w-5" />
                </button>
                <div>
                    <h1 className="text-3xl font-semibold text-gray-900 dark:text-white flex items-center gap-3">
                        <CalendarDaysIcon className="h-8 w-8 text-primary-600 dark:text-primary-400" />
                        {formattedDate}
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 font-medium mt-1 tracking-wide text-sm">
                        {dayTasks.length} Task{dayTasks.length !== 1 ? 's' : ''} Due Today
                    </p>
                </div>
            </div>

            {/* Filters Bar */}
            <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                    <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500 dark:text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search tasks for this day..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all shadow-sm"
                    />
                </div>
                <div className="relative min-w-[200px] shrink-0">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <FunnelIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                    </div>
                    <Select
                        value={selectedPhase}
                        onChange={(e) => setSelectedPhase(e.target.value)}
                        className="select-field w-full pl-11"
                    >
                        <option value="ALL">All Phases</option>
                        {availablePhases.map(phase => (
                            <option key={phase} value={phase}>{phase}</option>
                        ))}
                    </Select>
                </div>
            </div>

            {/* List */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                {isLoading ? (
                    <div className="p-12 text-center text-gray-500 dark:text-gray-400 font-medium animate-pulse">
                        Loading tasks...
                    </div>
                ) : dayTasks.length > 0 ? (
                    <div className="divide-y divide-gray-100 dark:divide-gray-700">
                        {dayTasks.map(task => (
                            <div key={task.id} className="p-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                                <TaskListItem task={task as any} />
                            </div>
                        ))}
                    </div>
                ) : loadError ? (
                    <EmptyState
                        bare
                        icon={CalendarDaysIcon}
                        title="This day could not be loaded"
                        description={`${loadError} This is not an empty day, so do not plan around it.`}
                        action={<button onClick={load} className="btn-primary">Try again</button>}
                    />
                ) : (
                    <EmptyState
                        bare
                        icon={CalendarDaysIcon}
                        title="Nothing due this day"
                        description="No tasks are scheduled for this date. Pick another day from the calendar to see what is coming up."
                    />
                )}
            </div>
        </div>
    )
}
