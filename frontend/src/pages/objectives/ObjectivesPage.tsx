import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
    PlusIcon,
    XMarkIcon,
    PencilIcon,
    TrashIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    CheckCircleIcon,
    ExclamationTriangleIcon,
    XCircleIcon,
    FlagIcon,
} from '@heroicons/react/24/outline'
import api from '@/services/api'
import toast from 'react-hot-toast'
import { useAppSelector } from '@/hooks/redux'

// ─── Types ────────────────────────────────────────────────────────────────────
interface KeyResult {
    id: string
    title: string
    unit: string
    startValue: number
    targetValue: number
    currentValue: number
}

interface Objective {
    id: string
    title: string
    description?: string
    status: 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK' | 'COMPLETED' | 'CANCELLED'
    progress: number
    quarter?: { id: string; name: string; year: number }
    keyResults: KeyResult[]
}

interface Quarter {
    id: string
    name: string
    year: number
}

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CFG = {
    ON_TRACK: { label: 'On Track', dot: 'bg-green-500', text: 'text-green-700', bg: 'bg-green-100', Icon: CheckCircleIcon },
    AT_RISK: { label: 'At Risk', dot: 'bg-yellow-500', text: 'text-yellow-700', bg: 'bg-yellow-100', Icon: ExclamationTriangleIcon },
    OFF_TRACK: { label: 'Off Track', dot: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-100', Icon: XCircleIcon },
    COMPLETED: { label: 'Completed', dot: 'bg-blue-500', text: 'text-blue-700', bg: 'bg-blue-100', Icon: CheckCircleIcon },
    CANCELLED: { label: 'Cancelled', dot: 'bg-gray-400', text: 'text-gray-600', bg: 'bg-gray-100', Icon: XMarkIcon },
}

// ─── Progress Ring ────────────────────────────────────────────────────────────
function ProgressRing({ pct, size = 56, stroke = 5 }: { pct: number; size?: number; stroke?: number }) {
    const r = (size - stroke) / 2
    const circ = 2 * Math.PI * r
    const dash = (pct / 100) * circ
    return (
        <svg width={size} height={size} className="-rotate-90">
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E5E7EB" strokeWidth={stroke} />
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#4F46E5" strokeWidth={stroke}
                strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
        </svg>
    )
}

// ─── Key Result bar ───────────────────────────────────────────────────────────
function KRBar({ kr, onUpdate, canEdit }: { kr: KeyResult; onUpdate: (id: string, val: number) => void; canEdit: boolean }) {
    const [editing, setEditing] = useState(false)
    const [val, setVal] = useState(kr.currentValue)
    const pct = kr.targetValue > 0 ? Math.min(Math.round((kr.currentValue / kr.targetValue) * 100), 100) : 0

    const save = () => {
        onUpdate(kr.id, val)
        setEditing(false)
    }

    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">{kr.title}</span>
                <div className="flex items-center gap-2">
                    {editing ? (
                        <>
                            <input type="number" value={val} onChange={e => setVal(+e.target.value)}
                                className="w-20 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500" />
                            <button onClick={save} className="text-xs text-primary-600 font-medium hover:text-primary-700">Save</button>
                            <button onClick={() => setEditing(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                        </>
                    ) : (
                        <>
                            <span className="text-xs text-gray-500">{kr.currentValue} / {kr.targetValue} {kr.unit}</span>
                            <span className={`text-xs font-bold ${pct >= 100 ? 'text-green-700' : pct >= 50 ? 'text-primary-700' : 'text-gray-700'}`}>{pct}%</span>
                            {canEdit && (
                                <button onClick={() => setEditing(true)} className="text-gray-400 hover:text-primary-600 transition">
                                    <PencilIcon className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-green-500' : pct >= 50 ? 'bg-primary-500' : 'bg-yellow-400'}`}
                    style={{ width: `${pct}%` }} />
            </div>
        </div>
    )
}

// ─── Objective Card ───────────────────────────────────────────────────────────
function ObjectiveCard({
    obj, canEdit, onDelete, onRefresh,
}: {
    obj: Objective; canEdit: boolean; onDelete: (id: string) => void; onRefresh: () => void
}) {
    const [expanded, setExpanded] = useState(false)
    const [addingKR, setAddingKR] = useState(false)
    const [krForm, setKrForm] = useState({ title: '', unit: 'number', startValue: 0, targetValue: 100 })
    const cfg = STATUS_CFG[obj.status]

    const updateKR = async (krId: string, currentValue: number) => {
        try {
            await api.patch(`/objectives/key-results/${krId}`, { currentValue })
            onRefresh()
        } catch { toast.error('Failed to update') }
    }

    const addKR = async () => {
        try {
            await api.post(`/objectives/${obj.id}/key-results`, krForm)
            setAddingKR(false)
            setKrForm({ title: '', unit: 'number', startValue: 0, targetValue: 100 })
            onRefresh()
            toast.success('Key result added')
        } catch (err: any) { toast.error(err.response?.data?.message || 'Failed') }
    }

    return (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Header */}
            <div className="p-5">
                <div className="flex items-start gap-4">
                    {/* Progress ring */}
                    <div className="relative shrink-0">
                        <ProgressRing pct={obj.progress} />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-xs font-bold text-gray-700">{obj.progress}%</span>
                        </div>
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <h3 className="text-base font-semibold text-gray-900">{obj.title}</h3>
                                {obj.description && <p className="text-sm text-gray-400 mt-0.5 line-clamp-2">{obj.description}</p>}
                                {obj.quarter && (
                                    <p className="text-xs text-gray-400 mt-1">{obj.quarter.name} {obj.quarter.year}</p>
                                )}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                                    {cfg.label}
                                </span>
                                {canEdit && (
                                    <button onClick={() => onDelete(obj.id)} className="text-gray-400 hover:text-red-500 transition">
                                        <TrashIcon className="h-4 w-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Toggle key results */}
                {obj.keyResults.length > 0 && (
                    <button onClick={() => setExpanded(p => !p)}
                        className="flex items-center gap-1 mt-3 text-xs text-primary-600 hover:text-primary-700 font-medium transition">
                        {expanded ? <ChevronUpIcon className="h-3.5 w-3.5" /> : <ChevronDownIcon className="h-3.5 w-3.5" />}
                        {obj.keyResults.length} Key Result{obj.keyResults.length !== 1 ? 's' : ''}
                    </button>
                )}
            </div>

            {/* Key results */}
            {expanded && (
                <div className="px-5 pb-4 border-t border-gray-100 pt-4 space-y-3 bg-gray-50">
                    {obj.keyResults.map(kr => (
                        <KRBar key={kr.id} kr={kr} canEdit={canEdit} onUpdate={updateKR} />
                    ))}
                    {canEdit && !addingKR && (
                        <button onClick={() => setAddingKR(true)}
                            className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium pt-1">
                            <PlusIcon className="h-3.5 w-3.5" /> Add key result
                        </button>
                    )}
                    {addingKR && (
                        <div className="space-y-2 pt-1 border-t border-gray-200 mt-2">
                            <input placeholder="Key result title" value={krForm.title} onChange={e => setKrForm(p => ({ ...p, title: e.target.value }))}
                                className="input-field text-sm" />
                            <div className="grid grid-cols-3 gap-2">
                                <input type="number" placeholder="Start" value={krForm.startValue} onChange={e => setKrForm(p => ({ ...p, startValue: +e.target.value }))}
                                    className="input-field text-sm" />
                                <input type="number" placeholder="Target" value={krForm.targetValue} onChange={e => setKrForm(p => ({ ...p, targetValue: +e.target.value }))}
                                    className="input-field text-sm" />
                                <select value={krForm.unit} onChange={e => setKrForm(p => ({ ...p, unit: e.target.value }))} className="select-field text-sm">
                                    <option value="number">Number</option>
                                    <option value="percent">%</option>
                                    <option value="currency">$</option>
                                </select>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={addKR} className="btn-primary text-xs py-1.5 px-3">Add</button>
                                <button onClick={() => setAddingKR(false)} className="btn-secondary text-xs py-1.5 px-3">Cancel</button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {canEdit && obj.keyResults.length === 0 && (
                <div className="px-5 pb-4">
                    <button onClick={() => { setExpanded(true); setAddingKR(true) }}
                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-primary-600 font-medium transition">
                        <PlusIcon className="h-3.5 w-3.5" /> Add first key result
                    </button>
                </div>
            )}
        </motion.div>
    )
}

// ─── Create Objective Modal ───────────────────────────────────────────────────
function CreateObjectiveModal({
    quarters, onClose, onCreated,
}: { quarters: Quarter[]; onClose: () => void; onCreated: () => void }) {
    const [form, setForm] = useState({ title: '', description: '', quarterId: '', status: 'ON_TRACK' })
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            await api.post('/objectives', { ...form, quarterId: form.quarterId || undefined })
            toast.success('Objective created!')
            onCreated()
        } catch (err: any) { toast.error(err.response?.data?.message || 'Failed') }
        finally { setLoading(false) }
    }

    return (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
                <div className="flex items-center justify-between mb-5">
                    <h2 className="text-lg font-semibold text-gray-900">New Objective</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><XMarkIcon className="h-5 w-5" /></button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Title <span className="text-red-500">*</span></label>
                        <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                            className="input-field" placeholder="e.g. Grow user base by 30%" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                            className="textarea-field" rows={3} placeholder="What does success look like?" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Quarter</label>
                            <select value={form.quarterId} onChange={e => setForm(p => ({ ...p, quarterId: e.target.value }))} className="select-field">
                                <option value="">No quarter</option>
                                {quarters.map(q => <option key={q.id} value={q.id}>{q.name} {q.year}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                            <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className="select-field">
                                {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
                        <button type="submit" disabled={loading} className="btn-primary flex-1">
                            {loading ? 'Creating…' : 'Create Objective'}
                        </button>
                    </div>
                </form>
            </motion.div>
        </div>
    )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const ObjectivesPage: React.FC = () => {
    const { user } = useAppSelector(state => state.auth)
    const isAdmin = ['COMPANY_ADMIN', 'ADMIN', 'SUPER_ADMIN'].includes(user?.role ?? '')
    const [objectives, setObjectives] = useState<Objective[]>([])
    const [quarters, setQuarters] = useState<Quarter[]>([])
    const [loading, setLoading] = useState(true)
    const [showCreate, setShowCreate] = useState(false)
    const [filterQuarter, setFilterQuarter] = useState('')
    const [filterStatus, setFilterStatus] = useState('')

    useEffect(() => { fetchAll() }, [])

    const fetchAll = async () => {
        setLoading(true)
        try {
            const [{ data: objs }, { data: qs }] = await Promise.all([
                api.get('/objectives'),
                api.get('/quarters'),
            ])
            setObjectives(objs)
            setQuarters(qs)
        } catch { toast.error('Failed to load') }
        finally { setLoading(false) }
    }

    const deleteObjective = async (id: string) => {
        if (!confirm('Delete this objective and all its key results?')) return
        try {
            await api.delete(`/objectives/${id}`)
            setObjectives(prev => prev.filter(o => o.id !== id))
            toast.success('Objective deleted')
        } catch { toast.error('Failed to delete') }
    }

    const filtered = objectives.filter(o => {
        if (filterQuarter && o.quarter?.id !== filterQuarter) return false
        if (filterStatus && o.status !== filterStatus) return false
        return true
    })

    const stats = {
        total: objectives.length,
        onTrack: objectives.filter(o => o.status === 'ON_TRACK').length,
        atRisk: objectives.filter(o => o.status === 'AT_RISK').length,
        completed: objectives.filter(o => o.status === 'COMPLETED').length,
        avgProgress: objectives.length > 0 ? Math.round(objectives.reduce((s, o) => s + o.progress, 0) / objectives.length) : 0,
    }

    return (
        <div className="space-y-6">
            {showCreate && (
                <CreateObjectiveModal
                    quarters={quarters}
                    onClose={() => setShowCreate(false)}
                    onCreated={() => { setShowCreate(false); fetchAll() }}
                />
            )}

            {/* Header */}
            <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-lg p-6 text-white">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold mb-1">Objectives</h1>
                        <p className="text-primary-100">Track company goals and key results (OKRs)</p>
                    </div>
                    {isAdmin && (
                        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 bg-white text-primary-700 rounded-lg font-semibold text-sm hover:bg-primary-50 transition">
                            <PlusIcon className="h-4 w-4" />
                            New Objective
                        </button>
                    )}
                </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {[
                    { label: 'Total', value: stats.total, color: 'text-gray-900' },
                    { label: 'On Track', value: stats.onTrack, color: 'text-green-700' },
                    { label: 'At Risk', value: stats.atRisk, color: 'text-yellow-700' },
                    { label: 'Completed', value: stats.completed, color: 'text-blue-700' },
                    { label: 'Avg Progress', value: `${stats.avgProgress}%`, color: 'text-primary-700' },
                ].map(s => (
                    <div key={s.label} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
                        <p className="text-xs text-gray-500 mb-1">{s.label}</p>
                        <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="flex gap-3 flex-wrap">
                <select value={filterQuarter} onChange={e => setFilterQuarter(e.target.value)}
                    className="select-field w-auto text-sm">
                    <option value="">All quarters</option>
                    {quarters.map(q => <option key={q.id} value={q.id}>{q.name} {q.year}</option>)}
                </select>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                    className="select-field w-auto text-sm">
                    <option value="">All statuses</option>
                    {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
            </div>

            {/* Objectives list */}
            {loading ? (
                <div className="flex justify-center py-12"><div className="spinner h-8 w-8" /></div>
            ) : filtered.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                    <FlagIcon className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No objectives yet</p>
                    <p className="text-sm text-gray-400 mb-4">Create your first objective to track company goals</p>
                    {isAdmin && (
                        <button onClick={() => setShowCreate(true)} className="btn-primary">Create First Objective</button>
                    )}
                </div>
            ) : (
                <div className="space-y-4">
                    {filtered.map(obj => (
                        <ObjectiveCard key={obj.id} obj={obj} canEdit={isAdmin} onDelete={deleteObjective} onRefresh={fetchAll} />
                    ))}
                </div>
            )}
        </div>
    )
}

export default ObjectivesPage
