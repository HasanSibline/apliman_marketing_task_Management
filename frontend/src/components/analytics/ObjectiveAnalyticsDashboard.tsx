import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
    BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import { ArrowDownTrayIcon, FunnelIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

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
    status: string
    progress: number
    quarter?: { id: string; name: string; year: number }
    keyResults: KeyResult[]
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6']
const STATUS_COLORS: Record<string, string> = {
    ON_TRACK: '#10B981',
    AT_RISK: '#F59E0B',
    OFF_TRACK: '#EF4444',
    COMPLETED: '#3B82F6',
    CANCELLED: '#9CA3AF'
}

export default function ObjectiveAnalyticsDashboard({ objectives }: { objectives: Objective[] }) {
    const [selectedQuarter, setSelectedQuarter] = useState<string>('ALL')

    const availableQuarters = useMemo(() => {
        const qs = new Set<string>()
        objectives.forEach(o => o.quarter && qs.add(`${o.quarter.year} - ${o.quarter.name}`))
        return Array.from(qs).sort((a, b) => b.localeCompare(a))
    }, [objectives])

    const filteredObjectives = useMemo(() => {
        if (selectedQuarter === 'ALL') return objectives
        return objectives.filter(o => o.quarter && `${o.quarter.year} - ${o.quarter.name}` === selectedQuarter)
    }, [objectives, selectedQuarter])
    
    // Process Data based on filteredObjectives
    const { statusData, quarterData, topObjectives, krData } = useMemo(() => {
        const statuses: Record<string, number> = { ON_TRACK: 0, AT_RISK: 0, OFF_TRACK: 0, COMPLETED: 0, CANCELLED: 0 }
        const quarters: Record<string, { name: string; totalRaw: number; count: number; } > = {}

        const sorted = [...filteredObjectives].sort((a, b) => b.progress - a.progress)
        const top = sorted.slice(0, 5)

        filteredObjectives.forEach(obj => {
            statuses[obj.status] = (statuses[obj.status] || 0) + 1
            if (obj.quarter) {
                const qKey = `${obj.quarter.year} - ${obj.quarter.name}`
                if (!quarters[qKey]) quarters[qKey] = { name: qKey, totalRaw: 0, count: 0 }
                quarters[qKey].totalRaw += obj.progress
                quarters[qKey].count += 1
            }
        })

        const sData = Object.keys(statuses).filter(k => statuses[k] > 0).map(k => ({
            name: k.replace('_', ' '),
            value: statuses[k],
            color: STATUS_COLORS[k] || COLORS[0]
        }))

        const qData = Object.values(quarters).map(q => ({
            name: q.name,
            avgProgress: Math.round(q.totalRaw / q.count)
        }))

        // Sort quarter data chronologically (simplistic sort by year string)
        qData.sort((a, b) => a.name.localeCompare(b.name))

        // Process Key Results for visual chart
        const allKrs: any[] = []
        filteredObjectives.forEach(o => {
            o.keyResults?.forEach(kr => {
                const pct = kr.targetValue > 0 ? (kr.currentValue / kr.targetValue) * 100 : 0
                allKrs.push({
                    name: kr.title.length > 20 ? kr.title.substring(0, 20) + '...' : kr.title,
                    Progress: Math.min(Math.round(pct), 100),
                    Objective: o.title
                })
            })
        })
        
        // Take top 8 KRs to avoid crowding
        const topKrs = allKrs.sort((a,b) => b.Progress - a.Progress).slice(0, 8)

        return { statusData: sData, quarterData: qData, topObjectives: top, krData: topKrs }
    }, [filteredObjectives])

    const exportData = () => {
        try {
            toast.loading('Generating Export...')
            const wb = XLSX.utils.book_new()
            
            // Overview
            const overview = [
                ['Metric', 'Value'],
                ['Total Objectives', objectives.length],
                ['Average Progress', objectives.length ? Math.round(objectives.reduce((acc, o) => acc + o.progress, 0) / objectives.length) + '%' : '0%'],
            ]
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(overview), 'Overview')

            // Objectives Data
            const objData = objectives.map(o => ({
                Title: o.title,
                Status: o.status,
                Progress: o.progress + '%',
                Quarter: o.quarter ? `${o.quarter.year} ${o.quarter.name}` : '-',
                KeyResultsCount: o.keyResults?.length || 0
            }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(objData), 'All Objectives')

            // Key Results Data
            const krData: any[] = []
            objectives.forEach(o => {
                o.keyResults?.forEach(kr => {
                    krData.push({
                        ObjectiveTitle: o.title,
                        KRTitle: kr.title,
                        Current: kr.currentValue,
                        Target: kr.targetValue,
                        Unit: kr.unit,
                        Progress: kr.targetValue > 0 ? Math.round((kr.currentValue / kr.targetValue) * 100) + '%' : '0%'
                    })
                })
            })
            if (krData.length > 0) {
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(krData), 'Key Results')
            }

            const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
            const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
            const url = window.URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `objectives-analytics-${new Date().toISOString().split('T')[0]}.xlsx`
            link.click()
            window.URL.revokeObjectURL(url)
            toast.dismiss()
            toast.success('Successfully exported to Excel')
        } catch (error) {
            toast.dismiss()
            toast.error('Failed to export data')
        }
    }

    if (objectives.length === 0) {
        return (
            <div className="bg-white rounded-2xl p-12 text-center border border-gray-200">
                <p className="text-gray-500 font-medium">Not enough data to display analytics.</p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex-wrap gap-4">
                <h2 className="text-xl font-black text-gray-900">Objectives Analytics</h2>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200">
                        <FunnelIcon className="h-4 w-4 text-gray-500" />
                        <select 
                            value={selectedQuarter} 
                            onChange={e => setSelectedQuarter(e.target.value)}
                            className="bg-transparent text-sm font-bold text-gray-700 focus:outline-none cursor-pointer"
                        >
                            <option value="ALL">All Quarters</option>
                            {availableQuarters.map(q => (
                                <option key={q} value={q}>{q}</option>
                            ))}
                        </select>
                    </div>
                    <button
                        onClick={exportData}
                        className="flex items-center gap-2 px-4 py-2 bg-success-600 text-white rounded-lg hover:bg-success-700 transition shadow-sm font-bold text-sm"
                    >
                        <ArrowDownTrayIcon className="h-4 w-4" />
                        Export Full Report
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Status Distribution */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                    <h3 className="text-lg font-bold text-gray-900 mb-6">Status Distribution</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie 
                                    data={statusData} 
                                    cx="50%" cy="50%" 
                                    innerRadius={45} outerRadius={65} 
                                    paddingAngle={5} dataKey="value"
                                    label={({ name, percent }) => `${name.split(' ')[0]} ${(percent * 100).toFixed(0)}%`}
                                    labelLine={false}
                                >
                                    {statusData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}/>
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </motion.div>

                {/* Progress by Quarter */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                    <h3 className="text-lg font-bold text-gray-900 mb-6">Average Progress by Quarter</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={quarterData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={false} tickLine={false} domain={[0, 100]} />
                                <Tooltip 
                                    cursor={{ fill: '#F3F4F6' }}
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                                    formatter={(value) => [`${value}%`, 'Avg Progress']}
                                />
                                <Bar dataKey="avgProgress" fill="#4F46E5" radius={[6, 6, 0, 0]} maxBarSize={50} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </motion.div>

                {/* Key Results Progress Overview */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 lg:col-span-2">
                    <h3 className="text-lg font-bold text-gray-900 mb-6">Key Results Performance</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={krData} layout="vertical" margin={{ left: 40, right: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#E5E7EB" />
                                <XAxis type="number" domain={[0, 100]} hide />
                                <YAxis 
                                    dataKey="name" 
                                    type="category" 
                                    tick={{ fontSize: 11, fill: '#6B7280' }} 
                                    axisLine={false} 
                                    tickLine={false} 
                                    width={120}
                                />
                                <Tooltip 
                                    cursor={{ fill: '#F3F4F6' }}
                                    formatter={(value) => [`${value}%`, 'Progress']}
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                                />
                                <Bar dataKey="Progress" fill="#10B981" radius={[0, 4, 4, 0]} barSize={20} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </motion.div>

                {/* Top Objectives */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 lg:col-span-2">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">Top Performing Objectives</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="text-xs text-gray-400 font-bold uppercase tracking-wider border-b border-gray-100">
                                    <th className="pb-3 w-1/2">Objective</th>
                                    <th className="pb-3 w-1/4">Quarter</th>
                                    <th className="pb-3 w-1/4 text-right">Progress</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {topObjectives.map(obj => (
                                    <tr key={obj.id}>
                                        <td className="py-3 pr-4 font-bold text-sm text-gray-900">{obj.title}</td>
                                        <td className="py-3 text-sm text-gray-500">{obj.quarter ? `${obj.quarter.year} - ${obj.quarter.name}` : '-'}</td>
                                        <td className="py-3 text-right">
                                            <div className="flex items-center justify-end gap-3">
                                                <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                                                    <div className="h-full bg-success-500" style={{ width: `${obj.progress}%` }} />
                                                </div>
                                                <span className="text-sm font-black text-gray-900">{obj.progress}%</span>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </motion.div>
            </div>
        </div>
    )
}
