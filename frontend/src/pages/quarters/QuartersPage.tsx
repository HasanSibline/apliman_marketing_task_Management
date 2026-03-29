import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
    PlusIcon,
    CheckCircleIcon,
    XMarkIcon,
    FlagIcon,
    CalendarIcon,
    LockClosedIcon,
    FolderIcon,
    InboxIcon,
    ChevronDownIcon,
    EyeIcon,
    TicketIcon,
} from '@heroicons/react/24/outline'
import api from '@/services/api'
import toast from 'react-hot-toast'
import { useAppSelector } from '@/hooks/redux'

// ─── Types ───────────────────────────────────────────────────────────────────
interface Quarter {
    id: string
    name: string
    year: number
    startDate: string
    endDate: string
    status: 'UPCOMING' | 'ACTIVE' | 'CLOSED'
    totalTasks: number
    completedTasks: number
    objectivesCount: number
}

interface Task {
    id: string
    title: string
    phase: string
    priority: number
    assignedTo?: { name: string }
}

interface QuarterDetail extends Quarter {
    tasks: Task[]
}

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
    UPCOMING: { label: 'Upcoming', bg: 'bg-indigo-50 text-indigo-700', dot: 'bg-indigo-400' },
    ACTIVE: { label: 'Active', bg: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
    CLOSED: { label: 'Closed', bg: 'bg-gray-100 text-gray-700', dot: 'bg-gray-400' },
}

const QUARTER_NAMES = ['Q1', 'Q2', 'Q3', 'Q4']

// ─── Create Quarter Modal ─────────────────────────────────────────────────────
function CreateQuarterModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
    const [form, setForm] = useState({ name: 'Q1', year: new Date().getFullYear(), startDate: '', endDate: '', status: 'UPCOMING' })
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            await api.post('/quarters', form)
            toast.success('Strategy cycle created!')
            onCreated()
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Failed to create quarter')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 border border-gray-100">
                <div className="flex items-center justify-between mb-5">
                    <h2 className="text-lg font-bold text-gray-900">New Strategy Cycle</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <XMarkIcon className="h-5 w-5" />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Cycle</label>
                            <select value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="select-field">
                                {QUARTER_NAMES.map(q => <option key={q}>{q}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Year</label>
                            <input type="number" value={form.year} onChange={e => setForm(p => ({ ...p, year: +e.target.value }))}
                                className="input-field" min={2020} max={2100} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Start Date</label>
                            <input type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))}
                                className="input-field" required />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">End Date</label>
                            <input type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))}
                                className="input-field" required />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Status</label>
                        <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as any }))} className="select-field">
                            <option value="UPCOMING">Upcoming (Invisible to team)</option>
                            <option value="ACTIVE">Active (Live now)</option>
                        </select>
                    </div>
                    <div className="flex gap-3 pt-4">
                        <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
                        <button type="submit" disabled={loading} className="btn-primary flex-1">
                            {loading ? 'Creating…' : 'Create Strategy'}
                        </button>
                    </div>
                </form>
            </motion.div>
        </div>
    )
}

