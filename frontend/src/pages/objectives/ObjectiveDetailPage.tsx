import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
    ChevronLeftIcon,
    PlusIcon,
    CheckCircleIcon,
    XMarkIcon,
    PencilIcon,
    ArrowPathIcon,
    ClipboardDocumentListIcon,
    CalendarIcon as CalendarIconOutline,
    UserCircleIcon,
} from '@heroicons/react/24/outline'
import api from '@/services/api'
import toast from 'react-hot-toast'
import { useAppSelector } from '@/hooks/redux'

// --- Types ---
interface KeyResult {
    id: string
    title: string
    unit: string
    startValue: number
    targetValue: number
    currentValue: number
}


interface Task {
    id: string
    title: string
    phase: string
    dueDate?: string
    assignedTo?: { id: string; name: string; position?: string }
    currentPhase?: { id: string; name: string; color: string }
}

interface ObjectiveDetail {
    id: string
    title: string
    description?: string
    status: 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK' | 'COMPLETED' | 'CANCELLED'
    progress: number
    quarter?: { id: string; name: string; year: number }
    keyResults: KeyResult[]
    tasks: Task[]
}

const STATUS_CFG = {
    ON_TRACK: { label: 'On Track', dot: 'bg-green-500', text: 'text-green-700', bg: 'bg-green-100' },
    AT_RISK: { label: 'At Risk', dot: 'bg-yellow-500', text: 'text-yellow-700', bg: 'bg-yellow-100' },
    OFF_TRACK: { label: 'Off Track', dot: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-100' },
    COMPLETED: { label: 'Completed', dot: 'bg-blue-500', text: 'text-blue-700', bg: 'bg-blue-100' },
    CANCELLED: { label: 'Cancelled', dot: 'bg-gray-400', text: 'text-gray-600', bg: 'bg-gray-100' },
}

const ObjectiveDetailPage: React.FC = () => {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const { user } = useAppSelector((state: any) => state.auth)
    const isAdmin = ['COMPANY_ADMIN', 'ADMIN', 'SUPER_ADMIN'].includes(user?.role ?? '')

    const [obj, setObj] = useState<ObjectiveDetail | null>(null)
    const [loading, setLoading] = useState(true)
    const [addingKR, setAddingKR] = useState(false)
    const [updatingKR, setUpdatingKR] = useState<{ id: string, title: string, current: number, target: number, unit: string } | null>(null)
    const [updatingValue, setUpdatingValue] = useState<string>('')
    const [krForm, setKrForm] = useState({ title: '', unit: 'number', startValue: 0, targetValue: 100 })
    const [showLinkTask, setShowLinkTask] = useState(false)
    const [availableTasks, setAvailableTasks] = useState<Task[]>([])
    const [selectedKRForTask, setSelectedKRForTask] = useState<string>('')

    useEffect(() => {
        fetchDetail()
    }, [id])

    const fetchDetail = async () => {
        setLoading(true)
        try {
            const { data } = await api.get(`/objectives/${id}`)
            setObj(data)
        } catch {
            toast.error('Failed to load objective details')
            navigate('/objectives')
        } finally {
            setLoading(false)
        }
    }

    const fetchAvailableTasks = async () => {
        try {
            const { data } = await api.get('/tasks')
            // Filter out tasks already linked
            const linkedIds = new Set(obj?.tasks.map(t => t.id))
            setAvailableTasks(data.filter((t: any) => !linkedIds.has(t.id)))
        } catch {
            toast.error('Failed to load tasks')
        }
    }

    const updateKR = async (krId: string, currentValue: number) => {
        try {
            await api.patch(`/objectives/key-results/${krId}`, { currentValue })
            fetchDetail()
            toast.success('Updated progress')
        } catch { toast.error('Failed to update Key Result') }
    }

    const addKR = async () => {
        try {
            await api.post(`/objectives/${id}/key-results`, krForm)
            setAddingKR(false)
            setKrForm({ title: '', unit: 'number', startValue: 0, targetValue: 100 })
            fetchDetail()
            toast.success('Key result added')
        } catch (err: any) { toast.error(err.response?.data?.message || 'Failed') }
    }

    const linkTask = async (taskId: string) => {
        try {
            await api.post(`/objectives/${id}/tasks/${taskId}`, {
                keyResultId: selectedKRForTask || undefined,
            })
            toast.success('Task linked')
            setShowLinkTask(false)
            setSelectedKRForTask('')
            fetchDetail()
        } catch {
            toast.error('Failed to link task')
        }
    }

    const unlinkTask = async (taskId: string) => {
        if (!confirm('Unlink this task?')) return
        try {
            await api.delete(`/objectives/${id}/tasks/${taskId}`)
            toast.success('Task unlinked')
            fetchDetail()
        } catch {
            toast.error('Failed to unlink task')
        }
    }

    if (loading) return (
        <div className="flex flex-col items-center justify-center min-h-[400px]">
            <ArrowPathIcon className="h-10 w-10 text-primary-500 animate-spin" />
            <p className="mt-4 text-gray-500 font-medium">Loading objective details...</p>
        </div>
    )

    if (!obj) return null

    const cfg = STATUS_CFG[obj.status]

    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-12">
            {/* Back Button */}
            <button
                onClick={() => navigate('/objectives')}
                className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-primary-600 transition"
            >
                <ChevronLeftIcon className="h-4 w-4" />
                Back to Objectives
            </button>

            {/* Header Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-8">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="space-y-2">
                            <div className="flex items-center gap-3">
                                <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">{obj.title}</h1>
                                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${cfg.bg} ${cfg.text}`}>
                                    <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
                                    {cfg.label}
                                </span>
                            </div>
                            {obj.quarter && (
                                <p className="text-sm text-gray-500 flex items-center gap-1.5 font-medium">
                                    <CalendarIconOutline className="h-4 w-4 border-b border-primary-100" />
                                    {obj.quarter.name} {obj.quarter.year} cycle
                                </p>
                            )}
                            {obj.description && <p className="text-gray-600 max-w-2xl leading-relaxed">{obj.description}</p>}
                        </div>

                        {/* Progress Circle */}
                        <div className="relative shrink-0 flex flex-col items-center gap-2 bg-primary-50 p-6 rounded-2xl border border-primary-100">
                            <div className="relative h-24 w-24">
                                <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
                                    <circle cx="50" cy="50" r="45" fill="none" stroke="#E5E7EB" strokeWidth="8" />
                                    <circle cx="50" cy="50" r="45" fill="none" stroke="#4F46E5" strokeWidth="8"
                                        strokeDasharray={`${(obj.progress / 100) * 283} 283`} strokeLinecap="round" className="transition-all duration-1000" />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="text-xl font-black text-primary-900">{obj.progress}%</span>
                                </div>
                            </div>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-primary-600">Overall Progress</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left: Key Results (2/3) */}
                <div className="lg:col-span-2 space-y-6">
                    <section className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 bg-primary-100 rounded-lg text-primary-600">
                                    <CheckCircleIcon className="h-5 w-5" />
                                </div>
                                <h2 className="text-lg font-bold text-gray-900 tracking-tight">Key Results</h2>
                            </div>
                            {isAdmin && (
                                <button
                                    onClick={() => setAddingKR(true)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 text-white rounded-lg text-xs font-bold hover:bg-primary-700 transition shadow-sm active:scale-95"
                                >
                                    <PlusIcon className="h-3.5 w-3.5" />
                                    Add Key Result
                                </button>
                            )}
                        </div>

                        <div className="p-6 space-y-8">
                            {obj.keyResults.length === 0 ? (
                                <div className="text-center py-10 grayscale opacity-50">
                                    <ClipboardDocumentListIcon className="h-12 w-12 mx-auto text-gray-300" />
                                    <p className="mt-2 text-sm font-medium text-gray-500">No Key Results yet.</p>
                                </div>
                            ) : (
                                obj.keyResults.map(kr => (
                                    <div key={kr.id} className="space-y-3 group">
                                        <div className="flex items-center justify-between">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="font-bold text-gray-900">{kr.title}</span>
                                                <span className="text-xs text-gray-400 font-medium">Target: {kr.targetValue} {kr.unit}</span>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <div className="flex flex-col items-end">
                                                    <span className="text-lg font-black text-gray-900">{kr.currentValue} <span className="text-xs font-medium text-gray-400">{kr.unit}</span></span>
                                                    <span className="text-[10px] font-bold text-gray-400 uppercase">Current Value</span>
                                                </div>
                                                {isAdmin && (
                                                    <button
                                                        onClick={() => {
                                                            setUpdatingKR({ id: kr.id, title: kr.title, current: kr.currentValue, target: kr.targetValue, unit: kr.unit })
                                                            setUpdatingValue(kr.currentValue.toString())
                                                        }}
                                                        className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition"
                                                    >
                                                        <PencilIcon className="h-4 w-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        {/* Progress Bar */}
                                        <div className="relative h-2.5 bg-gray-100 rounded-full overflow-hidden shadow-inner">
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${Math.min((kr.currentValue / kr.targetValue) * 100, 100)}%` }}
                                                className={`absolute h-full rounded-full transition-all ${
                                                    (kr.currentValue / kr.targetValue) >= 1 ? 'bg-gradient-to-r from-green-400 to-green-500' : 'bg-gradient-to-r from-primary-400 to-primary-600'
                                                }`}
                                            />
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </section>
                </div>

                {/* Right: Linked Tasks (1/3) */}
                <div className="space-y-6">
                    <section className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 bg-blue-100 rounded-lg text-blue-600">
                                    <ClipboardDocumentListIcon className="h-5 w-5" />
                                </div>
                                <h2 className="text-lg font-bold text-gray-900 tracking-tight">Linked Tasks</h2>
                            </div>
                            {isAdmin && (
                                <button
                                    onClick={() => { setShowLinkTask(true); fetchAvailableTasks() }}
                                    className="p-1.5 text-gray-400 hover:text-primary-600 transition"
                                >
                                    <PlusIcon className="h-5 w-5" />
                                </button>
                            )}
                        </div>

                        <div className="p-4 space-y-3">
                            {obj.tasks.length === 0 ? (
                                <p className="text-sm text-center py-6 text-gray-400 font-medium">No tasks linked to this objective.</p>
                            ) : (
                                obj.tasks.map(task => (
                                    <div key={task.id} className="p-3 bg-gray-50 rounded-xl border border-gray-100 hover:border-primary-200 transition group relative">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0 flex-1">
                                                <Link to={`/tasks/${task.id}`} className="text-sm font-bold text-gray-900 hover:text-primary-600 truncate block transition-colors">
                                                    {task.title}
                                                </Link>
                                                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                                    {task.currentPhase ? (
                                                        <span 
                                                            className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm"
                                                            style={{ 
                                                                backgroundColor: `${task.currentPhase.color}15`, 
                                                                color: task.currentPhase.color,
                                                                border: `1px solid ${task.currentPhase.color}30`
                                                            }}
                                                        >
                                                            {task.currentPhase.name}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[10px] font-bold text-gray-400 px-1.5 py-0.5 bg-white border border-gray-200 rounded uppercase tracking-wider">
                                                            {task.phase.replace(/_/g, ' ')}
                                                        </span>
                                                    )}
                                                    
                                                    {task.assignedTo && (
                                                        <div className="flex items-center gap-1 text-[10px] text-gray-500 font-semibold bg-gray-100 px-1.5 py-0.5 rounded-md">
                                                            <UserCircleIcon className="h-3 w-3" />
                                                            {task.assignedTo.name}
                                                        </div>
                                                    )}

                                                    {task.dueDate && (
                                                        <span className="text-[10px] text-gray-400 flex items-center gap-1 font-medium bg-gray-50 px-1.5 py-0.5 rounded-md border border-gray-100">
                                                            <CalendarIconOutline className="h-3 w-3 text-gray-300" />
                                                            {new Date(task.dueDate).toLocaleDateString()}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                {isAdmin && (
                                                    <button
                                                        onClick={() => unlinkTask(task.id)}
                                                        className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                                        title="Unlink Task"
                                                    >
                                                        <XMarkIcon className="h-4 w-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </section>
                </div>
            </div>

            {/* Link Task Modal */}
            {showLinkTask && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]">
                        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                            <h3 className="text-xl font-black text-gray-900">Link Task to Objective</h3>
                            <button onClick={() => setShowLinkTask(false)} className="text-gray-400 hover:text-gray-600">
                                <XMarkIcon className="h-6 w-6" />
                            </button>
                        </div>
                        <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                            <label className="block text-sm font-bold text-gray-700 mb-1.5">Optional: Assign to a Key Result</label>
                            <select 
                                value={selectedKRForTask} 
                                onChange={(e) => setSelectedKRForTask(e.target.value)}
                                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all text-sm font-medium"
                            >
                                <option value="">None (Link to Objective overall)</option>
                                {obj.keyResults.map(kr => (
                                    <option key={kr.id} value={kr.id}>{kr.title}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-2">
                            {availableTasks.length === 0 ? (
                                <p className="text-center py-10 text-gray-500 font-medium">All tasks are already linked or none found.</p>
                            ) : (
                                availableTasks.map(task => (
                                    <button
                                        key={task.id}
                                        onClick={() => linkTask(task.id)}
                                        className="w-full text-left p-4 hover:bg-primary-50 rounded-xl border border-transparent hover:border-primary-100 transition group flex items-center justify-between"
                                    >
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-gray-900 group-hover:text-primary-700 truncate">{task.title}</p>
                                            <p className="text-xs text-gray-400 mt-0.5 font-medium">{task.phase.replace(/_/g, ' ')}</p>
                                        </div>
                                        <PlusIcon className="h-5 w-5 text-gray-300 group-hover:text-primary-600" />
                                    </button>
                                ))
                            )}
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Add KR Modal */}
            {addingKR && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                        className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-black text-gray-900">New Key Result</h3>
                            <button onClick={() => setAddingKR(false)} className="text-gray-400 hover:text-gray-600">
                                <XMarkIcon className="h-6 w-6" />
                            </button>
                        </div>
                        <form onSubmit={(e) => { e.preventDefault(); addKR() }} className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Key Result Title</label>
                                <input value={krForm.title} onChange={e => setKrForm(p => ({ ...p, title: e.target.value }))}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all text-sm font-medium"
                                    placeholder="e.g. 50 new subscribers" required />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Target Value</label>
                                    <input type="number" value={krForm.targetValue} onChange={e => setKrForm(p => ({ ...p, targetValue: +e.target.value }))}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all text-sm font-medium"
                                        required />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Unit</label>
                                    <select value={krForm.unit} onChange={e => setKrForm(p => ({ ...p, unit: e.target.value }))}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all text-sm font-medium">
                                        <option value="number">Number</option>
                                        <option value="percent">%</option>
                                        <option value="currency">$</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex gap-3 pt-4">
                                <button type="button" onClick={() => setAddingKR(false)} className="flex-1 px-4 py-3 rounded-xl bg-gray-100 text-gray-700 font-bold hover:bg-gray-200 transition">Cancel</button>
                                <button type="submit" className="flex-1 px-4 py-3 rounded-xl bg-primary-600 text-white font-bold hover:bg-primary-700 transition shadow-lg shadow-primary-200">Add KR</button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}

            {/* Update KR Modal */}
            {updatingKR && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-gray-100">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-black text-gray-900 tracking-tight">Update Value</h3>
                            <button onClick={() => setUpdatingKR(null)} className="text-gray-400 hover:text-gray-600">
                                <XMarkIcon className="h-6 w-6" />
                            </button>
                        </div>
                        <div className="mb-4 bg-gray-50 p-3 rounded-xl border border-gray-100">
                            <p className="text-sm font-bold text-gray-700">{updatingKR.title}</p>
                            <p className="text-xs text-gray-500 font-medium mt-0.5">Target: {updatingKR.target} {updatingKR.unit}</p>
                        </div>
                        <form onSubmit={(e) => { 
                            e.preventDefault(); 
                            if (!isNaN(+updatingValue)) {
                                updateKR(updatingKR.id, +updatingValue);
                                setUpdatingKR(null);
                            }
                        }} className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Current Value</label>
                                <input 
                                    type="number" 
                                    value={updatingValue} 
                                    onChange={e => setUpdatingValue(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all text-sm font-medium"
                                    required autoFocus 
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setUpdatingKR(null)} className="flex-1 px-4 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-bold hover:bg-gray-200 transition">Cancel</button>
                                <button type="submit" className="flex-1 px-4 py-2.5 rounded-xl bg-primary-600 text-white font-bold hover:bg-primary-700 transition shadow-lg shadow-primary-200">Save</button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}
        </div>
    )
}

export default ObjectiveDetailPage
