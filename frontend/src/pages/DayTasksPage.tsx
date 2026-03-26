import { useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAppSelector } from '@/hooks/redux'
import TaskListItem from '@/components/tasks/TaskListItem'
import { ArrowLeftIcon, CalendarDaysIcon } from '@heroicons/react/24/outline'

export default function DayTasksPage() {
    const { date } = useParams<{ date: string }>()
    const navigate = useNavigate()
    const { tasks: allTasks, isLoading } = useAppSelector((state) => state.tasks)

    // Filter tasks exactly by the specified date string (YYYY-MM-DD or similar standard JS output)
    const dayTasks = useMemo(() => {
        if (!date) return []
        const targetDateStr = new Date(date).toDateString()
        
        return allTasks.filter(task => {
            if (!task.dueDate) return false
            const taskDateStr = new Date(task.dueDate).toDateString()
            return taskDateStr === targetDateStr
        })
    }, [allTasks, date])

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
                    className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-gray-500 hover:text-gray-900"
                >
                    <ArrowLeftIcon className="h-5 w-5" />
                </button>
                <div>
                    <h1 className="text-3xl font-black text-gray-900 flex items-center gap-3">
                        <CalendarDaysIcon className="h-8 w-8 text-primary-600" />
                        {formattedDate}
                    </h1>
                    <p className="text-gray-500 font-medium mt-1 uppercase tracking-widest text-sm">
                        {dayTasks.length} Task{dayTasks.length !== 1 ? 's' : ''} Due Today
                    </p>
                </div>
            </div>

            {/* List */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                {isLoading ? (
                    <div className="p-12 text-center text-gray-400 font-medium animate-pulse">
                        Loading tasks...
                    </div>
                ) : dayTasks.length > 0 ? (
                    <div className="divide-y divide-gray-100">
                        {dayTasks.map(task => (
                            <div key={task.id} className="p-2 hover:bg-gray-50 transition-colors">
                                <TaskListItem task={task as any} />
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="p-16 text-center">
                        <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-gray-100">
                            <CalendarDaysIcon className="h-8 w-8 text-gray-300" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 mb-1">No tasks scheduled</h3>
                        <p className="text-gray-500">You have no tasks due on this particular day. Take a break!</p>
                    </div>
                )}
            </div>
        </div>
    )
}