// ─── Close Quarter Modal ──────────────────────────────────────────────────────
function CloseQuarterModal({
    quarter,
    quarters,
    onClose,
    onClosed,
}: {
    quarter: QuarterDetail
    quarters: Quarter[]
    onClose: () => void
    onClosed: () => void
}) {
    const incompleteTasks = quarter.tasks.filter(t => !['COMPLETED', 'ARCHIVED'].includes(t.phase))
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [nextQuarterId, setNextQuarterId] = useState('')
    const [loading, setLoading] = useState(false)

    const toggle = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
        })
    }

    const handleClose = async () => {
        setLoading(true)
        try {
            await api.post(`/quarters/${quarter.id}/close`, {
                rolloverTaskIds: Array.from(selected),
                nextQuarterId: nextQuarterId || undefined,
            })
            toast.success('Strategy cycle closed!')
            onClosed()
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Failed to close quarter')
        } finally {
            setLoading(false)
        }
    }

    const otherQuarters = quarters.filter(q => q.id !== quarter.id && q.status !== 'CLOSED')

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col border border-gray-100">
                <div className="p-6 border-b border-gray-100">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Close {quarter.name} | Review Tasks</h2>
                            <p className="text-sm text-gray-500 mt-0.5 font-medium">Any tasks not selected will be moved to <span className="text-primary-600">Standby</span>.</p>
                        </div>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><XMarkIcon className="h-5 w-5" /></button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50/50">
                    {incompleteTasks.length === 0 ? (
                        <div className="text-center py-12">
                            <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-green-200">
                                <CheckCircleIcon className="h-8 w-8 text-green-600" />
                            </div>
                            <p className="text-gray-900 font-bold text-lg">Clean Sweep!</p>
                            <p className="text-sm text-gray-500">Every single task in this quarter is completed.</p>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-sm font-bold text-gray-700 uppercase tracking-tight">{incompleteTasks.length} Incomplete tasks</p>
                                <button onClick={() => setSelected(new Set(incompleteTasks.map(t => t.id)))}
                                    className="text-xs text-primary-600 hover:text-primary-700 font-bold bg-primary-50 px-2 py-1 rounded">Select All Tasks</button>
                            </div>
                            <div className="space-y-2">
                                {incompleteTasks.map(task => (
                                    <label key={task.id}
                                        className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition shadow-sm
                      ${selected.has(task.id) ? 'border-primary-500 bg-primary-50' : 'border-white bg-white hover:border-gray-200'}`}>
                                        <input type="checkbox" checked={selected.has(task.id)} onChange={() => toggle(task.id)}
                                            className="mt-0.5 h-4 w-4 text-primary-600 focus:ring-primary-500 rounded border-gray-300" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-gray-900 truncate">{task.title}</p>
                                            <p className="text-xs text-gray-500 font-medium">{task.assignedTo?.name ?? 'Unassigned'}</p>
                                        </div>
                                        {selected.has(task.id) && (
                                            <span className="text-[10px] bg-primary-600 text-white px-2 py-0.5 rounded-full font-bold shadow-sm uppercase tracking-wider">
                                                Roll Over
                                            </span>
                                        )}
                                    </label>
                                ))}
                            </div>
                        </>
                    )}

                    {otherQuarters.length > 0 && selected.size > 0 && (
                        <div className="mt-6 pt-6 border-t border-gray-200">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Move selected tasks to:</label>
                            <select value={nextQuarterId} onChange={e => setNextQuarterId(e.target.value)} className="select-field border-2 border-gray-200">
                                <option value="">Draft (Standby / No Date)</option>
                                {otherQuarters.map(q => (
                                    <option key={q.id} value={q.id}>{q.name} {q.year} ({q.status})</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                <div className="p-6 bg-white border-t border-gray-100 flex gap-3">
                    <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
                    <button onClick={handleClose} disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700">
                        <LockClosedIcon className="h-4 w-4" />
                        {loading ? 'Processing…' : `Close Cycle`}
                    </button>
                </div>
            </motion.div>
        </div>
    )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const QuartersPage: React.FC = () => {
    const navigate = useNavigate()
    const { user } = useAppSelector(state => state.auth)
    const isAdmin = ['COMPANY_ADMIN', 'ADMIN', 'SUPER_ADMIN'].includes(user?.role ?? '')
    
    const [quarters, setQuarters] = useState<Quarter[]>([])
    const [backlogTasks, setBacklogTasks] = useState<Task[]>([])
    const [backlogPage, setBacklogPage] = useState(1)
    const [backlogTotal, setBacklogTotal] = useState(0)
    
    const [loading, setLoading] = useState(true)
    const [showCreate, setShowCreate] = useState(false)
    const [closeTarget, setCloseTarget] = useState<QuarterDetail | null>(null)
    const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set([new Date().getFullYear()]))

    useEffect(() => { 
        fetchQuarters();
    }, [])

    useEffect(() => {
        fetchBacklog(); 
    }, [backlogPage])

    const fetchQuarters = async () => {
        setLoading(true)
        try {
            const { data } = await api.get('/quarters')
            setQuarters(data)
        } catch {
            toast.error('Failed to load strategy cycles')
        } finally {
            setLoading(false)
        }
    }

    const fetchBacklog = async () => {
        try {
            const { data } = await api.get(`/tasks?quarterId=null&page=${backlogPage}&limit=5`)
            setBacklogTasks(data.tasks)
            setBacklogTotal(data.pagination.total)
        } catch { /* silent */ }
    }

    const openCloseModal = async (quarter: Quarter) => {
        try {
            const { data } = await api.get(`/quarters/${quarter.id}`)
            setCloseTarget(data)
        } catch {
            toast.error('Failed to load detail')
        }
    }

    const toggleYear = (year: number) => {
        setExpandedYears(prev => {
            const next = new Set(prev)
            next.has(year) ? next.delete(year) : next.add(year)
            return next
        })
    }

    // Role-based visibility: Employees only see ACTIVE/CLOSED
    const filteredQuarters = quarters.filter(q => isAdmin || q.status !== 'UPCOMING')
    
    // Group quarters by year
    const quartersByYear = filteredQuarters.reduce((acc, q) => {
        if (!acc[q.year]) acc[q.year] = []
        acc[q.year].push(q)
        return acc
    }, {} as Record<number, Quarter[]>)

    const years = Object.keys(quartersByYear).map(Number).sort((a, b) => b - a)

    return (
        <div className="max-w-7xl mx-auto space-y-8 pb-12">
            {showCreate && (
                <CreateQuarterModal
                    onClose={() => setShowCreate(false)}
                    onCreated={() => { setShowCreate(false); fetchQuarters(); }}
                />
            )}
            {closeTarget && (
                <CloseQuarterModal
                    quarter={closeTarget}
                    quarters={quarters}
                    onClose={() => setCloseTarget(null)}
                    onClosed={() => { setCloseTarget(null); fetchQuarters(); }}
                />
            )}

            {/* Premium Header */}
            <div className="relative overflow-hidden bg-gradient-to-br from-primary-700 via-primary-800 to-primary-900 rounded-3xl p-8 text-white shadow-2xl">
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <div className="flex items-center gap-2 mb-2 font-bold text-primary-200 uppercase tracking-[0.2em] text-xs">
                            <FlagIcon className="h-4 w-4" />
                            Strategy Hub
                        </div>
                        <h1 className="text-4xl font-black mb-2 leading-tight">Roadmap & Archives</h1>
                        <p className="text-primary-100/80 font-medium max-w-lg">Advanced strategic planning, yearly lifecycle management, and task standby vault.</p>
                    </div>
                    {isAdmin && (
                        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-6 py-4 bg-white text-primary-900 rounded-2xl font-bold text-sm hover:scale-105 active:scale-95 transition-all shadow-xl shadow-primary-900/20">
                            <PlusIcon className="h-5 w-5 stroke-[2.5]" />
                            New Cycle
                        </button>
                    )}
                </div>
                {/* Decorative element */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-20 -mt-20 blur-3xl pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-primary-500/10 rounded-full -ml-10 -mb-10 blur-2xl pointer-events-none" />
            </div>

            {/* Strategic Roadmap (Grouped by Year) */}
            <div className="space-y-6">
                <div className="flex items-center justify-between px-2">
                    <h2 className="text-xl font-black text-gray-900 tracking-tight">Strategy Cycles</h2>
                    <div className="flex items-center gap-4 text-xs font-bold text-gray-500">
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" /> Active</span>
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-indigo-500" /> Planned</span>
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-gray-400" /> Archived</span>
                    </div>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3">
                        <div className="spinner h-10 w-10 border-4 border-primary-500 border-t-transparent animate-spin rounded-full" />
                        <p className="text-sm font-bold text-gray-400 animate-pulse">Syncing Strategy...</p>
                    </div>
                ) : years.length === 0 ? (
                    <div className="bg-white rounded-3xl p-16 text-center shadow-sm border-2 border-dashed border-gray-100">
                        <CalendarIcon className="h-16 w-16 text-gray-200 mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-gray-900">No Cycles Found</h3>
                        <p className="text-gray-500 mb-6 max-w-sm mx-auto">Create your first strategic year to begin organizing your work into cycles.</p>
                        {isAdmin && (
                            <button onClick={() => setShowCreate(true)} className="btn-primary">Initialize 2026</button>
                        )}
                    </div>
                ) : (
                    <div className="space-y-8">
                        {years.map(year => (
                            <div key={year} className="space-y-4">
                                {/* Year Folder Header */}
                                <button 
                                    onClick={() => toggleYear(year)}
                                    className={`w-full flex items-center justify-between p-5 rounded-3xl transition-all border-2
                                        ${expandedYears.has(year) 
                                            ? 'bg-white border-primary-500 shadow-lg shadow-primary-900/5' 
                                            : 'bg-gray-50 border-transparent hover:bg-white hover:border-gray-200 shadow-sm'}`}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`p-3 rounded-2xl transition-colors ${expandedYears.has(year) ? 'bg-primary-600 text-white' : 'bg-white text-gray-400 border border-gray-100 shadow-sm'}`}>
                                            <FolderIcon className="h-6 w-6 stroke-[2]" />
                                        </div>
                                        <div className="text-left">
                                            <h3 className="text-lg font-black text-gray-900 leading-none mb-1">{year} Strategy Vault</h3>
                                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                                                {quartersByYear[year].length} Cycles · {quartersByYear[year].filter(q => q.status === 'CLOSED').length === 4 ? 'Fully Archived' : 'In Progress'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {quartersByYear[year].filter(q => q.status === 'CLOSED').length === 4 && (
                                            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-[10px] font-black uppercase tracking-wider border border-gray-200 shadow-sm">
                                                <CheckCircleIcon className="h-3.5 w-3.5" /> Full Year Completed
                                            </span>
                                        )}
                                        <ChevronDownIcon className={`h-5 w-5 text-gray-400 transition-transform duration-300 ${expandedYears.has(year) ? 'rotate-180 text-primary-500' : ''}`} />
                                    </div>
                                </button>

                                {/* Quarters Inside the Year */}
                                <AnimatePresence>
                                    {expandedYears.has(year) && (
                                        <motion.div 
                                            initial={{ opacity: 0, y: -20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -20 }}
                                            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 px-2"
                                        >
                                            {quartersByYear[year].map(q => {
                                                const cfg = STATUS_CONFIG[q.status];
                                                const progress = q.totalTasks > 0 ? Math.round((q.completedTasks / q.totalTasks) * 100) : 0;
                                                return (
                                                    <motion.div 
                                                        whileHover={{ y: -5 }}
                                                        key={q.id}
                                                        onClick={() => navigate(`/quarters/${q.id}`)}
                                                        className="bg-white p-5 rounded-3xl border border-gray-100 shadow-xl shadow-gray-900/5 cursor-pointer relative group transition-all hover:ring-2 hover:ring-primary-500/20"
                                                    >
                                                        <div className="flex items-center justify-between mb-4">
                                                            <div className="text-sm font-black text-gray-900 uppercase tracking-tighter">{q.name}</div>
                                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide ${cfg.bg}`}>
                                                                <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                                                                {cfg.label}
                                                            </span>
                                                        </div>
                                                        
                                                        <div className="space-y-4">
                                                            <div>
                                                                <div className="flex items-center justify-between text-[10px] font-black text-gray-400 uppercase mb-1.5">
                                                                    <span>Progress</span>
                                                                    <span className="text-primary-700">{progress}%</span>
                                                                </div>
                                                                <div className="h-2 bg-gray-100 rounded-full overflow-hidden border border-gray-50 shadow-inner">
                                                                    <div className={`h-full rounded-full transition-all duration-700 ${progress === 100 ? 'bg-green-500' : 'bg-primary-600'}`} style={{ width: `${progress}%` }} />
                                                                </div>
                                                            </div>

                                                            <div className="flex items-center justify-between px-1">
                                                                <div className="flex flex-col">
                                                                    <span className="text-sm font-black text-gray-900">{q.totalTasks}</span>
                                                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-none">Tasks</span>
                                                                </div>
                                                                <div className="flex flex-col text-right">
                                                                    <span className="text-sm font-black text-gray-900">{q.objectivesCount}</span>
                                                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-none">Goals</span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Lock Overlay for Upcoming (Strategic Lock) */}
                                                        {q.status === 'UPCOMING' && !isAdmin && (
                                                            <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] rounded-3xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                                                <div className="bg-white p-3 rounded-2xl shadow-xl flex flex-col items-center gap-1 border border-gray-100">
                                                                    <LockClosedIcon className="h-5 w-5 text-gray-400" />
                                                                    <span className="text-[10px] font-black text-gray-900 uppercase tracking-wider">Locked</span>
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Actions for Admin */}
                                                        {isAdmin && q.status === 'UPCOMING' && (
                                                            <button 
                                                                onClick={async (e) => { 
                                                                    e.stopPropagation(); 
                                                                    try {
                                                                        await api.patch(`/quarters/${q.id}`, { status: 'ACTIVE' });
                                                                        toast.success('Strategy cycle is now LIVE!');
                                                                        fetchQuarters();
                                                                    } catch { toast.error('Failed to start cycle'); }
                                                                }}
                                                                className="mt-4 w-full py-2 bg-primary-50 hover:bg-primary-600 text-primary-700 hover:text-white border border-primary-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                                                            >
                                                                <CheckCircleIcon className="h-3.5 w-3.5" /> Start Cycle
                                                            </button>
                                                        )}
                                                        {isAdmin && q.status === 'ACTIVE' && (
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); openCloseModal(q); }}
                                                                className="mt-4 w-full py-2 bg-gray-50 hover:bg-red-50 text-gray-400 hover:text-red-600 border border-transparent hover:border-red-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                                                            >
                                                                <LockClosedIcon className="h-3.5 w-3.5" /> Close Cycle
                                                            </button>
                                                        )}
                                                    </motion.div>
                                                )
                                            })}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Standby / Backlog Section (Paginated) */}
            <div className="pt-8 border-t border-gray-100">
                <div className="bg-white rounded-3xl shadow-xl shadow-gray-900/10 overflow-hidden border border-gray-100">
                    <div className="p-6 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 bg-white rounded-xl shadow-sm border border-gray-100 flex items-center justify-center text-primary-600">
                                <InboxIcon className="h-5 w-5 stroke-[2.5]" />
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-gray-900 leading-none">Standby Vault</h2>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Unassigned Backlog · Total: {backlogTotal}</p>
                            </div>
                        </div>
                        {isAdmin && (
                            <button onClick={() => navigate('/tasks')} className="px-4 py-2 bg-white text-gray-600 border border-gray-200 rounded-xl text-xs font-bold hover:bg-gray-50 transition shadow-sm">
                                Manage Backlog
                            </button>
                        )}
                    </div>
                    
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-100">
                            <thead className="bg-white">
                                <tr>
                                    <th className="px-6 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Task Details</th>
                                    <th className="px-6 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Phase</th>
                                    <th className="px-6 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Assignee</th>
                                    <th className="px-6 py-3 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Action</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-100">
                                {backlogTasks.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-12 text-center text-sm font-medium text-gray-400 italic">No tasks on standby. Your inbox is clear.</td>
                                    </tr>
                                ) : backlogTasks.map(task => (
                                    <tr key={task.id} className="hover:bg-primary-50/30 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className={`h-8 w-8 rounded-lg flex items-center justify-center border-2 ${task.priority >= 4 ? 'border-red-100 bg-red-50 text-red-500' : 'border-gray-50 bg-gray-50 text-gray-400'}`}>
                                                    <TicketIcon className="h-4 w-4" />
                                                </div>
                                                <div className="text-sm font-bold text-gray-900 truncate max-w-xs">{task.title}</div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-black uppercase tracking-tight">
                                                {task.phase.replace(/_/g, ' ')}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm font-bold text-gray-500">
                                            {task.assignedTo?.name ?? 'Unassigned'}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button onClick={() => navigate(`/tasks/${task.id}`)} className="p-2 text-gray-300 hover:text-primary-600 hover:bg-white rounded-xl transition shadow-none hover:shadow-lg hover:shadow-primary-900/5">
                                                <EyeIcon className="h-5 w-5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Standby Pagination */}
                    {backlogTotal > 5 && (
                        <div className="p-4 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Page {backlogPage} of {Math.ceil(backlogTotal / 5)}</span>
                            <div className="flex gap-2">
                                <button 
                                    disabled={backlogPage === 1}
                                    onClick={() => setBacklogPage(p => p - 1)}
                                    className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-[10px] font-bold text-gray-500 disabled:opacity-30 hover:bg-gray-50 transition"
                                >
                                    Previous
                                </button>
                                <button 
                                    disabled={backlogPage >= Math.ceil(backlogTotal / 5)}
                                    onClick={() => setBacklogPage(p => p + 1)}
                                    className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-[10px] font-bold text-gray-500 disabled:opacity-30 hover:bg-gray-50 transition"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default QuartersPage
