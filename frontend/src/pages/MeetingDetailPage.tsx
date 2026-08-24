import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { 
    ChevronLeftIcon, 
    CalendarIcon, 
    ClockIcon, 
    UserGroupIcon,
    ArrowPathIcon,
    SparklesIcon,
    VideoCameraIcon,
    FaceSmileIcon,
    DocumentTextIcon,
    LinkIcon
} from '@heroicons/react/24/outline'
import api from '@/services/api'
import toast from 'react-hot-toast'
import { format } from 'date-fns'


/**
 * `format` from date-fns throws a RangeError on an invalid date, and these calls sit
 * at the top of the render tree with no error boundary under them. The guards here
 * used to test only that the field was present, so any non-empty string Graph could
 * not parse turned the whole page white rather than one line grey.
 *
 * The absent case also read as a bare ", " on screen, which is what is left of an em
 * dash after a find and replace. Say what is actually missing instead.
 */
const safeFormat = (value: string | undefined | null, pattern: string, absent: string) => {
    if (!value) return absent
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? absent : format(d, pattern)
}

// Color palette for speakers, cycles through if > 5 unique speakers
const SPEAKER_PALETTES = [
    { avatar: 'from-indigo-500 to-indigo-600', bubble: 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-100 dark:border-indigo-900/40', text: 'text-indigo-900 dark:text-indigo-300', name: 'text-indigo-700 dark:text-indigo-300' },
    { avatar: 'from-violet-500 to-violet-600', bubble: 'bg-violet-50 dark:bg-violet-900/30 border-violet-100 dark:border-violet-900/40', text: 'text-violet-900 dark:text-violet-300', name: 'text-violet-700 dark:text-violet-300' },
    { avatar: 'from-emerald-500 to-emerald-600', bubble: 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-100 dark:border-emerald-900/40', text: 'text-emerald-900 dark:text-emerald-300', name: 'text-emerald-700 dark:text-emerald-300' },
    { avatar: 'from-rose-500 to-rose-600', bubble: 'bg-rose-50 dark:bg-rose-900/30 border-rose-100 dark:border-rose-900/40', text: 'text-rose-900 dark:text-rose-300', name: 'text-rose-700 dark:text-rose-300' },
    { avatar: 'from-amber-500 to-amber-600', bubble: 'bg-amber-50 dark:bg-amber-900/30 border-amber-100 dark:border-amber-900/40', text: 'text-amber-900 dark:text-amber-300', name: 'text-amber-700 dark:text-amber-300' },
]

const SpeakerTranscript: React.FC<{ transcript: string; isChatFallback: boolean }> = ({ transcript, isChatFallback }) => {
    const blocks = transcript.split('\n\n').filter(Boolean)
    
    // Build speaker → palette map in order of first appearance
    const speakerMap = useMemo(() => {
        const map = new Map<string, number>()
        blocks.forEach(block => {
            const speaker = block.split('\n')[0] || 'Unknown'
            if (!map.has(speaker)) map.set(speaker, map.size % SPEAKER_PALETTES.length)
        })
        return map
    }, [transcript]) // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="max-w-4xl mx-auto space-y-6 pb-12">
            {blocks.map((block, i) => {
                const lines = block.split('\n')
                const speaker = lines[0] || 'Unknown'
                const content = lines.slice(1).join('\n')
                const palette = SPEAKER_PALETTES[speakerMap.get(speaker) ?? 0]
                return (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(i * 0.025, 0.4) }}
                        className="flex space-x-4"
                    >
                        {/* Speaker avatar */}
                        <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${palette.avatar} flex flex-shrink-0 items-center justify-center font-semibold text-white text-sm shadow-sm`}>
                            {speaker[0]?.toUpperCase() || '?'}
                        </div>
                        <div className="flex-1 space-y-1.5">
                            <div className="flex items-center space-x-2">
                                <span className={`text-xs font-semibold ${palette.name}`}>{speaker}</span>
                                <span className="text-xs font-bold text-gray-300 uppercase tracking-tight">
                                    {isChatFallback ? 'chat' : 'transcript'}
                                </span>
                            </div>
                            {/* Colored bubble */}
                            <div className={`${palette.bubble} border rounded-xl rounded-tl-none px-5 py-3.5 shadow-sm`}>
                                <p className={`${palette.text} text-sm leading-relaxed whitespace-pre-wrap`}>{content || block}</p>
                            </div>
                        </div>
                    </motion.div>
                )
            })}
            <p className="text-center text-xs font-semibold text-gray-200 tracking-[0.5em] py-4">: End of Transcript , </p>
        </div>
    )
}

const MeetingDetailPage: React.FC = () => {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const [meeting, setMeeting] = useState<any>(null)
    const [transcript, setTranscript] = useState<string | null>(null)
    const [transcriptMsg, setTranscriptMsg] = useState<string | null>(null)
    const [isChatFallback, setIsChatFallback] = useState(false)
    const [summary, setSummary] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [summarizing, setSummarizing] = useState(false)

    const [transcriptLoading, setTranscriptLoading] = useState(false)

    /**
     * Which meeting the page is currently asking about.
     *
     * Graph is slow and its latency varies a lot, so opening one meeting and then
     * another could easily land the first answer last, leaving one meeting's details
     * and another's transcript on screen together under a single URL. Nothing tied a
     * response back to the id that asked for it.
     *
     * It doubles as the unmount guard: the ref stops matching once this page is gone,
     * so a request still in the air cannot write state or fire a navigation into
     * whatever the user opened next.
     */
    const currentId = useRef<string | undefined>(id)
    useEffect(() => {
        currentId.current = id
        return () => {
            currentId.current = undefined
        }
    }, [id])

    const loadMeetingData = useCallback(async () => {
        setLoading(true)

        // ── Step 1: Load meeting details (critical, navigate away if this fails)
        try {
            const detailsRes = await api.get(`/microsoft/details/${id}`)
            if (currentId.current !== id) return
            setMeeting(detailsRes.data)
            setLoading(false)
        } catch (error: any) {
            if (currentId.current !== id) return
            const msg = error.response?.data?.message || error.message
            toast.error(`Could not load meeting: ${msg}`)
            // No `finally` clearing the spinner after this: it ran after `navigate`
            // had already started tearing the route down, which is a write to a
            // component on its way out for no benefit.
            navigate('/calendar')
            return
        }

        // ── Step 2: Load transcript (non-critical, show message if not available)
        await fetchTranscript()
    }, [id, navigate]) // eslint-disable-line react-hooks/exhaustive-deps

    const fetchTranscript = useCallback(async () => {
        setTranscriptLoading(true)
        try {
            const transcriptRes = await api.get(`/microsoft/transcripts/${id}`)
            if (currentId.current !== id) return
            const { transcript: t, message, isChat, error: tErr } = transcriptRes.data
            setTranscript(t || null)
            setIsChatFallback(!!isChat)
            if (!t) {
                setTranscriptMsg(message || tErr || 'No transcript available for this meeting.')
            }
        } catch (error: any) {
            if (currentId.current !== id) return
            const msg = error.response?.data?.message || error.message
            const isPermission = msg?.toLowerCase().includes('forbidden') ||
                                  msg?.toLowerCase().includes('authorization') ||
                                  error.response?.status === 403
            setTranscriptMsg(
                isPermission
                    ? 'Transcript access requires admin consent in Teams. Ask your Teams admin to enable transcript permissions.'
                    : 'Transcript could not be loaded. The meeting may not have been transcribed.'
            )
        } finally {
            if (currentId.current === id) setTranscriptLoading(false)
        }
    }, [id])

    useEffect(() => {
        loadMeetingData()
    }, [loadMeetingData])

    const handleGenerateAI = async () => {
        setSummarizing(true)
        try {
            const res = await api.get(`/microsoft/summarize/${id}`)
            const { summary: s } = res.data
            if (!s || s === 'No transcript found to summarize.') {
                toast.error('No transcript to summarize. Ensure the meeting was transcribed in Teams.')
            } else {
                setSummary(s)
                toast.success('AI Meeting Summary Generated!')
            }
        } catch (error: any) {
            const msg = error.response?.data?.message || error.message
            toast.error(`AI Summary failed: ${msg}`)
        } finally {
            setSummarizing(false)
        }
    }

    if (loading) {
        return (
            <div className="h-full flex flex-col items-center justify-center p-20">
                <div className="relative mb-8">
                    <div className="h-20 w-20 border-8 border-indigo-50 dark:border-indigo-900/40 rounded-full" />
                    <div className="absolute top-0 h-20 w-20 border-8 border-indigo-600 rounded-full border-t-transparent animate-spin" />
                </div>
                <h3 className="text-2xl font-semibold text-gray-900 dark:text-white tracking-tight">Accessing Meeting Data</h3>
                <p className="text-gray-500 dark:text-gray-400 font-bold tracking-wide text-xs mt-2">Connecting to Microsoft Teams...</p>
            </div>
        )
    }

    return (
        <div className="h-[calc(100vh-100px)] flex flex-col space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <button
                    onClick={() => navigate('/calendar')}
                    className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 hover:text-indigo-600 transition-all font-semibold"
                >
                    <ChevronLeftIcon className="h-5 w-5 stroke-[3px]" />
                    <span className="text-xs tracking-wide">Back to Calendar</span>
                </button>

                <div className="flex items-center space-x-3">
                    {/* Join Meeting Button, grayed out when meeting is over */}
                    {meeting?.joinUrl && (() => {
                        const isOver = meeting?.status === 'Completed' || 
                            (meeting?.end && new Date(meeting.end) < new Date())
                        return isOver ? (
                            <div className="flex items-center space-x-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 cursor-not-allowed select-none">
                                <LinkIcon className="h-4 w-4" />
                                <span>Meeting Ended</span>
                            </div>
                        ) : (
                            <a
                                href={meeting.joinUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center space-x-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-100 dark:border-green-900/40 hover:bg-green-100 dark:hover:bg-green-900/30 transition-all"
                            >
                                <LinkIcon className="h-4 w-4" />
                                <span>Join Meeting</span>
                            </a>
                        )
                    })()}

                    {/* AI Summary Button, always enabled if meeting loaded */}
                    <button
                        onClick={handleGenerateAI}
                        disabled={summarizing}
                        className={`
                            flex items-center space-x-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all
                            ${summarizing
                                ? 'bg-gray-100 dark:bg-gray-800 text-gray-400'
                                : 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:scale-105 active:scale-95 ' +
                                  // shadow-indigo-200 is a near-white shadow. On the light
                                  // theme it reads as a soft lift; on the dark one it became
                                  // a pale halo around the button, brighter than the button
                                  // itself and brighter than anything else on the page. A
                                  // shadow is meant to sit behind a thing, so on dark it is
                                  // cast in the surface's own colour instead of in light.
                                  'shadow-lg shadow-indigo-500/25 dark:shadow-xl dark:shadow-indigo-950/60'}
                        `}
                    >
                        {summarizing ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <SparklesIcon className="h-4 w-4" />}
                        <span>{summarizing ? 'Analyzing...' : 'Generate AI Summary'}</span>
                    </button>
                </div>
            </div>

            <div className="flex-1 grid grid-cols-12 gap-8 overflow-hidden min-h-0">
                {/* Transcript Panel */}
                <div className="col-span-12 lg:col-span-8 flex flex-col bg-white dark:bg-gray-800 rounded-[2rem] border border-gray-100 dark:border-gray-700 shadow-lg shadow-gray-200/50 overflow-hidden">
                    <div className="px-8 py-8 border-b border-gray-50 dark:border-gray-700 bg-gradient-to-br from-white dark:from-gray-800 to-gray-50/50">
                        <div className="flex items-start justify-between">
                            <div className="space-y-1">
                                <div className="flex items-center space-x-2 text-indigo-600 dark:text-indigo-400 mb-2">
                                    <VideoCameraIcon className="h-4 w-4" />
                                    <p className="text-xs font-semibold tracking-normal">Teams Online Meeting</p>
                                </div>
                                <h1 className="text-3xl font-semibold text-gray-900 dark:text-white tracking-tight leading-tight">{meeting?.title}</h1>
                                <div className="flex items-center space-x-6 pt-4 text-xs font-bold text-gray-500 dark:text-gray-400">
                                    <div className="flex items-center space-x-2">
                                        <CalendarIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                                        <span>{safeFormat(meeting?.start, 'EEEE, MMMM do, yyyy', 'Date not recorded')}</span>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <ClockIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                                        <span>
                                            {safeFormat(meeting?.start, 'h:mm a', 'Start not recorded')}
                                            {' to '}
                                            {safeFormat(meeting?.end, 'h:mm a', 'end not recorded')}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/*
                              * Each state carries a dark palette of its own.
                              *
                              * Only the third one did. The other two were bg-amber-50 and
                              * bg-green-50 with no dark variant, so the moment a meeting had
                              * a transcript this badge turned into a near-white block sitting
                              * on a dark navy card, which is how the empty state came to be
                              * the only one that looked deliberate.
                              */}
                            <div className={`
                                px-4 py-2 rounded-xl border flex items-center space-x-2
                                ${isChatFallback
                                    ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-100 dark:border-amber-500/25 text-amber-700 dark:text-amber-300'
                                    : transcript
                                      ? 'bg-green-50 dark:bg-emerald-500/10 border-green-100 dark:border-emerald-500/25 text-green-700 dark:text-emerald-300'
                                      : 'bg-gray-50 dark:bg-white/[0.04] border-gray-100 dark:border-white/10 text-gray-500 dark:text-gray-400'}
                            `}>
                                <div className={`h-2 w-2 rounded-full animate-pulse ${isChatFallback ? 'bg-amber-500' : transcript ? 'bg-green-500' : 'bg-gray-300'}`} />
                                <span className="text-xs font-semibold tracking-wide leading-none mt-0.5">
                                    {transcriptLoading
                                        ? 'Checking'
                                        : isChatFallback
                                          ? 'Chat History'
                                          : transcript
                                            ? 'Live Transcription'
                                            : 'No Transcript'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Transcript Body */}
                    <div className="flex-1 overflow-y-auto p-8 space-y-6 scrollbar-thin scrollbar-thumb-indigo-50">
                        {!transcript ? (
                            // ── Empty state: clean, minimal, not alarming
                            <div className="h-full flex flex-col items-center justify-center space-y-5">
                                <div className="w-16 h-16 rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-700 flex items-center justify-center">
                                    <DocumentTextIcon className="h-8 w-8 text-gray-300" />
                                </div>
                                {/* The verdict waits for the request. `setLoading(false)` fires as
                                    soon as the details land, while the transcript is still on its way,
                                    so this panel used to state flatly that there was no transcript for
                                    the whole time one was being fetched, and then produce one. */}
                                <div className="text-center">
                                    <p className="text-sm font-bold text-gray-500 dark:text-gray-400">
                                        {transcriptLoading ? 'Looking for a transcript…' : 'No transcript yet'}
                                    </p>
                                    <p className="text-xs text-gray-300 mt-1 max-w-xs leading-relaxed">
                                        {transcriptLoading
                                            ? 'Microsoft can take a while to release one after a meeting ends.'
                                            : transcriptMsg ||
                                              'Transcripts appear here after the meeting ends and Microsoft processes them.'}
                                    </p>
                                </div>
                                <button
                                    onClick={() => { setTranscript(null); setTranscriptMsg(null); fetchTranscript() }}
                                    disabled={transcriptLoading}
                                    className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-700 rounded-full text-xs font-bold text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 dark:text-gray-300 hover:border-gray-200 dark:hover:border-gray-700 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-700 transition-all disabled:opacity-50"
                                >
                                    <ArrowPathIcon className={`h-3 w-3 ${transcriptLoading ? 'animate-spin' : ''}`} />
                                    <span>{transcriptLoading ? 'Checking...' : 'Sync transcript'}</span>
                                </button>
                            </div>
                        ) : (
                            <SpeakerTranscript transcript={transcript} isChatFallback={isChatFallback} />
                        )}
                    </div>
                </div>

                {/* Sidebar */}
                <div className="col-span-12 lg:col-span-4 flex flex-col space-y-3 overflow-y-auto pr-2 scrollbar-hide py-1">
                    
                    {/* AI Panel */}
                    <AnimatePresence>
                        {summary && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-xl p-5 text-white shadow-md shadow-indigo-300/30 relative overflow-hidden"
                            >
                                <SparklesIcon className="absolute -top-4 -right-4 h-20 w-20 opacity-10 rotate-12" />
                                <div className="flex items-center justify-between mb-3">
                                    <h2 className="text-sm font-semibold flex items-center space-x-2">
                                        <div className="bg-white/20 p-1.5 rounded-lg">
                                            <FaceSmileIcon className="h-3.5 w-3.5 text-indigo-100" />
                                        </div>
                                        <span>AI Summary</span>
                                    </h2>
                                    <button 
                                        onClick={() => setSummary(null)}
                                        className="text-xs font-semibold tracking-wide bg-white/10 px-2.5 py-1 rounded-lg hover:bg-white/20 transition-all"
                                    >
                                        Clear
                                    </button>
                                </div>
                                <div className="text-xs font-medium leading-relaxed opacity-90 whitespace-pre-wrap max-h-36 overflow-y-auto scrollbar-thin scrollbar-thumb-white/20">{summary}</div>
                                <p className="text-xs font-semibold tracking-wide text-indigo-300 mt-3">Powered by AI</p>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Attendees */}
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-lg shadow-gray-200/30 p-5">
                        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center space-x-2">
                            <UserGroupIcon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                            <span>Attendees</span>
                            <span className="text-xs font-semibold text-gray-300 ml-auto">({meeting?.attendees?.length || 0})</span>
                        </h2>
                        <div className="space-y-3">
                            {(meeting?.attendees || []).length === 0 ? (
                                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-2">No attendees listed</p>
                            ) : /* Keyed by identity. Graph reorders this list between polls and
                                   membership changes, so an index key grafted one person's
                                   presence badge onto another person's row. */
                            (meeting?.attendees ?? []).map((person: any, idx: number) => (
                                <div key={person.email ?? person.id ?? `attendee-${idx}`} className="flex items-center justify-between">
                                    <div className="flex items-center space-x-3">
                                        <div className="relative">
                                            <img
                                                src={`https://ui-avatars.com/api/?name=${encodeURIComponent(person.name)}&background=f0f4ff&color=4f46e5&bold=true&rounded=true`}
                                                className="h-9 w-9 rounded-xl border-2 border-white shadow-sm"
                                                alt={person.name}
                                            />
                                            {person.status === 'accepted' && (
                                                <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 bg-green-500 border-2 border-white rounded-full" />
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-xs font-semibold text-gray-900 dark:text-white leading-tight">{person.name}</p>
                                            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 tracking-wide">{person.type}</p>
                                        </div>
                                    </div>
                                    <div className={`text-xs font-semibold uppercase px-2 py-0.5 rounded-lg ${person.status === 'accepted' ? 'bg-green-50 text-green-600 dark:text-green-400' : 'bg-gray-50 dark:bg-gray-900/40 text-gray-400'}`}>
                                        {person.status}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Status Card */}
                    <div className="bg-gray-900 rounded-xl p-5 text-white relative overflow-hidden group">
                        <div className="relative z-10 flex items-center justify-between">
                            <div>
                                <p className="text-xs font-semibold text-indigo-400 tracking-[0.3em] mb-1">Meeting Status</p>
                                <h3 className={`text-lg font-semibold ${meeting?.status === 'Live' ? 'text-green-400' : meeting?.status === 'Completed' ? 'text-gray-300' : 'text-white'}`}>
                                    {meeting?.status || 'Upcoming'}
                                </h3>
                            </div>
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 text-right leading-relaxed max-w-[100px]">Synced via Microsoft Graph API</p>
                        </div>
                        <div className="absolute inset-0 bg-indigo-600/10 group-hover:bg-indigo-600/20 transition-colors pointer-events-none" />
                    </div>
                </div>
            </div>
        </div>
    )
}

export default MeetingDetailPage
