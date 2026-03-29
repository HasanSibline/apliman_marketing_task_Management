import React, { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
    PlusIcon,
    CheckCircleIcon,
    XMarkIcon,
    FlagIcon,
    LockClosedIcon,
    FolderIcon,
    InboxIcon,
    EyeIcon,
    TicketIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    ArchiveBoxIcon,
    SparklesIcon,
} from '@heroicons/react/24/outline'
import api, { tasksApi } from '@/services/api'
import toast from 'react-hot-toast'
import { useAppSelector } from '@/hooks/redux'
import CreateTaskModal from '@/components/tasks/CreateTaskModal'

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

const SCROLLBAR_SHIELD = `
    .no-scrollbar::-webkit-scrollbar { display: none; }
    .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
`;

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
    const [showQuickCreate, setShowQuickCreate] = useState(false)
    const [movingTask, setMovingTask] = useState<Task | null>(null)
    const [closeTarget, setCloseTarget] = useState<QuarterDetail | null>(null)
    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear())
    const scrollRef = useRef<HTMLDivElement>(null)

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
            
            // Auto-select the latest year if the current year has no data
            const availableYears = Array.from(new Set(data.map((q: any) => q.year))).sort((a: any, b: any) => b - a) as number[]
            const currentYear = new Date().getFullYear()
            if (availableYears.length > 0 && !availableYears.includes(currentYear)) {
                setSelectedYear(availableYears[0])
            }
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

    const handleMoveTask = async (task: Task, targetQuarterId: string) => {
        try {
            await tasksApi.assignToQuarter(task.id, targetQuarterId)
            toast.success('Task moved to strategic cycle!')
            setMovingTask(null)
            fetchQuarters()
            fetchBacklog()
        } catch {
            toast.error('Failed to move task')
        }
    }

    const scrollShelf = (direction: 'left' | 'right') => {
        if (!scrollRef.current) return
        const amount = direction === 'left' ? -300 : 300
        scrollRef.current.scrollBy({ left: amount, behavior: 'smooth' })
    }

    const isYearCompleted = (year: number) => {
        const yearQuarters = quartersByYear[year] || []
        return yearQuarters.length === 4 && yearQuarters.every(q => q.status === 'CLOSED')
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
            <style>{SCROLLBAR_SHIELD}</style>
            
            {showQuickCreate && (
                <CreateTaskModal 
                    isOpen={showQuickCreate} 
                    onClose={() => { setShowQuickCreate(false); fetchBacklog(); fetchQuarters(); }} 
                />
            )}

            {movingTask && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4 text-left">
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                        className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 border border-gray-100">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-lg font-black text-gray-900 leading-none">Move to Cycle</h3>
                                <p className="text-xs text-gray-500 mt-1 font-medium truncate max-w-[200px]">{movingTask.title}</p>
                            </div>
                            <button onClick={() => setMovingTask(null)} className="text-gray-400 hover:text-gray-600"><XMarkIcon className="h-5 w-5" /></button>
                        </div>
                        
                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 no-scrollbar">
                            {quarters.filter(q => q.status !== 'CLOSED').map(q => (
                                <button
                                    key={q.id}
                                    onClick={() => handleMoveTask(movingTask, q.id)}
                                    className="w-full flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:border-primary-500 hover:bg-primary-50 transition-all group"
                                >
                                    <div className="text-left">
                                        <div className="text-sm font-bold text-gray-900">{q.name} {q.year}</div>
                                        <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest leading-none mt-1">{q.status}</div>
                                    </div>
                                    <ChevronRightIcon className="h-4 w-4 text-gray-300 group-hover:text-primary-500" />
                                </button>
                            ))}
                            {quarters.filter(q => q.status !== 'CLOSED').length === 0 && (
                                <p className="text-center py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">No active cycles available</p>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}

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
                    onClosed={() => { setCloseTarget(null); fetchQuarters(); fetchBacklog(); }}
                />
            )}

            {/* Header (Aligned with Objectives Page) */}
            <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-xl p-8 text-white shadow-sm border border-primary-500/20 relative overflow-hidden">
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <div className="flex items-center gap-2 mb-2 font-bold text-primary-100 uppercase tracking-widest text-xs">
                            <FlagIcon className="h-4 w-4" />
                            Strategy Hub
                        </div>
                        <h1 className="text-3xl font-black mb-1 leading-tight">Roadmap & Archives</h1>
                        <p className="text-primary-50 font-medium max-w-lg">Advanced strategic planning, yearly lifecycle management, and task standby vault.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        {isAdmin && (
                            <button onClick={() => setShowQuickCreate(true)} className="flex items-center gap-2 px-4 py-2.5 bg-primary-500 text-white border border-primary-400 rounded-lg font-bold text-sm hover:bg-primary-400 active:scale-95 transition-all shadow-sm">
                                <SparklesIcon className="h-5 w-5" />
                                New Idea
                            </button>
                        )}
                        {isAdmin && (
                            <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 bg-white text-primary-700 rounded-lg font-bold text-sm hover:bg-primary-50 active:scale-95 transition-all shadow-sm">
                                <PlusIcon className="h-5 w-5" />
                                Start Year
                            </button>
                        )}
                    </div>
                </div>
                {/* Decorative element */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-20 -mt-20 blur-3xl pointer-events-none" />
            </div>

            {/* Strategy Vault Shelf (Horizontal Scroll) */}
            <div className="space-y-4">
                <div className="flex items-center justify-between px-2">
                    <h2 className="text-sm font-black text-gray-900 tracking-tight uppercase">Strategy Vaults</h2>
                    <div className="flex items-center gap-4 text-[10px] font-bold text-gray-500">
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" /> Active</span>
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-indigo-500" /> Planned</span>
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-gray-400" /> Archived</span>
                    </div>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-2">
                        <div className="spinner h-8 w-8 border-2 border-primary-500 border-t-transparent animate-spin rounded-full" />
                    </div>
                ) : (
                    <div className="relative group">
                        {/* Scroll Arrows */}
                        <button 
                            onClick={() => scrollShelf('left')}
                            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 p-3 bg-white shadow-xl rounded-full border border-gray-100 opacity-0 group-hover:opacity-100 transition-all hover:scale-110 -ml-5"
                        >
                            <ChevronLeftIcon className="h-4 w-4 text-gray-600 stroke-[2]" />
                        </button>
                        <button 
                            onClick={() => scrollShelf('right')}
                            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 p-3 bg-white shadow-xl rounded-full border border-gray-100 opacity-0 group-hover:opacity-100 transition-all hover:scale-110 -mr-5"
                        >
                            <ChevronRightIcon className="h-4 w-4 text-gray-600 stroke-[2]" />
                        </button>

                        <div 
                            ref={scrollRef}
                            className="flex overflow-x-auto gap-4 px-2 pb-6 no-scrollbar snap-x scroll-smooth"
                        >
                            {years.map(year => (
                                <motion.button
                                    key={year}
                                    whileHover={{ y: -4 }}
                                    onClick={() => setSelectedYear(year)}
                                    className={`flex-none snap-start w-28 group relative flex flex-col items-center transition-all ${selectedYear === year ? 'scale-105' : 'opacity-70 hover:opacity-100'}`}
                                >
                                    {/* Win Folder Visual (Smaller) */}
                                    <div className="relative w-16 h-14 mb-2">
                                        {/* Folder Tab */}
                                        <div className={`absolute top-0 left-0 w-6 h-1.5 rounded-t-sm transition-colors duration-300
                                            ${selectedYear === year ? 'bg-primary-600' : 'bg-gray-400'}`} />
                                        
                                        {/* Folder Body */}
                                        <div className={`absolute top-1 inset-0 rounded-sm shadow-md border transition-all duration-300
                                            ${selectedYear === year 
                                                ? 'bg-primary-500 border-primary-400' 
                                                : isYearCompleted(year) ? 'bg-gray-100 border-gray-200' : 'bg-white border-gray-300'}`}
                                        >
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <FolderIcon className={`h-6 w-6 transition-colors ${selectedYear === year ? 'text-white' : 'text-gray-300'}`} />
                                            </div>

                                            {/* Quarter Indicators */}
                                            <div className="absolute bottom-1 left-1.2 flex gap-0.5 justify-center w-full">
                                                {quartersByYear[year]?.map(q => (
                                                    <div key={q.id} className={`h-1 w-1 rounded-full ${q.status === 'CLOSED' ? 'bg-gray-400/50' : q.status === 'ACTIVE' ? 'bg-green-400' : 'bg-indigo-400'}`} />
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <span className={`text-[11px] font-black transition-colors ${selectedYear === year ? 'text-primary-700' : 'text-gray-900 uppercase tracking-tight'}`}>{year}</span>
                                    {selectedYear === year && (
                                        <motion.div layoutId="winFolderGlow" className="absolute -inset-2 bg-primary-100/50 rounded-lg -z-10" />
                                    )}

                                    {isYearCompleted(year) && (
                                        <div className="absolute top-0 right-2">
                                            <CheckCircleIcon className="h-3 w-3 text-green-500 bg-white rounded-full" />
                                        </div>
                                    )}
                                </motion.button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Selected Vault Content */}
                <div className="relative">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={selectedYear}
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.98 }}
                            className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm"
                        >
                            {/* Archive Filter: Logic to handle 'Shouldnt they stop appearing if closed' */}
                            {isYearCompleted(selectedYear) ? (
                                <div className="text-center py-12 px-6 bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
                                    <div className="p-4 bg-white rounded-full shadow-sm w-fit mx-auto mb-4 border border-gray-100">
                                        <ArchiveBoxIcon className="h-10 w-10 text-gray-300" />
                                    </div>
                                    <h3 className="text-xl font-black text-gray-900 mb-2">{selectedYear} Strategy Successfully Archived</h3>
                                    <p className="text-sm text-gray-500 max-w-sm mx-auto mb-6">This strategy year has been fully finalized. All cycles are closed and incomplete tasks were migrated to the Standby Vault or next cycle.</p>
                                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                                        <button 
                                            onClick={() => {
                                                // Temporarily "unlock" the view for this session
                                                setSelectedYear(selectedYear) // Toggle a local 'forcedShow' if needed
                                                // For now, let's just show history if they click anyway
                                            }}
                                            className="px-6 py-2 bg-white text-gray-700 font-bold text-xs uppercase tracking-widest border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                                        >
                                            Inspect Historical Records
                                        </button>
                                        {isAdmin && (
                                            <button onClick={() => setShowCreate(true)} className="px-6 py-2 bg-primary-600 text-white font-bold text-xs uppercase tracking-widest rounded-lg hover:bg-primary-700 transition">
                                                Initialize {selectedYear + 1}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 pb-6 border-b border-gray-100 gap-4">
                                        <div className="flex items-center gap-4">
                                            <div className="p-3 bg-primary-50 text-primary-600 rounded-xl">
                                                <FolderIcon className="h-7 w-7" />
                                            </div>
                                            <div>
                                                <h3 className="text-xl font-black text-gray-900 leading-none mb-1">{selectedYear} Strategic Hub</h3>
                                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest leading-none">
                                                    Inside this vault: {quartersByYear[selectedYear]?.length || 0} Cycles · Cycle Planning
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                        {quartersByYear[selectedYear]?.map(q => {
                                            const cfg = STATUS_CONFIG[q.status];
                                            const progress = q.totalTasks > 0 ? Math.round((q.completedTasks / q.totalTasks) * 100) : 0;
                                            return (
                                                <motion.div 
                                                    whileHover={{ y: -4 }}
                                                    key={q.id}
                                                    onClick={() => navigate(`/quarters/${q.id}`)}
                                                    className="bg-white p-6 rounded-xl border border-gray-200 cursor-pointer relative group transition-all hover:shadow-md"
                                                >
                                                    <div className="flex items-center justify-between mb-5">
                                                        <div className="text-base font-black text-gray-900 uppercase tracking-tight">{q.name}</div>
                                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${cfg.bg} border border-black/5`}>
                                                            <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                                                            {cfg.label}
                                                        </span>
                                                    </div>
                                                    
                                                    <div className="space-y-5">
                                                        <div>
                                                            <div className="flex items-center justify-between text-[11px] font-black text-gray-400 uppercase mb-2">
                                                                <span>Completion</span>
                                                                <span className="text-primary-700">{progress}%</span>
                                                            </div>
                                                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden border border-gray-50 shadow-inner">
                                                                <div className={`h-full rounded-full transition-all duration-1000 ${progress === 100 ? 'bg-green-500' : 'bg-primary-600'}`} style={{ width: `${progress}%` }} />
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center justify-between pt-2 border-t border-gray-200/50">
                                                            <div className="flex flex-col">
                                                                <span className="text-base font-black text-gray-900 leading-none">{q.totalTasks}</span>
                                                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Tasks</span>
                                                            </div>
                                                            <div className="flex flex-col text-right">
                                                                <span className="text-base font-black text-gray-900 leading-none">{q.objectivesCount}</span>
                                                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Goals</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Lock Overlay for Upcoming (Strategic Lock) */}
                                                    {q.status === 'UPCOMING' && !isAdmin && (
                                                        <div className="absolute inset-0 bg-white/80 backdrop-blur-[1px] rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                                            <div className="bg-white p-4 rounded-xl shadow-sm flex flex-col items-center gap-1.5 border border-gray-100">
                                                                <LockClosedIcon className="h-6 w-6 text-gray-400" />
                                                                <span className="text-[11px] font-black text-gray-900 uppercase tracking-widest">Vault Locked</span>
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
                                                            className="mt-6 w-full py-2.5 bg-primary-50 hover:bg-primary-600 text-primary-700 hover:text-white border border-primary-200 hover:border-primary-600 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                                                        >
                                                            <CheckCircleIcon className="h-4 w-4" /> Start Cycle
                                                        </button>
                                                    )}
                                                    {isAdmin && q.status === 'ACTIVE' && (
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); openCloseModal(q); }}
                                                            className="mt-6 w-full py-2.5 bg-white hover:bg-red-50 text-gray-400 hover:text-red-600 border border-transparent hover:border-red-200 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                                                        >
                                                            <LockClosedIcon className="h-4 w-4" /> Close Cycle
                                                        </button>
                                                    )}
                                                </motion.div>
                                            )
                                        })}
                                    </div>
                                </>
                            )}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>

            {/* Standby / Backlog Section (Aligned with Objectives Page) */}
            <div className="pt-8">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="p-6 bg-gray-50/50 border-b border-gray-200 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 bg-primary-50 text-primary-600 rounded-xl flex items-center justify-center">
                                <InboxIcon className="h-5 w-5 stroke-[2.5]" />
                            </div>
                            <div>
                                <h2 className="text-lg font-black text-gray-900 leading-none">Standby Vault</h2>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Unassigned Backlog · Total: {backlogTotal}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {isAdmin && (
                                <button onClick={() => setShowQuickCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-primary-50 text-primary-700 border border-primary-100 rounded-lg text-xs font-bold hover:bg-primary-100 transition shadow-sm">
                                    <SparklesIcon className="h-3.5 w-3.5" />
                                    New Idea
                                </button>
                            )}
                            {isAdmin && (
                                <button onClick={() => navigate('/tasks')} className="px-4 py-2 bg-white text-gray-700 border border-gray-200 rounded-lg text-xs font-bold hover:bg-gray-50 transition shadow-sm">
                                    Full Board
                                </button>
                            )}
                        </div>
                    </div>
                    
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-100">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest">Task Details</th>
                                    <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest">Phase</th>
                                    <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest">Assignee</th>
                                    <th className="px-6 py-3 text-right text-[10px] font-bold text-gray-500 uppercase tracking-widest">Action</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-100">
                                {backlogTasks.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-12 text-center text-sm font-medium text-gray-400 italic">No tasks on standby. Your inbox is clear.</td>
                                    </tr>
                                ) : backlogTasks.map(task => (
                                    <tr key={task.id} className="hover:bg-gray-50 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className={`h-8 w-8 rounded-lg flex items-center justify-center border ${task.priority >= 4 ? 'border-red-100 bg-red-50 text-red-500' : 'border-gray-100 bg-gray-50 text-gray-400'}`}>
                                                    <TicketIcon className="h-4 w-4" />
                                                </div>
                                                <div className="text-sm font-bold text-gray-900 truncate max-w-xs">{task.title}</div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-bold uppercase tracking-tight">
                                                {task.phase.replace(/_/g, ' ')}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm font-bold text-gray-500">
                                            {task.assignedTo?.name ?? 'Unassigned'}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2 text-gray-400">
                                                {isAdmin && (
                                                    <button 
                                                        onClick={() => setMovingTask(task)} 
                                                        className="p-2 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors border border-transparent hover:border-primary-100 flex items-center gap-1"
                                                        title="Quick Assign to Strategy Cycle"
                                                    >
                                                        <PlusIcon className="h-4 w-4" />
                                                        <span className="text-[10px] font-bold uppercase">Assign</span>
                                                    </button>
                                                )}
                                                <button onClick={() => navigate(`/tasks/${task.id}`)} className="p-2 hover:text-primary-600 hover:bg-gray-100 rounded-lg transition-colors">
                                                    <EyeIcon className="h-5 w-5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Standby Pagination */}
                    {backlogTotal > 5 && (
                        <div className="p-4 bg-gray-50/50 border-t border-gray-200 flex items-center justify-between">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">Page {backlogPage} of {Math.ceil(backlogTotal / 5)}</span>
                            <div className="flex gap-2">
                                <button 
                                    disabled={backlogPage === 1}
                                    onClick={() => setBacklogPage(p => p - 1)}
                                    className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-600 disabled:opacity-30 hover:bg-gray-50 transition"
                                >
                                    Previous
                                </button>
                                <button 
                                    disabled={backlogPage >= Math.ceil(backlogTotal / 5)}
                                    onClick={() => setBacklogPage(p => p + 1)}
                                    className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-600 disabled:opacity-30 hover:bg-gray-50 transition"
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
