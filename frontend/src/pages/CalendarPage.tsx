import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import Calendar from '@/components/calendar/Calendar'
import api from '@/services/api'
import toast from 'react-hot-toast'
import { useAppSelector } from '@/hooks/redux'

/**
 * CalendarPage - Premium experience for managing tasks and synced Microsoft events.
 * Rebuilt from scratch to ensure maximum reliability and real-time syncing.
 * Real-time status updates are received via WebSocket (ws:ms_status_change).
 */
const CalendarPage: React.FC = () => {
    const navigate = useNavigate()
    const { user } = useAppSelector((state) => state.auth)
    const [events, setEvents] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    const fetchSchedule = useCallback(async (silent = false) => {
        if (!silent) setLoading(true)
        try {
            const [tasksRes, ticketsRes] = await Promise.all([
                api.get('/tasks', { params: { limit: 500 } }),
                api.get('/tickets', { params: { limit: 500 } })
            ]);

            const tasks = (tasksRes.data.tasks || []).map((t: any) => ({
                ...t,
                type: 'TASK'
            }));

            const tickets = (ticketsRes.data.tickets || []).map((t: any) => ({
                id: t.id,
                title: t.title,
                dueDate: t.deadline,
                priority: t.priority === 'URGENT' ? 5 : t.priority === 'HIGH' ? 4 : 3,
                type: 'TICKET'
            })).filter((t: any) => t.dueDate);

            let microsoftEvents: any[] = [];
            if (user?.isMicrosoftSynced) {
                try {
                    const msRes = await api.get('/microsoft/events', {
                        params: {
                            t: Date.now(),
                            start: new Date(Date.now() - 30 * 24 * 3600000).toISOString(),
                            end: new Date(Date.now() + 30 * 24 * 3600000).toISOString()
                        }
                    });
                    microsoftEvents = msRes.data || [];
                } catch (err) {
                    console.error('Microsoft Sync Failed:', err);
                }
            }

            setEvents([...tasks, ...tickets, ...microsoftEvents]);
        } catch (error) {
            toast.error('Could not sync your schedule. Please refresh.');
        } finally {
            if (!silent) setLoading(false)
        }
    }, [user?.isMicrosoftSynced]);

    useEffect(() => {
        fetchSchedule(false)
    }, [fetchSchedule])

    // Background sync every 30 seconds for tighter status accuracy
    useEffect(() => {
        const timer = setInterval(() => fetchSchedule(true), 30000)
        return () => clearInterval(timer)
    }, [fetchSchedule])

    // Real-time: instantly react to WebSocket meeting status changes
    useEffect(() => {
        if (!user?.isMicrosoftSynced) return;
        const handleStatusChange = () => fetchSchedule(true);
        window.addEventListener('ws:ms_status_change', handleStatusChange);
        return () => window.removeEventListener('ws:ms_status_change', handleStatusChange);
    }, [fetchSchedule, user?.isMicrosoftSynced])

    const handleEventClick = (id: string, type: string) => {
        const routes: Record<string, string> = {
            'TICKET': `/tickets/${id}`,
            'MICROSOFT_EVENT': `/meetings/${id}`,
            'TASK': `/tasks/${id}`
        };
        navigate(routes[type] || `/tasks/${id}`);
    }

    if (loading) {
        return (
            <div className="h-[calc(100vh-140px)] flex items-center justify-center bg-white rounded-3xl border border-gray-100 shadow-xl">
                <div className="flex flex-col items-center">
                    <div className="relative">
                        <div className="h-16 w-16 border-4 border-primary-50 rounded-full" />
                        <div className="absolute top-0 h-16 w-16 border-4 border-primary-600 rounded-full border-t-transparent animate-spin" />
                    </div>
                    <h2 className="mt-6 text-xl font-black text-gray-900 tracking-tight">Syncing your Universe</h2>
                    <p className="mt-2 text-gray-400 text-sm font-bold uppercase tracking-widest animate-pulse">Connecting to Microsoft Graph...</p>
                </div>
            </div>
        )
    }

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.99 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="h-[calc(100vh-140px)]"
        >
            <Calendar
                events={events}
                onRefresh={() => fetchSchedule(false)}
                onEventClick={handleEventClick}
            />
        </motion.div>
    )
}

export default CalendarPage
