import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import Calendar from '@/components/calendar/Calendar'
import api from '@/services/api'
import toast from 'react-hot-toast'

import { useAppSelector } from '@/hooks/redux'

const CalendarPage: React.FC = () => {
    const navigate = useNavigate()
    const { user } = useAppSelector((state) => state.auth)
    const [events, setEvents] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchSchedule()
    }, [user?.isMicrosoftSynced])

    // Auto-refresh every 30 seconds for near-immediate sync
    useEffect(() => {
        const interval = setInterval(() => {
            fetchSchedule()
        }, 12000) // 12s
        
        // Refresh when user returns to tab
        window.addEventListener('focus', fetchSchedule)
        
        return () => {
            clearInterval(interval)
            window.removeEventListener('focus', fetchSchedule)
        }
    }, [])

    const fetchSchedule = async () => {
        setLoading(true)
        try {
            const [tasksRes, ticketsRes] = await Promise.all([
                api.get('/tasks', { params: { limit: 1000 } }),
                api.get('/tickets', { params: { limit: 1000 } })
            ]);

            const tasks = (tasksRes.data.tasks || []).map((t: any) => ({
                ...t,
                type: 'TASK'
            }));

            const tickets = (ticketsRes.data.tickets || []).map((t: any) => ({
                id: t.id,
                title: t.title,
                dueDate: t.deadline,
                priority: t.priority === 'URGENT' ? 5 : t.priority === 'HIGH' ? 4 : t.priority === 'MEDIUM' ? 3 : 1,
                ticketNumber: t.ticketNumber,
                type: 'TICKET'
            })).filter((t: any) => t.dueDate);

            let msEvents = [];
            if (user?.isMicrosoftSynced) {
                try {
                    // Fetch for a wide range (30 days before/after today) to be safe
                    // but we should pass these to narrow the sync and handle deleted items correctly
                    const viewStart = new Date();
                    viewStart.setDate(viewStart.getDate() - 30);
                    const viewEnd = new Date();
                    viewEnd.setDate(viewEnd.getDate() + 30);
                    
                    const params = {
                        start: viewStart.toISOString(),
                        end: viewEnd.toISOString(),
                        t: Date.now()
                    };
                    
                    const msRes = await api.get('/microsoft/events', { params });
                    msEvents = (msRes.data || []).map((e: any) => ({
                        id: e.id,
                        title: e.title,
                        dueDate: e.start,
                        type: 'MICROSOFT_EVENT',
                        priority: 2,
                        isTeams: e.isTeams,
                        status: e.status
                    }));
                } catch (msErr) {
                    console.error('Failed to fetch Microsoft events', msErr);
                }
            }

            setEvents([...tasks, ...tickets, ...msEvents])
        } catch {
            toast.error('Failed to synchronize schedule')
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
                    events={events} 
                    onRefresh={fetchSchedule}
                    onEventClick={(id, type) => {
                        if (type === 'TICKET') navigate(`/tickets/${id}`)
                        else if (type === 'MICROSOFT_EVENT') navigate(`/meetings/${id}`)
                        else navigate(`/tasks/${id}`)
                    }} 
                />
            </motion.div>
        </div>
    )
}

export default CalendarPage
