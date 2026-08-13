import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAppSelector } from '@/hooks/redux'
import TaskListItem from '@/components/tasks/TaskListItem'
import { ArrowLeftIcon, CalendarDaysIcon, MagnifyingGlassIcon, FunnelIcon } from '@heroicons/react/24/outline'
import EmptyState from '@/components/common/EmptyState'
import Select from '@/components/ui/Select'

export default function DayTasksPage() {
    const { date } = useParams<{ date: string }>()
    const navigate = useNavigate()
    const { tasks: allTasks, isLoading } = useAppSelector((state) => state.tasks)

    const [searchQuery, setSearchQuery] = useState('')
    const [selectedPhase, setSelectedPhase] = useState('ALL')

    // Filter tasks exactly by the specified date string (YYYY-MM-DD or similar standard JS output)
    const dayTasksRaw = useMemo(() => {
        if (!date) return []
        const targetDateStr = new Date(date).toDateString()
        
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

    const formattedDate = date ? new Date(date).toLocaleDateString('en-US', {
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
