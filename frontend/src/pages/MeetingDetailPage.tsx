import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { 
    ChevronLeftIcon, 
    CalendarIcon, 
    ClockIcon, 
    UserGroupIcon,
    ArrowDownTrayIcon,
    ChatBubbleLeftRightIcon,
    ArrowPathIcon,
    SparklesIcon
} from '@heroicons/react/24/outline'
import api from '@/services/api'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

const MeetingDetailPage: React.FC = () => {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const [meeting, setMeeting] = useState<any>(null)
    const [transcript, setTranscript] = useState<string | null>(null)
    const [summary, setSummary] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [summarizing, setSummarizing] = useState(false)

    useEffect(() => {
        fetchMeetingDetails()
    }, [id])

    const fetchMeetingDetails = async () => {
        setLoading(true)
        try {
            const [transcriptRes, detailsRes] = await Promise.all([
                api.get(`/microsoft/transcripts/${id}`),
                api.get(`/microsoft/details/${id}`)
            ])
            
            setTranscript(transcriptRes.data.transcript)
            setMeeting(detailsRes.data)
        } catch (error) {
            toast.error('Failed to load meeting details or you do not have access.')
            navigate('/calendar')
        } finally {
            setLoading(false)
        }
    }

    const handleSummarize = async () => {
        setSummarizing(true)
        try {
            const res = await api.get(`/microsoft/summarize/${id}`)
            setSummary(res.data.summary)
            toast.success('AI Insights Generated!')
        } catch (error) {
            toast.error('Failed to generate summary')
        } finally {
            setSummarizing(false)
        }
    }

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
            </div>
        )
    }

    return (
        <div className="h-[calc(100vh-100px)] flex flex-col space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <button 
                    onClick={() => navigate('/calendar')}
                    className="flex items-center space-x-2 text-gray-500 hover:text-gray-900 transition-colors"
                >
                    <ChevronLeftIcon className="h-5 w-5" />
                    <span className="font-bold">Back to Calendar</span>
                </button>
                <div className="flex items-center space-x-3">
                    <button 
                        onClick={handleSummarize}
                        disabled={summarizing || !transcript}
                        className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-bold hover:bg-primary-700 transition-all shadow-md disabled:bg-gray-300"
                    >
                        {summarizing ? (
                            <ArrowPathIcon className="h-4 w-4 animate-spin" />
                        ) : (
                            <SparklesIcon className="h-4 w-4" />
                        )}
                        <span>{summarizing ? 'Analyzing...' : 'Generate AI Insights'}</span>
                    </button>
                    <button className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-50 transition-all shadow-sm">
                        <ArrowDownTrayIcon className="h-4 w-4" />
                        <span>Download Transcript</span>
                    </button>
                </div>
            </div>

            <div className="flex-1 grid grid-cols-12 gap-6 overflow-hidden">
                {/* Transcript Area */}
                <div className="col-span-12 lg:col-span-8 flex flex-col bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-gray-50 bg-gray-50/30">
                        <div className="flex items-center justify-between mb-2">
                            <h1 className="text-2xl font-black text-gray-900 tracking-tight">{meeting?.subject}</h1>
                            <div className="flex items-center space-x-2 text-primary-600 bg-primary-50 px-3 py-1 rounded-full">
                                <ChatBubbleLeftRightIcon className="h-4 w-4" />
                                <span className="text-xs font-black uppercase">Transcription Live</span>
                            </div>
                        </div>
                        <div className="flex items-center space-x-6 text-sm text-gray-500 font-medium">
                            <div className="flex items-center space-x-2">
                                <CalendarIcon className="h-4 w-4 text-gray-400" />
                                <span>{format(new Date(meeting?.start), 'MMMM d, yyyy')}</span>
                            </div>
                            <div className="flex items-center space-x-2">
                                <ClockIcon className="h-4 w-4 text-gray-400" />
                                <span>{format(new Date(meeting?.start), 'h:mm a')} - {format(new Date(meeting?.end), 'h:mm a')}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-thin scrollbar-thumb-gray-200">
                        {!transcript ? (
                            <div className="h-full flex flex-col items-center justify-center text-gray-400">
                                <ChatBubbleLeftRightIcon className="h-16 w-16 mb-4 opacity-10" />
                                <p className="font-bold tracking-tight">No transcript available for this meeting yet.</p>
                                <p className="text-sm">Transcripts usually appear shortly after the meeting ends.</p>
                            </div>
                        ) : (
                            // Demo Transcript Formatting
                            <div className="space-y-6">
                                {transcript.split('\n\n').map((block, i) => {
                                    // Basic parsing for demo purposes
                                    const lines = block.split('\n');
                                    const speaker = lines[0] || 'Unknown';
                                    const text = lines.slice(1).join(' ');
                                    
                                    return (
                                        <motion.div 
                                            key={i}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: i * 0.05 }}
                                            className="flex space-x-4 max-w-3xl"
                                        >
                                            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 border border-gray-200 flex-shrink-0 flex items-center justify-center font-bold text-gray-500">
                                                {speaker[0]}
                                            </div>
                                            <div className="space-y-1">
                                                <div className="flex items-center space-x-2">
                                                    <span className="text-sm font-black text-gray-900">{speaker}</span>
                                                    <span className="text-[10px] font-bold text-gray-400 uppercase">10:0{i} AM</span>
                                                </div>
                                                <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-none p-4 shadow-sm text-gray-700 leading-relaxed italic">
                                                    {text || block}
                                                </div>
                                            </div>
                                        </motion.div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Sidebar */}
                <div className="col-span-12 lg:col-span-4 space-y-6 overflow-y-auto scrollbar-hide">
                    
                    {/* AI Insights Card */}
                    {summary && (
                        <motion.div 
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="bg-gradient-to-br from-indigo-50 to-white rounded-2xl border border-indigo-100 shadow-md p-6 relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 p-4 opacity-10">
                                <ChatBubbleLeftRightIcon className="h-20 w-20" />
                            </div>
                            <h2 className="text-lg font-black text-indigo-900 tracking-tight mb-4 flex items-center space-x-2">
                                <div className="h-2 w-2 bg-indigo-500 rounded-full animate-pulse" />
                                <span>ApliAI Intelligence</span>
                            </h2>
                            <div className="text-sm text-indigo-800 leading-relaxed whitespace-pre-wrap font-medium">
                                {summary}
                            </div>
                            <div className="mt-6 pt-4 border-t border-indigo-100 flex items-center justify-between">
                                <span className="text-[10px] font-black text-indigo-400 uppercase">Suggested Actions: 4</span>
                                <button className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors uppercase tracking-widest">Review all</button>
                            </div>
                        </motion.div>
                    )}

                    {/* Attendees List */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-lg font-black text-gray-900 tracking-tight flex items-center space-x-2">
                                <UserGroupIcon className="h-5 w-5 text-gray-400" />
                                <span>Attendees ({meeting?.attendees.length})</span>
                            </h2>
                        </div>
                        <div className="space-y-4">
                            {meeting?.attendees && meeting.attendees.map((attendee: any, i: number) => (
                                <div key={i} className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-all border border-transparent hover:border-gray-100">
                                    <div className="flex items-center space-x-3">
                                        <div className="relative">
                                            <img 
                                                src={`https://ui-avatars.com/api/?name=${encodeURIComponent(attendee.name)}&background=6366f1&color=fff&bold=true`} 
                                                className="h-10 w-10 rounded-full border-2 border-white shadow-sm" 
                                                alt={attendee.name}
                                            />
                                            {attendee.status === 'accepted' && (
                                                <div className="absolute -bottom-1 -right-1 h-3 w-3 bg-green-500 border-2 border-white rounded-full" title="Accepted" />
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-gray-900">{attendee.name}</p>
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{attendee.type === 'required' ? 'Required' : 'Optional'}</p>
                                        </div>
                                    </div>
                                    <div className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded">
                                        {attendee.status === 'none' ? 'Pending' : attendee.status.charAt(0).toUpperCase() + attendee.status.slice(1)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Quick Stats */}
                    <div className="bg-gradient-to-br from-primary-600 to-primary-700 rounded-2xl shadow-lg p-6 text-white overflow-hidden relative">
                        <div className="relative z-10">
                            <h3 className="text-lg font-black mb-4 tracking-tight">Meeting Summary</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white/10 rounded-xl p-3 backdrop-blur-sm border border-white/10">
                                    <span className="block text-[10px] font-black uppercase tracking-widest opacity-60">Duration</span>
                                    <span className="text-xl font-bold italic">60m</span>
                                </div>
                                <div className="bg-white/10 rounded-xl p-3 backdrop-blur-sm border border-white/10">
                                    <span className="block text-[10px] font-black uppercase tracking-widest opacity-60">Speak Time</span>
                                    <span className="text-xl font-bold italic">85%</span>
                                </div>
                            </div>
                        </div>
                        <div className="absolute top-0 right-0 h-32 w-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-3xl animate-pulse" />
                    </div>
                </div>
            </div>
        </div>
    )
}

export default MeetingDetailPage
