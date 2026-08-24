import React, { useEffect, useRef, useState } from 'react'
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
  TableCellsIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline'
import api from '@/services/api'
import toast from 'react-hot-toast'
import EmptyState from '@/components/common/EmptyState'
import { useChartTheme } from '@/theme/chartTheme'

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

/** Years are fetched in parallel; one failing must not blank the others. */
async function fetchYear(y: number): Promise<Report | null> {
  try {
    const { data } = await api.get(`/quarters/year/${y}/report`)
    return data
  } catch {
    return null
  }
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

/**
 * The four verdicts above are everything the server sends today. Reading the map
 * directly on `.label` meant that anything else, a verdict added later or an older
 * response shape, was `undefined.label` and a thrown TypeError, which blanked the
 * whole multi-year table and both exports rather than one cell.
 */
const verdictLabel = (v: string) => (VERDICT as Record<string, { label: string }>)[v]?.label ?? v

// Semantic, not brand: landed reads as good, missed as bad, in both themes.
const LANDED = '#16a34a'
const MISSED = '#dc2626'
const ACCENT = '#2563eb'

const YearReport: React.FC<Props> = ({ years, year, onYearChange }) => {
  const [selectedYears, setSelectedYears] = useState<number[]>([year])
  const [reports, setReports] = useState<Report[]>([])
  /**
   * Years that were asked for and did not come back.
   *
   * Kept, rather than only toasted, because of what the page does next. Select 2024
   * and 2025, have 2025 fail, and `reports` has one row: the view drops out of
   * comparison mode into the full single-year report for 2024, headline verdict and
   * all, on a screen the reader opened to look at 2025. The toast that said so is
   * gone in four seconds and the authoritative-looking report stays.
   */
  const [missingYears, setMissingYears] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  // Recharts draws its tooltip with inline styles, so it defaults to a white card
  // with near-black text whatever the page is. The app already has one hook that
  // resolves those colours against the live theme; charts here use it too rather
  // than growing a second answer.
  const chart = useChartTheme()
  // Charts are captured from this subtree, so it must wrap everything rendered.
  const reportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all(selectedYears.slice().sort((a, b) => a - b).map(fetchYear))
      .then((rows) => {
        if (cancelled) return
        const wanted = selectedYears.slice().sort((a, b) => a - b)
        const ok = rows.filter((r): r is Report => !!r)
        setReports(ok)
        setMissingYears(wanted.filter((_, i) => !rows[i]))
        if (ok.length < wanted.length) toast.error('Some years could not be loaded')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [selectedYears])

  const toggleYear = (y: number) => {
    // Told the parent "the report year is now y" even when the click had just
    // *removed* y from the comparison, and even when the click was refused because y
    // was the last year left. Only an addition is a choice of year.
    const isAdding = !selectedYears.includes(y)
    setSelectedYears((prev) => {
      // Never end up with nothing selected: an empty report is not a useful state.
      if (prev.includes(y)) return prev.length === 1 ? prev : prev.filter((x) => x !== y)
      return [...prev, y]
    })
    if (isAdding) onYearChange(y)
  }

  // The single-year view is the common case, so it stays the default shape. It is
  // keyed off what was asked for, not off what happened to arrive, so a failure
  // cannot quietly turn a two-year comparison into a report on one of them.
  const report = selectedYears.length === 1 && reports.length === 1 ? reports[0] : null
  const multi = reports.length > 1

  const exportWorkbook = async () => {
    if (reports.length === 0 || exporting) return
    setExporting(true)
    try {
      // Charts are read from what is rendered, so the pictures in the file are the
      // ones on screen. Nothing is redrawn and nothing can disagree.
      const { captureCharts, exportYearReport } = await import('./exportReport')
      const charts = reportRef.current ? await captureCharts(reportRef.current) : []
      await exportYearReport(
        reports.map((r) => ({
          year: r.year,
          verdictLabel: verdictLabel(r.verdict),
          objectiveRate: r.objectiveRate,
          summary: r.summary,
          quarters: r.quarters,
          shortfalls: r.shortfalls,
        })),
        charts,
        'Aura Operations',
      )
      toast.success(charts.length > 0 ? `Exported with ${charts.length} charts` : 'Exported')
    } catch {
      toast.error('Could not build the report file')
    } finally {
      setExporting(false)
    }
  }

  const exportCsv = () => {
    if (!report) return
    const rows: string[][] = [
      ['Year', String(report.year)],
      ['Verdict', verdictLabel(report.verdict)],
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
    // Revoked on the next tick. Doing it in the same one races the browser's own read
    // of the blob, which is how you get an intermittently empty download.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-24 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700" />
        <div className="h-64 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700" />
      </div>
    )
  }

  if (reports.length === 0) {
    return <EmptyState icon={DocumentTextIcon} title="No report available" description="Nothing could be loaded for the selected years." />
  }

  const missingNotice = missingYears.length > 0 && (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
      {missingYears.join(', ')} could not be loaded, so {missingYears.length === 1 ? 'it is' : 'they are'}{' '}
      not counted in anything below.
    </div>
  )

  const v = report ? VERDICT[report.verdict] : null
  const outcomeData = !report ? [] : [
    { name: 'Landed', value: report.summary.objectivesLanded },
    { name: 'Missed', value: report.summary.objectivesMissed },
  ].filter((d) => d.value > 0)

  return (
    <div ref={reportRef} className="space-y-6">
      {missingNotice}
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="form-label">Years</span>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Years to include">
            {years.map((y) => {
              const on = selectedYears.includes(y)
              return (
                <button
                  key={y}
                  onClick={() => toggleYear(y)}
                  aria-pressed={on}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    on
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'surface text-gray-700 hover:border-gray-300 dark:text-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  {y}
                </button>
              )
            })}
          </div>
          <p className="form-hint">Pick more than one to compare years side by side.</p>
        </div>

        <div className="flex gap-2">
          <button onClick={exportWorkbook} disabled={exporting} className="btn-primary">
            <TableCellsIcon className="mr-2 h-4 w-4" />
            {exporting ? 'Building file...' : 'Export to Excel'}
          </button>
          {report && (
            <button onClick={exportCsv} className="btn-secondary">
              <ArrowDownTrayIcon className="mr-2 h-4 w-4" />
              CSV
            </button>
          )}
        </div>
      </div>

      {multi && (
        <section className="surface p-5">
          <h2 className="section-title mb-1">
            {reports.map((r) => r.year).join(', ')} compared
          </h2>
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            Objectives landed against objectives set, year by year.
          </p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={reports.map((r) => ({
                year: String(r.year),
                Landed: r.summary.objectivesLanded,
                Missed: r.summary.objectivesMissed,
                'Task completion %': r.summary.taskCompletionRate,
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.12} />
                <XAxis dataKey="year" stroke="currentColor" opacity={0.6} fontSize={12} />
                <YAxis allowDecimals={false} stroke="currentColor" opacity={0.6} fontSize={12} />
                <Tooltip contentStyle={chart.tooltip} labelStyle={chart.tooltipLabel} itemStyle={chart.tooltipLabel} />
                <Legend />
                <Bar dataKey="Landed" fill={LANDED} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Missed" fill={MISSED} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  {['Year', 'Verdict', 'Objectives', 'Landed', 'Key results met', 'Avg progress', 'Tasks done'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.year} className="border-b border-gray-100 last:border-0 dark:border-gray-700/60">
                    <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{r.year}</td>
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{verdictLabel(r.verdict)}</td>
                    <td className="px-3 py-2 tabular-nums">{r.summary.objectivesTotal}</td>
                    <td className="px-3 py-2 tabular-nums">{r.summary.objectivesLanded}</td>
                    <td className="px-3 py-2 tabular-nums">{r.summary.keyResultsMet}/{r.summary.keyResultsTotal}</td>
                    <td className="px-3 py-2 tabular-nums">{r.summary.averageObjectiveProgress}%</td>
                    <td className="px-3 py-2 tabular-nums">{r.summary.taskCompletionRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* The verdict, stated plainly before any chart. */}
      {report && v && (
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
      )}

      {report && (
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
      )}

      {!report ? null : report.summary.objectivesTotal === 0 ? (
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
                      contentStyle={chart.tooltip}
                      labelStyle={chart.tooltipLabel}
                      itemStyle={chart.tooltipLabel}
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
                      <Tooltip contentStyle={chart.tooltip} labelStyle={chart.tooltipLabel} itemStyle={chart.tooltipLabel} />
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
                  <Tooltip contentStyle={chart.tooltip} labelStyle={chart.tooltipLabel} itemStyle={chart.tooltipLabel} />
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
                          <span className="font-medium text-gray-900 dark:text-white">{s.title}</span>
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
