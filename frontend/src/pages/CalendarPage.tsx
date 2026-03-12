import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
    CalendarIcon,
    ArrowPathIcon,
    ExclamationCircleIcon,
} from '@heroicons/react/24/outline'
import Calendar from '@/components/calendar/Calendar'
import api from '@/services/api'
import toast from 'react-hot-toast'

const CalendarPage: React.FC = () => {
    const navigate = useNavigate()
    const [tasks, setTasks] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchTasks()
    }, [])

    const fetchTasks = async () => {
        setLoading(true)
        try {
            const { data } = await api.get('/tasks')
            setTasks(data)
        } catch {
            toast.error('Failed to load tasks for calendar')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="space-y-6">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-primary-600 to-indigo-700 p-8 rounded-3xl text-white shadow-xl shadow-primary-200">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-white/10 backdrop-blur-md rounded-2xl">
                        <CalendarIcon className="h-8 w-8" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black tracking-tight">Global Calendar</h1>
                        <p className="text-primary-100 font-medium">Visualize all tasks and deadlines in one place</p>
                    </div>
                </div>
                <button
                    onClick={fetchTasks}
                    className="flex items-center gap-2 px-5 py-2.5 bg-white text-primary-700 rounded-2xl font-bold text-sm hover:scale-105 transition shadow-lg active:scale-95"
                >
                    <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh Calendar
                </button>
            </header>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-gray-100 shadow-sm">
                    <div className="h-12 w-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                    <p className="mt-4 text-gray-500 font-bold tracking-tight">Syncing with your schedule...</p>
                </div>
            ) : tasks.length === 0 ? (
                <div className="p-20 text-center bg-white rounded-3xl border border-gray-100 shadow-sm">
                    <ExclamationCircleIcon className="h-16 w-16 mx-auto text-gray-200 mb-4" />
                    <h3 className="text-xl font-bold text-gray-900">No tasks to display</h3>
                    <p className="text-gray-500 mt-2 max-w-sm mx-auto">Tasks with due dates will appear here automatically. Create some tasks to get started!</p>
                    <button onClick={() => navigate('/tasks')} className="mt-6 px-6 py-3 bg-primary-600 text-white rounded-2xl font-bold hover:bg-primary-700 transition shadow-lg shadow-primary-200">Go to Tasks</button>
                </div>
            ) : (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                    <Calendar tasks={tasks} onTaskClick={(id) => navigate(`/tasks/${id}`)} />
                </motion.div>
            )}
        </div>
    )
}

export default CalendarPage
