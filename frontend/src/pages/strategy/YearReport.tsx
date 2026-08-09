import React, { useEffect, useState } from 'react'
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line, PieChart, Pie, Cell,
} from 'recharts'
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  ArrowDownTrayIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline'
import { Link } from 'react-router-dom'
import api from '@/services/api'
import toast from 'react-hot-toast'
import EmptyState from '@/components/common/EmptyState'

/**
 * The year in one screen: did the company hit its goals, and where did it not?
 *
 * Read-only. Closing a year changes data; reading one must not, so this can be
 * opened mid-year to see how things stand without committing to anything.
 */

interface Props {
  years: number[]
  year: number
  onYearChange: (year: number) => void
}

interface Report {
  year: number
  verdict: 'achieved' | 'partial' | 'missed' | 'no-goals'
  objectiveRate: number
  summary: {
    quarters: number
    quartersClosed: number
    objectivesTotal: number
    objectivesLanded: number
    objectivesMissed: number
    keyResultsTotal: number
    keyResultsMet: number
    averageObjectiveProgress: number
    tasksTotal: number
    tasksCompleted: number
    taskCompletionRate: number
  }
  quarters: {
    id: string; name: string; status: string
    objectivesTotal: number; objectivesLanded: number; progress: number
    tasksTotal: number; tasksCompleted: number; taskCompletionRate: number
  }[]
  shortfalls: { id: string; title: string; owner: string | null; progress: number; status: string }[]
}

const VERDICT = {
  achieved: {
    label: 'Goals achieved',
    detail: 'Most objectives landed. The year met what it set out to do.',
    Icon: CheckCircleIcon,
    className: 'border-green-200 bg-green-50 text-green-900 dark:border-green-900 dark:bg-green-900/20 dark:text-green-200',
    iconClass: 'text-green-600 dark:text-green-400',
  },
  partial: {
    label: 'Partly achieved',
    detail: 'Some objectives landed and some did not. The shortfalls are listed below.',
    Icon: ExclamationTriangleIcon,
    className: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-200',
    iconClass: 'text-amber-600 dark:text-amber-400',
  },
  missed: {
    label: 'Goals missed',
    detail: 'Most objectives did not reach their targets this year.',
    Icon: XCircleIcon,
    className: 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-900/20 dark:text-red-200',
    iconClass: 'text-red-600 dark:text-red-400',
  },
  'no-goals': {
    label: 'No objectives set',
    detail: 'Nothing was defined for this year, so there is nothing to measure against.',
    Icon: DocumentTextIcon,
    className: 'border-gray-200 bg-gray-50 text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200',
    iconClass: 'text-gray-500 dark:text-gray-400',
  },
} as const

// Semantic, not brand: landed reads as good, missed as bad, in both themes.
const LANDED = '#16a34a'
const MISSED = '#dc2626'
const ACCENT = '#2563eb'

