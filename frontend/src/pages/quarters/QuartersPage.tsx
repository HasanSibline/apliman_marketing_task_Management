import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
    PlusIcon,
    ChevronRightIcon,
    CheckCircleIcon,
    XMarkIcon,
    FlagIcon,
    CalendarIcon,
    LockClosedIcon,
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
    assignedTo?: { name: string }
}

interface QuarterDetail extends Quarter {
    tasks: Task[]
}

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
    UPCOMING: { label: 'Upcoming', bg: 'bg-gray-100 text-gray-700', dot: 'bg-gray-400' },
    ACTIVE: { label: 'Active', bg: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
    CLOSED: { label: 'Closed', bg: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
}

const QUARTER_NAMES = ['Q1', 'Q2', 'Q3', 'Q4']

// ─── Create Quarter Modal ─────────────────────────────────────────────────────
function CreateQuarterModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
    const [form, setForm] = useState({ name: 'Q1', year: new Date().getFullYear(), startDate: '', endDate: '', status: 'ACTIVE' })
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            await api.post('/quarters', form)
            toast.success('Quarter created!')
            onCreated()
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Failed to create quarter')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
                <div className="flex items-center justify-between mb-5">
                    <h2 className="text-lg font-semibold text-gray-900">Create Quarter</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <XMarkIcon className="h-5 w-5" />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Quarter</label>
                            <select value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="select-field">
                                {QUARTER_NAMES.map(q => <option key={q}>{q}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
                            <input type="number" value={form.year} onChange={e => setForm(p => ({ ...p, year: +e.target.value }))}
                                className="input-field" min={2020} max={2100} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                            <input type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))}
                                className="input-field" required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                            <input type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))}
                                className="input-field" required />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                        <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className="select-field">
                            <option value="UPCOMING">Upcoming</option>
                            <option value="ACTIVE">Active</option>
                            <option value="CLOSED">Closed</option>
                        </select>
                    </div>
                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
                        <button type="submit" disabled={loading} className="btn-primary flex-1">
                            {loading ? 'Creating…' : 'Create Quarter'}
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
            toast.success('Quarter closed!')
            onClosed()
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Failed to close quarter')
        } finally {
            setLoading(false)
        }
    }

    const otherQuarters = quarters.filter(q => q.id !== quarter.id && q.status !== 'CLOSED')

    return (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
                <div className="p-6 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900">Close {quarter.name} {quarter.year}</h2>
                            <p className="text-sm text-gray-500 mt-0.5">Select tasks to roll over to the next quarter</p>
                        </div>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><XMarkIcon className="h-5 w-5" /></button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {incompleteTasks.length === 0 ? (
                        <div className="text-center py-8">
                            <CheckCircleIcon className="h-12 w-12 text-green-400 mx-auto mb-2" />
                            <p className="text-gray-500 font-medium">All tasks completed!</p>
                            <p className="text-sm text-gray-400">Nothing to roll over.</p>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-medium text-gray-700">{incompleteTasks.length} incomplete tasks</p>
                                <button onClick={() => setSelected(new Set(incompleteTasks.map(t => t.id)))}
                                    className="text-xs text-primary-600 hover:text-primary-700 font-medium">Select all</button>
                            </div>
                            <div className="space-y-2">
                                {incompleteTasks.map(task => (
                                    <label key={task.id}
                                        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition
                      ${selected.has(task.id) ? 'border-primary-300 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
                                        <input type="checkbox" checked={selected.has(task.id)} onChange={() => toggle(task.id)}
                                            className="mt-0.5 h-4 w-4 text-primary-600 rounded" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-800 truncate">{task.title}</p>
                                            <p className="text-xs text-gray-400">{task.assignedTo?.name ?? 'Unassigned'} · {task.phase.replace(/_/g, ' ')}</p>
                                        </div>
                                        {selected.has(task.id) && (
                                            <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium shrink-0">
                                                Roll over
                                            </span>
                                        )}
                                    </label>
                                ))}
                            </div>
                        </>
                    )}

                    {otherQuarters.length > 0 && selected.size > 0 && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Roll tasks into:</label>
                            <select value={nextQuarterId} onChange={e => setNextQuarterId(e.target.value)} className="select-field">
                                <option value="">No quarter (unassigned)</option>
                                {otherQuarters.map(q => (
                                    <option key={q.id} value={q.id}>{q.name} {q.year}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-gray-200 flex gap-3">
                    <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
                    <button onClick={handleClose} disabled={loading} className="btn-danger flex-1 flex items-center justify-center gap-2">
                        <LockClosedIcon className="h-4 w-4" />
                        {loading ? 'Closing…' : `Close Quarter${selected.size > 0 ? ` · ${selected.size} rolled` : ''}`}
                    </button>
                </div>
            </motion.div>
        </div>
    )
}

// (QuarterCard removed in favor of table view)
// ─── Main Page ────────────────────────────────────────────────────────────────
const QuartersPage: React.FC = () => {
    const navigate = useNavigate()
    const { user } = useAppSelector(state => state.auth)
    const isAdmin = ['COMPANY_ADMIN', 'ADMIN', 'SUPER_ADMIN'].includes(user?.role ?? '')
    const canEdit = isAdmin || user?.strategyAccess === 'EDIT'
    const [quarters, setQuarters] = useState<Quarter[]>([])
    const [loading, setLoading] = useState(true)
    const [showCreate, setShowCreate] = useState(false)
    const [closeTarget, setCloseTarget] = useState<QuarterDetail | null>(null)
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
    const [yearlyData, setYearlyData] = useState<any>(null)

    useEffect(() => { fetchQuarters(); fetchYearly() }, [selectedYear])

    const fetchQuarters = async () => {
        setLoading(true)
        try {
            const { data } = await api.get('/quarters')
            setQuarters(data)
        } catch {
            toast.error('Failed to load quarters')
        } finally {
            setLoading(false)
        }
    }

    const fetchYearly = async () => {
        try {
            const { data } = await api.get(`/quarters/yearly?year=${selectedYear}`)
            setYearlyData(data)
        } catch { /* silent */ }
    }

    const openCloseModal = async (quarter: Quarter) => {
        try {
            const { data } = await api.get(`/quarters/${quarter.id}`)
            setCloseTarget(data)
        } catch {
            toast.error('Failed to load quarter details')
        }
    }

    const years: number[] = Array.from(new Set(quarters.map(q => q.year))).sort((a: number, b: number) => b - a)
    if (!years.includes(selectedYear)) years.unshift(selectedYear)

    return (
        <div className="space-y-6">
            {showCreate && (
                <CreateQuarterModal
                    onClose={() => setShowCreate(false)}
                    onCreated={() => { setShowCreate(false); fetchQuarters(); fetchYearly() }}
                />
            )}
            {closeTarget && (
                <CloseQuarterModal
                    quarter={closeTarget}
                    quarters={quarters}
                    onClose={() => setCloseTarget(null)}
                    onClosed={() => { setCloseTarget(null); fetchQuarters(); fetchYearly() }}
                />
            )}

            {/* Header */}
            <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-lg p-6 text-white">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold mb-1">Quarters</h1>
                        <p className="text-primary-100">Manage task cycles and track quarterly performance</p>
                    </div>
                    {canEdit && (
                        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 bg-white text-primary-700 rounded-lg font-semibold text-sm hover:bg-primary-50 transition">
                            <PlusIcon className="h-4 w-4" />
                            New Quarter
                        </button>
                    )}
                </div>
            </div>

            {/* Yearly summary */}
            {yearlyData && yearlyData.quarters.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-base font-semibold text-gray-900">Year Overview</h2>
                        <select value={selectedYear} onChange={e => setSelectedYear(+e.target.value)} className="select-field w-auto text-sm">
                            {years.map((y: number) => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                        {yearlyData.quarters.map((q: any) => (
                            <div key={q.quarter} className="text-center p-3 bg-gray-50 rounded-lg">
                                <p className="text-xs text-gray-500 mb-1">{q.quarter}</p>
                                <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden mb-1">
                                    <div className="h-full bg-primary-500 rounded-full" style={{ width: `${q.completionRate}%` }} />
                                </div>
                                <p className="text-sm font-bold text-gray-800">{q.completionRate}%</p>
                            </div>
                        ))}
                    </div>
                    <div className="flex gap-6 text-sm text-gray-500 border-t border-gray-100 pt-3">
                        <span>Total tasks: <strong className="text-gray-800">{yearlyData.summary.totalTasks}</strong></span>
                        <span>Completed: <strong className="text-green-700">{yearlyData.summary.completedTasks}</strong></span>
                        <span>Overall rate: <strong className="text-primary-700">{yearlyData.summary.overallCompletionRate}%</strong></span>
                    </div>
                </div>
            )}

            {/* Quarters Table */}
            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="spinner h-8 w-8" />
                </div>
            ) : quarters.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                    <CalendarIcon className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No quarters yet</p>
                    <p className="text-sm text-gray-400 mb-4">Create your first quarter to start tracking task cycles</p>
                    {canEdit && (
                        <button onClick={() => setShowCreate(true)} className="btn-primary">Create First Quarter</button>
                    )}
                </div>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Quarter</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Duration</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Objectives</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-64">Task Progress</th>
                                    <th scope="col" className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {quarters.map(q => {
                                    const cfg = STATUS_CONFIG[q.status];
                                    const completionPct = q.totalTasks > 0 ? Math.round((q.completedTasks / q.totalTasks) * 100) : 0;
                                    return (
                                        <motion.tr 
                                            key={q.id} 
                                            initial={{ opacity: 0, y: 10 }} 
                                            animate={{ opacity: 1, y: 0 }}
                                            className="hover:bg-gray-50 transition-colors cursor-pointer group"
                                            onClick={() => navigate(`/quarters/${q.id}`)}
                                        >
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center">
                                                    <div className="h-10 w-10 shrink-0 rounded-lg bg-primary-50 flex items-center justify-center border border-primary-100">
                                                        <CalendarIcon className="h-5 w-5 text-primary-600" />
                                                    </div>
                                                    <div className="ml-4">
                                                        <div className="text-sm font-bold text-gray-900">{q.name} {q.year}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${cfg.bg}`}>
                                                    <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                                                    {cfg.label}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm text-gray-900">{new Date(q.startDate).toLocaleDateString()}</div>
                                                <div className="text-xs text-gray-500">to {new Date(q.endDate).toLocaleDateString()}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                <div className="flex items-center gap-1.5 font-medium">
                                                    <FlagIcon className="h-4 w-4 text-gray-400" />
                                                    {q.objectivesCount} Objective{q.objectivesCount !== 1 ? 's' : ''}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center justify-between text-xs mb-1">
                                                    <span className="font-medium text-gray-700">{q.completedTasks} / {q.totalTasks} Tasks</span>
                                                    <span className="font-bold text-primary-700">{completionPct}%</span>
                                                </div>
                                                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden w-full">
                                                    <div className={`h-full rounded-full transition-all ${completionPct === 100 ? 'bg-green-500' : 'bg-primary-500'}`}
                                                        style={{ width: `${completionPct}%` }} />
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                <div className="flex items-center justify-end gap-3">
                                                    {q.status === 'ACTIVE' && canEdit && (
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); openCloseModal(q); }}
                                                            className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-100 transition font-medium flex items-center gap-1.5"
                                                        >
                                                            <LockClosedIcon className="h-3.5 w-3.5" /> Close
                                                        </button>
                                                    )}
                                                    <ChevronRightIcon className="h-5 w-5 text-gray-400 group-hover:text-primary-600 transition-colors" />
                                                </div>
                                            </td>
                                        </motion.tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}

export default QuartersPage
