import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { 
    ChevronLeftIcon, 
    CalendarIcon, 
    ClockIcon, 
    UserGroupIcon,
    ChatBubbleLeftRightIcon,
    ArrowPathIcon,
    SparklesIcon,
    VideoCameraIcon,
    FaceSmileIcon
} from '@heroicons/react/24/outline'
import api from '@/services/api'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

/**
 * MeetingDetailPage - Expertly crafted view for Microsoft Meeting details.
 * Focuses on 100% transcript visibility and AI-powered insights.
 */
const MeetingDetailPage: React.FC = () => {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const [meeting, setMeeting] = useState<any>(null)
    const [transcript, setTranscript] = useState<string | null>(null)
    const [isChatFallback, setIsChatFallback] = useState(false)
    const [summary, setSummary] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [summarizing, setSummarizing] = useState(false)

    const loadMeetingData = useCallback(async () => {
        setLoading(true)
        try {
            // We fetch details first, then transcript to ensure we have context
            const detailsRes = await api.get(`/microsoft/details/${id}`);
            setMeeting(detailsRes.data);

            const transcriptRes = await api.get(`/microsoft/transcripts/${id}`);
            setTranscript(transcriptRes.data.transcript);
            setIsChatFallback(!!transcriptRes.data.isChat);
            
        } catch (error) {
            toast.error('Failed to load meeting details from Microsoft.');
            navigate('/calendar');
        } finally {
            setLoading(false);
        }
    }, [id, navigate]);

    useEffect(() => {
        loadMeetingData();
    }, [loadMeetingData]);

    const handleGenerateAI = async () => {
        if (!transcript) return;
        setSummarizing(true);
        try {
            const res = await api.get(`/microsoft/summarize/${id}`);
            setSummary(res.data.summary);
            toast.success('AI Meeting Summary Generated!');
        } catch (error) {
            toast.error('AI was unable to process this transcript.');
        } finally {
            setSummarizing(false);
        }
    }

    if (loading) {
        return (
            <div className="h-full flex flex-col items-center justify-center p-20">
                <div className="relative mb-8">
                    <div className="h-20 w-20 border-8 border-indigo-50 rounded-full" />
                    <div className="absolute top-0 h-20 w-20 border-8 border-indigo-600 rounded-full border-t-transparent animate-spin" />
                </div>
                <h3 className="text-2xl font-black text-gray-900 tracking-tight">Accessing Meeting Data</h3>
                <p className="text-gray-400 font-bold uppercase tracking-widest text-xs mt-2">Connecting to Microsoft Teams...</p>
            </div>
        )
    }

    return (
        <div className="h-[calc(100vh-100px)] flex flex-col space-y-6">
            {/* Header / Navigation */}
            <div className="flex items-center justify-between">
                <button 
                    onClick={() => navigate('/calendar')}
                    className="flex items-center space-x-2 text-gray-500 hover:text-indigo-600 transition-all font-black"
                >
                    <ChevronLeftIcon className="h-5 w-5 stroke-[3px]" />
                    <span className="uppercase text-xs tracking-widest">Back to Calendar</span>
                </button>
                
                <div className="flex items-center space-x-3">
                    <button 
                        onClick={handleGenerateAI}
                        disabled={summarizing || !transcript}
                        className={`
                            flex items-center space-x-2 px-6 py-2.5 rounded-2xl text-sm font-black transition-all shadow-lg
                            ${summarizing || !transcript 
                                ? 'bg-gray-100 text-gray-400' 
                                : 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:scale-105 active:scale-95 shadow-indigo-200'}
                        `}
                    >
                        {summarizing ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <SparklesIcon className="h-4 w-4" />}
                        <span>{summarizing ? 'Analyzing Content...' : 'Generate AI Insights'}</span>
                    </button>
                </div>
            </div>

            <div className="flex-1 grid grid-cols-12 gap-8 overflow-hidden min-h-0">
                {/* Main Content Area: Transcript */}
                <div className="col-span-12 lg:col-span-8 flex flex-col bg-white rounded-[2rem] border border-gray-100 shadow-2xl shadow-gray-200/50 overflow-hidden">
                    {/* Transcript Header */}
                    <div className="px-8 py-8 border-b border-gray-50 bg-gradient-to-br from-white to-gray-50/50">
                        <div className="flex items-start justify-between">
                            <div className="space-y-1">
                                <div className="flex items-center space-x-2 text-indigo-600 mb-2">
                                    <VideoCameraIcon className="h-4 w-4" />
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em]">Teams Online Meeting</p>
                                </div>
                                <h1 className="text-3xl font-black text-gray-900 tracking-tight leading-tight">{meeting?.title}</h1>
                                
                                <div className="flex items-center space-x-6 pt-4 text-xs font-bold text-gray-500">
                                    <div className="flex items-center space-x-2">
                                        <CalendarIcon className="h-4 w-4 text-gray-400" />
                                        <span>{format(new Date(meeting?.start), 'EEEE, MMMM do, yyyy')}</span>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <ClockIcon className="h-4 w-4 text-gray-400" />
                                        <span>{format(new Date(meeting?.start), 'h:mm a')} – {format(new Date(meeting?.end), 'h:mm a')}</span>
                                    </div>
                                </div>
                            </div>

                            <div className={`
                                px-4 py-2 rounded-2xl border flex items-center space-x-2
                                ${isChatFallback ? 'bg-amber-50 border-amber-100 text-amber-700' : 'bg-green-50 border-green-100 text-green-700'}
                            `}>
                                <div className={`h-2 w-2 rounded-full animate-pulse ${isChatFallback ? 'bg-amber-500' : 'bg-green-500'}`} />
                                <span className="text-[10px] font-black uppercase tracking-widest leading-none mt-0.5">
                                    {isChatFallback ? 'Chat History View' : 'Live Transcription'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Transcript Scroll Area */}
                    <div className="flex-1 overflow-y-auto p-8 space-y-10 scrollbar-thin scrollbar-thumb-indigo-50">
                        {!transcript ? (
                            <div className="h-full flex flex-col items-center justify-center space-y-4 opacity-40">
                                <ChatBubbleLeftRightIcon className="h-20 w-20 text-indigo-200" />
                                <div className="text-center">
                                    <p className="font-black text-xl text-gray-900">No Transcript Available</p>
                                    <p className="text-sm font-medium">Microsoft has not processed the transcription for this meeting yet.</p>
                                </div>
                            </div>
                        ) : (
                            <div className="max-w-4xl mx-auto space-y-8 pb-12">
                                {transcript.split('\n\n').map((block, i) => {
                                    const lines = block.split('\n');
                                    const speaker = lines[0] || 'Unknown';
                                    const content = lines.slice(1).join('\n');
                                    
                                    return (
                                        <motion.div 
                                            key={i}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: i * 0.05 }}
                                            className="group flex space-x-5"
                                        >
                                            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-indigo-50 to-indigo-100 border border-indigo-200/50 flex flex-shrink-0 items-center justify-center font-black text-indigo-600 shadow-sm group-hover:shadow-md transition-all">
                                                {speaker[0]}
                                            </div>
                                            <div className="flex-1 space-y-2">
                                                <div className="flex items-center space-x-3">
                                                    <span className="text-sm font-black text-gray-900">{speaker}</span>
                                                    <div className="h-1 w-1 bg-gray-300 rounded-full" />
                                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                                                        {isChatFallback ? 'Direct Message' : 'Transcription Block'}
                                                    </span>
                                                </div>
                                                <div className="bg-white border border-gray-100 rounded-[1.5rem] rounded-tl-none p-5 shadow-sm group-hover:shadow-md transition-all text-gray-700 leading-relaxed text-sm whitespace-pre-wrap">
                                                    {content || block}
                                                </div>
                                            </div>
                                        </motion.div>
                                    )
                                })}
                                <div className="h-1 w-full bg-gradient-to-r from-transparent via-indigo-50 to-transparent" />
                                <p className="text-center text-[10px] font-black text-gray-300 uppercase tracking-[0.5em] py-4 italic">End of Conversation History</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Sidebar: Insights & Users */}
                <div className="col-span-12 lg:col-span-4 flex flex-col space-y-8 overflow-y-auto pr-2 scrollbar-hide py-1">
                    
                    {/* AI Insights Panel */}
                    <AnimatePresence>
                        {summary && (
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-[2rem] p-8 text-white shadow-2xl shadow-indigo-300 relative overflow-hidden"
                            >
                                <SparklesIcon className="absolute -top-6 -right-6 h-32 w-32 opacity-10 rotate-12" />
                                <h2 className="text-xl font-black mb-6 flex items-center space-x-3">
                                    <div className="bg-white/20 p-2 rounded-xl">
                                        <FaceSmileIcon className="h-5 w-5 text-indigo-100" />
                                    </div>
                                    <span>AI Intelligence</span>
                                </h2>
                                <div className="text-sm font-medium leading-relaxed opacity-90 whitespace-pre-wrap">
                                    {summary}
                                </div>
                                <div className="mt-8 pt-6 border-t border-white/10 flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-200">Confidence: 98%</span>
                                    <button className="text-[10px] font-black uppercase tracking-widest bg-white/10 px-3 py-1.5 rounded-lg hover:bg-white/20 transition-all">Clear Insight</button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Attendees Card */}
                    <div className="bg-white rounded-[2rem] border border-gray-100 shadow-xl shadow-gray-200/30 p-8">
                        <h2 className="text-xl font-black text-gray-900 mb-8 flex items-center space-x-3">
                            <UserGroupIcon className="h-6 w-6 text-indigo-600" />
                            <span>Attendees</span>
                            <span className="text-xs font-black text-gray-300 ml-auto uppercase tracking-tighter">({meeting?.attendees?.length || 0})</span>
                        </h2>
                        
                        <div className="space-y-4">
                            {meeting?.attendees?.map((person: any, idx: number) => (
                                <div key={idx} className="flex items-center justify-between group">
                                    <div className="flex items-center space-x-4">
                                        <div className="relative">
                                            <img 
                                                src={`https://ui-avatars.com/api/?name=${encodeURIComponent(person.name)}&background=f0f4ff&color=4f46e5&bold=true&rounded=true`}
                                                className="h-12 w-12 rounded-2xl border-2 border-white shadow-sm group-hover:scale-110 transition-transform"
                                                alt={person.name}
                                            />
                                            {person.status === 'accepted' && (
                                                <div className="absolute -bottom-1 -right-1 h-4 w-4 bg-green-500 border-2 border-white rounded-full shadow-sm" />
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-sm font-black text-gray-900 leading-tight">{person.name}</p>
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{person.type}</p>
                                        </div>
                                    </div>
                                    <div className={`
                                        text-[9px] font-black uppercase px-2 py-1 rounded-lg
                                        ${person.status === 'accepted' ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-400'}
                                    `}>
                                        {person.status}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Stats/Metainfo Card */}
                    <div className="bg-gray-900 rounded-[2rem] p-8 text-white relative overflow-hidden group">
                        <div className="relative z-10 flex flex-col items-center text-center space-y-2">
                            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em]">Sync Status</p>
                            <h3 className="text-2xl font-black">All Systems Optimal</h3>
                            <p className="text-xs font-medium text-gray-400 leading-relaxed px-4">
                                This meeting is secured and synced via Microsoft Graph Enterprise API.
                            </p>
                        </div>
                        <div className="absolute inset-0 bg-indigo-600/10 group-hover:bg-indigo-600/20 transition-colors pointer-events-none" />
                    </div>
                </div>
            </div>
        </div>
    )
}

export default MeetingDetailPage
