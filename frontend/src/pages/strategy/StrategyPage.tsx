import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  CalendarDaysIcon,
  FlagIcon,
  PlayCircleIcon,
  LockClosedIcon,
  PlusIcon,
  ChartBarSquareIcon,
  CheckCircleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline'
import api from '@/services/api'
import toast from 'react-hot-toast'
import { useAppSelector } from '@/hooks/redux'
import EmptyState from '@/components/common/EmptyState'
import YearReport from './YearReport'

/**
 * One place for the whole strategy hierarchy.
 *
 * Quarters and objectives were separate top-level pages, which split a single
 * mental model across two destinations: a quarter holds objectives, an objective
 * holds key results, and you cannot judge one without the other. Here the quarter
 * is the context at the top and everything below is scoped to it.
 *
 * Key results have never had a page of their own; they belong inside their
 * objective and are shown inline.
 */

type QuarterStatus = 'UPCOMING' | 'ACTIVE' | 'CLOSED'

interface KeyResult {
  id: string
  title: string
  unit?: string | null
  startValue: number
  targetValue: number
  currentValue: number
}

interface Objective {
  id: string
  title: string
  description?: string | null
  status: string
  progress?: number
  keyResults: KeyResult[]
}

interface Quarter {
  id: string
  name: string
  year: number
  status: QuarterStatus
  startDate: string
  endDate: string
}

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  ON_TRACK: { label: 'On track', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  AT_RISK: { label: 'At risk', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
  OFF_TRACK: { label: 'Off track', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
  COMPLETED: { label: 'Completed', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  CANCELLED: { label: 'Cancelled', className: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200' },
}

const QUARTER_STATUS: Record<QuarterStatus, { label: string; className: string }> = {
  UPCOMING: { label: 'Upcoming', className: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200' },
  ACTIVE: { label: 'Running now', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  CLOSED: { label: 'Closed', className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
}

/** Percentage a key result has travelled from its start toward its target. */
function krProgress(kr: KeyResult): number {
  const range = kr.targetValue - kr.startValue
  if (range === 0) return kr.currentValue >= kr.targetValue ? 100 : 0
  return Math.min(100, Math.max(0, Math.round(((kr.currentValue - kr.startValue) / range) * 100)))
}

function objProgress(o: Objective): number {
  if (typeof o.progress === 'number') return o.progress
  if (!o.keyResults?.length) return 0
  return Math.round(o.keyResults.reduce((s, kr) => s + krProgress(kr), 0) / o.keyResults.length)
}

const StrategyPage: React.FC = () => {
  const { user } = useAppSelector((s) => s.auth)
  const isAdmin = !!user && ['SUPER_ADMIN', 'COMPANY_ADMIN', 'ADMIN'].includes(user.role)

  const [quarters, setQuarters] = useState<Quarter[]>([])
  const [objectives, setObjectives] = useState<Objective[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState<'plan' | 'report'>('plan')
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({ title: '', description: '' })
  const [reportYear, setReportYear] = useState<number>(new Date().getFullYear())

  const selected = useMemo(() => quarters.find((q) => q.id === selectedId) ?? null, [quarters, selectedId])

  const loadQuarters = useCallback(async () => {
    const { data } = await api.get('/quarters')
    const list: Quarter[] = data ?? []
    setQuarters(list)
    setSelectedId((current) => {
      if (current && list.some((q) => q.id === current)) return current
      // Land on whatever is running, since that is where work is happening.
      return (list.find((q) => q.status === 'ACTIVE') ?? list[0])?.id ?? ''
    })
    return list
  }, [])

  const loadObjectives = useCallback(async (quarterId: string) => {
    if (!quarterId) return setObjectives([])
    const { data } = await api.get('/objectives', { params: { quarterId } })
    setObjectives(data ?? [])
  }, [])

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      try {
        await loadQuarters()
      } catch {
        toast.error('Could not load quarters')
      } finally {
        setLoading(false)
      }
    })()
  }, [loadQuarters])

  useEffect(() => {
    loadObjectives(selectedId).catch(() => toast.error('Could not load objectives'))
  }, [selectedId, loadObjectives])

  const startCycle = async (quarter: Quarter) => {
    setBusy(true)
    try {
      await api.patch(`/quarters/${quarter.id}`, { status: 'ACTIVE' })
      toast.success(`${quarter.name} ${quarter.year} is now running`)
      await loadQuarters()
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Could not start this quarter')
    } finally {
      setBusy(false)
    }
  }

  const createObjective = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected || !draft.title.trim()) return
    setBusy(true)
    try {
      await api.post('/objectives', {
        title: draft.title.trim(),
        description: draft.description.trim() || undefined,
        quarterId: selected.id,
      })
      toast.success('Objective added')
      setDraft({ title: '', description: '' })
      setCreating(false)
      await loadObjectives(selected.id)
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Could not add the objective')
    } finally {
      setBusy(false)
    }
  }

  const years = useMemo(
    () => [...new Set(quarters.map((q) => q.year))].sort((a, b) => b - a),
    [quarters],
  )

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-56 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-40 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Strategy</h1>
          <p className="page-subtitle">
            Quarters, the objectives inside them, and the key results those objectives are measured by.
          </p>
        </div>

        <div role="group" aria-label="View" className="surface-muted inline-flex p-1">
          {([
            { key: 'plan', label: 'Plan' },
            { key: 'report', label: 'Year report' },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setView(tab.key)}
              aria-pressed={view === tab.key}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                view === tab.key
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {view === 'report' ? (
        <YearReport
          years={years.length ? years : [reportYear]}
          year={reportYear}
          onYearChange={setReportYear}
        />
      ) : quarters.length === 0 ? (
        <EmptyState
          icon={CalendarDaysIcon}
          title="No quarters yet"
          description="A quarter is the period your objectives live in. Create the first one to start planning."
        />
      ) : (
        <>
          {/* Quarter rail: the context everything below is scoped to. */}
          <div className="flex gap-3 overflow-x-auto pb-1" role="group" aria-label="Select a quarter">
            {quarters.map((q) => {
              const active = q.id === selectedId
              const s = QUARTER_STATUS[q.status]
              return (
                <button
                  key={q.id}
                  aria-pressed={active}
                  aria-label={`${q.name} ${q.year}, ${QUARTER_STATUS[q.status].label}`}
                  onClick={() => setSelectedId(q.id)}
                  className={`surface min-w-[13rem] shrink-0 p-4 text-left transition-colors ${
                    active ? 'ring-2 ring-primary-500' : 'hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {q.name} {q.year}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`}>{s.label}</span>
                  </div>
                  <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                    {new Date(q.startDate).toLocaleDateString()} to {new Date(q.endDate).toLocaleDateString()}
                  </p>
                </button>
              )
            })}
          </div>

          {selected && (
            <motion.section
              key={selected.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="surface textured-grid p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="section-title">
                    {selected.name} {selected.year}
                  </h2>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    {selected.status === 'ACTIVE'
                      ? 'This quarter is running. Work linked to it counts toward the objectives below.'
                      : selected.status === 'UPCOMING'
                        ? 'Not started yet. Press Start cycle when the team is ready to begin.'
                        : 'Closed. Its record is kept, but new work should go to a running quarter.'}
                  </p>
                </div>

                {isAdmin && selected.status === 'UPCOMING' && (
                  <button onClick={() => startCycle(selected)} disabled={busy} className="btn-primary">
                    {busy ? <ArrowPathIcon className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircleIcon className="mr-2 h-4 w-4" />}
                    Start cycle
                  </button>
                )}
                {isAdmin && selected.status === 'ACTIVE' && (
                  <Link to="/quarters" className="btn-secondary">
                    <LockClosedIcon className="mr-2 h-4 w-4" />
                    Close cycle
                  </Link>
                )}
              </div>

              <div className="mt-5 border-t border-gray-200 pt-5 dark:border-gray-700">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                    Objectives in this quarter
                  </h3>
                  {isAdmin && selected.status !== 'CLOSED' && (
                    <button
                      onClick={() => setCreating((v) => !v)}
                      className="text-sm font-medium text-primary-600 hover:underline dark:text-primary-400"
                    >
                      <PlusIcon className="mr-1 inline h-4 w-4" />
                      {creating ? 'Cancel' : 'Add an objective'}
                    </button>
                  )}
                </div>

                {creating && (
                  <form onSubmit={createObjective} className="surface-muted mb-4 space-y-3 p-4">
                    <div>
                      <label htmlFor="obj-title" className="form-label">What are you trying to achieve?</label>
                      <input
                        id="obj-title"
                        autoFocus
                        required
                        value={draft.title}
                        onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                        placeholder="Grow retention in enterprise accounts"
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label htmlFor="obj-desc" className="form-label">Context (optional)</label>
                      <input
                        id="obj-desc"
                        value={draft.description}
                        onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                        placeholder="Why this matters this quarter"
                        className="input-field"
                      />
                    </div>
                    <p className="form-hint">
                      Added to {selected.name} {selected.year}. Open it afterwards to add the key results that
                      measure it, since an objective with none can never show progress.
                    </p>
                    <div className="flex gap-2">
                      <button type="submit" disabled={busy || !draft.title.trim()} className="btn-primary">
                        {busy ? 'Adding…' : 'Add objective'}
                      </button>
                      <button type="button" onClick={() => setCreating(false)} className="btn-secondary">
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                {objectives.length === 0 ? (
                  <EmptyState
                    bare
                    icon={FlagIcon}
                    title="No objectives in this quarter"
                    description="An objective is what you are trying to achieve. Its key results are the numbers that prove it happened."
                  />
                ) : (
                  <ul className="space-y-3">
                    {objectives.map((o) => {
                      const progress = objProgress(o)
                      const st = STATUS_STYLES[o.status] ?? STATUS_STYLES.ON_TRACK
                      return (
                        <li key={o.id} className="surface-muted p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <Link
                                to={`/objectives/${o.id}`}
                                className="font-medium text-gray-900 hover:text-primary-600 dark:text-white dark:hover:text-primary-400"
                              >
                                {o.title}
                              </Link>
                              {o.description && (
                                <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">{o.description}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.className}`}>
                                {st.label}
                              </span>
                              <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-white">
                                {progress}%
                              </span>
                            </div>
                          </div>

                          <div
                            role="progressbar"
                            aria-valuenow={progress}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`${o.title} progress`}
                            className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
                          >
                            <div className="h-full rounded-full bg-primary-600" style={{ width: `${progress}%` }} />
                          </div>

                          {(!o.keyResults || o.keyResults.length === 0) && (
                            <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">
                              No key results yet, so this objective cannot show progress.{' '}
                              <Link to={`/objectives/${o.id}`} className="font-medium underline">
                                Add one
                              </Link>
                            </p>
                          )}

                          {o.keyResults?.length > 0 && (
                            <ul className="mt-3 space-y-2">
                              {o.keyResults.map((kr) => {
                                const p = krProgress(kr)
                                return (
                                  <li key={kr.id} className="flex items-center gap-3 text-sm">
                                    {p >= 100 ? (
                                      <CheckCircleIcon className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                                    ) : (
                                      <span className="h-4 w-4 shrink-0 rounded-full border border-gray-300 dark:border-gray-600" />
                                    )}
                                    <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-300">
                                      {kr.title}
                                    </span>
                                    <span className="shrink-0 tabular-nums text-gray-600 dark:text-gray-400">
                                      {Math.round(kr.currentValue)} of {kr.targetValue}
                                      {kr.unit ? ` ${kr.unit}` : ''}
                                    </span>
                                  </li>
                                )
                              })}
                            </ul>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </motion.section>
          )}

          <div className="surface flex items-start gap-3 p-4">
            <ChartBarSquareIcon className="mt-0.5 h-5 w-5 shrink-0 text-gray-500 dark:text-gray-400" />
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Every number here is calculated from the tasks linked to each key result. Nothing on this page
              is typed in by hand, so progress always matches the work underneath it.
            </p>
          </div>
        </>
      )}
    </div>
  )
}

export default StrategyPage
