import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
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
            const { data } = await api.get('/tasks', { params: { limit: 1000 } })
            setTasks(data.tasks || [])
        } catch {
            toast.error('Failed to load tasks for calendar')
        } finally {
            setLoading(false)
        }
    }

    if (loading) {
        return (
            <div className="h-[calc(100vh-140px)] flex items-center justify-center bg-white rounded-xl border border-gray-200">
                <div className="flex flex-col items-center">
                    <div className="h-12 w-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                    <p className="mt-4 text-gray-500 font-bold tracking-tight">Syncing your schedule...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="h-[calc(100vh-140px)]">
            <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                transition={{ duration: 0.3 }}
                className="h-full"
            >
                <Calendar 
                    tasks={tasks} 
                    onTaskClick={(id) => navigate(`/tasks/${id}`)} 
                />
            </motion.div>
        </div>
    )
}

export default CalendarPage