const YearReport: React.FC<Props> = ({ years, year, onYearChange }) => {
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api
      .get(`/quarters/year/${year}/report`)
      .then(({ data }) => { if (!cancelled) setReport(data) })
      .catch(() => { if (!cancelled) { setReport(null); toast.error('Could not load the year report') } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [year])

  const exportCsv = () => {
    if (!report) return
    const rows: string[][] = [
      ['Year', String(report.year)],
      ['Verdict', VERDICT[report.verdict].label],
      ['Objectives landed', `${report.summary.objectivesLanded} of ${report.summary.objectivesTotal}`],
      ['Key results met', `${report.summary.keyResultsMet} of ${report.summary.keyResultsTotal}`],
      ['Average objective progress', `${report.summary.averageObjectiveProgress}%`],
      ['Tasks completed', `${report.summary.tasksCompleted} of ${report.summary.tasksTotal}`],
      [],
      ['Quarter', 'Objectives', 'Landed', 'Progress %', 'Tasks', 'Completed', 'Task completion %'],
      ...report.quarters.map((q) => [
        q.name, String(q.objectivesTotal), String(q.objectivesLanded), String(q.progress),
        String(q.tasksTotal), String(q.tasksCompleted), String(q.taskCompletionRate),
      ]),
      [],
      ['Objectives that fell short', 'Owner', 'Progress %'],
      ...report.shortfalls.map((s) => [s.title, s.owner ?? 'Unassigned', String(s.progress)]),
    ]
    // Quote every cell: objective titles routinely contain commas.
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `aura-year-report-${report.year}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-24 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700" />
        <div className="h-64 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700" />
      </div>
    )
  }

  if (!report) {
    return <EmptyState icon={DocumentTextIcon} title="No report available" description="Nothing could be loaded for this year." />
  }

  const v = VERDICT[report.verdict]
  const outcomeData = [
    { name: 'Landed', value: report.summary.objectivesLanded },
    { name: 'Missed', value: report.summary.objectivesMissed },
  ].filter((d) => d.value > 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <label htmlFor="report-year" className="form-label">Year</label>
          <select id="report-year" value={year} onChange={(e) => onYearChange(Number(e.target.value))} className="select-field w-40">
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button onClick={exportCsv} className="btn-secondary">
          <ArrowDownTrayIcon className="mr-2 h-4 w-4" />
          Export as CSV
        </button>
      </div>

      {/* The verdict, stated plainly before any chart. */}
      <div className={`flex items-start gap-4 rounded-xl border p-5 ${v.className}`}>
        <v.Icon className={`h-8 w-8 shrink-0 ${v.iconClass}`} />
        <div>
          <h2 className="text-lg font-semibold">{v.label}</h2>
          <p className="mt-1 text-sm opacity-90">{v.detail}</p>
          {report.summary.objectivesTotal > 0 && (
            <p className="mt-2 text-sm font-medium">
              {report.summary.objectivesLanded} of {report.summary.objectivesTotal} objectives landed
              {' '}({report.objectiveRate}%).
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Objectives landed', value: `${report.summary.objectivesLanded}/${report.summary.objectivesTotal}` },
          { label: 'Key results met', value: `${report.summary.keyResultsMet}/${report.summary.keyResultsTotal}` },
          { label: 'Average progress', value: `${report.summary.averageObjectiveProgress}%` },
          { label: 'Tasks completed', value: `${report.summary.taskCompletionRate}%` },
        ].map((s) => (
          <div key={s.label} className="surface p-4">
            <p className="eyebrow">{s.label}</p>
            <p className="mt-1.5 text-2xl font-semibold tabular-nums text-gray-900 dark:text-white">{s.value}</p>
          </div>
        ))}
      </div>

      {report.summary.objectivesTotal === 0 ? (
        <EmptyState
          icon={DocumentTextIcon}
          title={`No objectives were set for ${report.year}`}
          description="Create quarters and objectives to measure a year against."
        />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="surface p-5 lg:col-span-2">
              <h3 className="section-title mb-4">Objectives by quarter</h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={report.quarters}>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.12} />
                    <XAxis dataKey="name" stroke="currentColor" opacity={0.6} fontSize={12} />
                    <YAxis allowDecimals={false} stroke="currentColor" opacity={0.6} fontSize={12} />
                    <Tooltip
                      contentStyle={{ borderRadius: 10, border: '1px solid rgba(128,128,128,0.3)' }}
                      wrapperStyle={{ outline: 'none' }}
                    />
                    <Legend />
                    <Bar dataKey="objectivesLanded" name="Landed" fill={LANDED} radius={[4, 4, 0, 0]} />
                    <Bar
                      dataKey={(q: any) => q.objectivesTotal - q.objectivesLanded}
                      name="Missed"
                      fill={MISSED}
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="surface p-5">
              <h3 className="section-title mb-4">Outcome</h3>
              <div className="h-72">
                {outcomeData.length === 0 ? (
                  <p className="text-sm text-gray-600 dark:text-gray-400">Nothing to chart yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={outcomeData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                        {outcomeData.map((d) => (
                          <Cell key={d.name} fill={d.name === 'Landed' ? LANDED : MISSED} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid rgba(128,128,128,0.3)' }} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          <div className="surface p-5">
            <h3 className="section-title mb-1">Progress through the year</h3>
            <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
              Mean objective progress in each quarter, next to how much of its task work finished.
            </p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={report.quarters}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.12} />
                  <XAxis dataKey="name" stroke="currentColor" opacity={0.6} fontSize={12} />
                  <YAxis domain={[0, 100]} unit="%" stroke="currentColor" opacity={0.6} fontSize={12} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid rgba(128,128,128,0.3)' }} />
                  <Legend />
                  <Line type="monotone" dataKey="progress" name="Objective progress" stroke={ACCENT} strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="taskCompletionRate" name="Tasks completed" stroke={LANDED} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="surface overflow-hidden">
            <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-700">
              <h3 className="section-title">Where the year fell short</h3>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Objectives that did not reach their targets, furthest behind first.
              </p>
            </div>
            {report.shortfalls.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-gray-600 dark:text-gray-400">
                Every objective landed. Nothing fell short this year.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Objective</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Owner</th>
                      <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.shortfalls.map((s) => (
                      <tr key={s.id} className="border-b border-gray-100 last:border-0 dark:border-gray-700/60">
                        <td className="px-5 py-3">
                          <Link to={`/objectives/${s.id}`} className="font-medium text-gray-900 hover:text-primary-600 dark:text-white dark:hover:text-primary-400">
                            {s.title}
                          </Link>
                        </td>
                        <td className="px-5 py-3 text-gray-600 dark:text-gray-400">{s.owner ?? 'Unassigned'}</td>
                        <td className="px-5 py-3 text-right">
                          <span className="tabular-nums font-medium text-gray-900 dark:text-white">{s.progress}%</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default YearReport
