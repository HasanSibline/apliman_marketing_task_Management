import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  CalendarDaysIcon,
  FlagIcon,
  PlayCircleIcon,
  LockClosedIcon,
  PlusIcon,
  ChartBarSquareIcon,
  ArrowPathIcon,
  EyeSlashIcon,
  ArrowRightCircleIcon,
} from '@heroicons/react/24/outline'
import api from '@/services/api'
import toast from 'react-hot-toast'
import { useAppSelector } from '@/hooks/redux'
import EmptyState from '@/components/common/EmptyState'
import YearReport from './YearReport'
import CloseCycleModal from './CloseCycleModal'
import EndYearModal from './EndYearModal'
import ObjectiveCard, { Objective as ObjectiveShape } from './ObjectiveCard'

type QuarterStatus = 'UPCOMING' | 'ACTIVE' | 'CLOSED'

interface Readiness {
  ready: boolean
  reason: 'no-objectives' | 'objectives-without-key-results' | null
  titles: string[]
}

interface Quarter {
  id: string
  name: string
  year: number
  status: QuarterStatus
  startDate: string
  endDate: string
  readiness?: Readiness
}

/**
 * What a quarter still needs before the company can see it, in the words of the
 * thing that is missing rather than a status code.
 */
/** Short enough to sit on one line inside a card. */
function formatSpan(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

function readinessMessage(r: Readiness): string {
  if (r.reason === 'no-objectives') {
    return 'It has no objectives yet. Add what this quarter is trying to achieve.'
  }
  const [first, ...rest] = r.titles
  if (!first) return 'It is not ready to show yet.'
  const others = rest.length === 1 ? ' and one other' : rest.length > 1 ? ` and ${rest.length} others` : ''
  return `Add a key result to "${first}"${others}. An objective with none can never show progress.`
}

type Objective = ObjectiveShape

const QUARTER_STATUS: Record<QuarterStatus, { label: string; className: string }> = {
  UPCOMING: { label: 'Upcoming', className: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200' },
  ACTIVE: { label: 'Running now', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  CLOSED: { label: 'Closed', className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
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
  const [year, setYear] = useState<number | null>(null)
  const [closing, setClosing] = useState(false)
  const [endingYear, setEndingYear] = useState(false)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({ title: '', description: '' })
  const [reportYear, setReportYear] = useState<number>(new Date().getFullYear())

  const selected = useMemo(() => quarters.find((q) => q.id === selectedId) ?? null, [quarters, selectedId])

  const loadQuarters = useCallback(async () => {
    const { data } = await api.get('/quarters')
    const list: Quarter[] = data ?? []
    setQuarters(list)
    // Open on the year that is actually running, so the common case needs no clicks.
    const running = list.find((q) => q.status === 'ACTIVE')
    setYear((y) => y ?? running?.year ?? list[0]?.year ?? new Date().getFullYear())
    setSelectedId((current) => {
      if (current && list.some((q) => q.id === current)) return current
      return (running ?? list[0])?.id ?? ''
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

  // Only one cycle can be open at a time, so this is offered exactly when none is.
  const hasOpenCycle = quarters.some((q) => q.status !== 'CLOSED')

  const openNextQuarter = async () => {
    setBusy(true)
    try {
      const { data } = await api.post('/quarters/next')
      toast.success(`${data.name} ${data.year} is ready. Plan it, then press Start cycle.`)
      const list = await loadQuarters()
      if (list.some((q) => q.id === data.id)) {
        setYear(data.year)
        setSelectedId(data.id)
        await loadObjectives(data.id)
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Could not open the next quarter')
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

  const quartersInYear = useMemo(
    () => quarters.filter((q) => q.year === year),
    [quarters, year],
  )

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

        {isAdmin && (
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
        )}
      </header>

      {view === 'report' && isAdmin ? (
        <YearReport
          years={years.length ? years : [reportYear]}
          year={reportYear}
          onYearChange={setReportYear}
        />
      ) : quarters.length === 0 ? (
        <EmptyState
          icon={CalendarDaysIcon}
          title="No quarters yet"
          description="A quarter is the period your objectives live in. Open the first one to start planning."
          action={
            isAdmin ? (
              <button onClick={openNextQuarter} disabled={busy} className="btn-primary">
                {busy ? (
                  <ArrowPathIcon className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <PlusIcon className="mr-2 h-4 w-4" />
                )}
                Open the first quarter
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Years first, then that year's quarters: a flat list mixed every year
              together and made the running quarter hard to find. */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Select a year">
            {years.map((y) => (
              <button
                key={y}
                onClick={() => {
                  setYear(y)
                  const first = quarters.find((q) => q.year === y && q.status === 'ACTIVE')
                    ?? quarters.find((q) => q.year === y)
                  if (first) setSelectedId(first.id)
                }}
                aria-pressed={year === y}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  year === y
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'surface text-gray-700 hover:border-gray-300 dark:text-gray-300 dark:hover:border-gray-600'
                }`}
              >
                {y}
                <span className={`ml-2 text-xs ${year === y ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'}`}>
                  {quarters.filter((q) => q.year === y).length}
                </span>
              </button>
            ))}
            </div>

            {isAdmin && (
              <div className="ml-auto flex flex-wrap gap-2">
                {/* Closing the last quarter of a year does not end the year: unmet
                    objectives still have to be carried and the next year opened.
                    Gating this on an open quarter hid it exactly when it was needed. */}
                {!hasOpenCycle && (
                  <button onClick={openNextQuarter} disabled={busy} className="btn-primary">
                    {busy ? (
                      <ArrowPathIcon className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <PlusIcon className="mr-2 h-4 w-4" />
                    )}
                    Open the next quarter
                  </button>
                )}
                {year !== null && quartersInYear.length > 0 && (
                  <button onClick={() => setEndingYear(true)} className="btn-secondary">
                    <ArrowRightCircleIcon className="mr-2 h-4 w-4" />
                    End {year}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* A year holds four quarters, so they lay out as a grid rather than a
              horizontal scroller. The scroller clipped the selected card's ring
              against its own overflow, and made four items feel like a list that
              continued past the edge. Grid cells stretch to a shared height, so a
              card carrying the hidden notice no longer makes the row ragged. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" role="group" aria-label="Select a quarter">
            {quartersInYear.map((q) => {
              const active = q.id === selectedId
              const st = QUARTER_STATUS[q.status]
              const hidden = q.status === 'ACTIVE' && q.readiness && !q.readiness.ready
              return (
                <button
                  key={q.id}
                  aria-pressed={active}
                  aria-label={`${q.name} ${q.year}, ${st.label}`}
                  onClick={() => setSelectedId(q.id)}
                  className={`surface flex w-full flex-col gap-2 p-4 text-left transition-colors ${
                    active
                      // Border and ground rather than a ring: a ring paints outside
                      // the box and is the first thing any container clips.
                      ? 'border-primary-500 bg-primary-50/70 dark:border-primary-500 dark:bg-primary-900/20'
                      : 'hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="truncate text-base font-semibold text-gray-900 dark:text-white">
                      {q.name}
                    </span>
                    <span
                      className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${st.className}`}
                    >
                      {st.label}
                    </span>
                  </div>

                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatSpan(q.startDate)} to {formatSpan(q.endDate)}
                  </p>

                  {hidden && (
                    <p className="mt-auto flex items-center gap-1 pt-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                      <EyeSlashIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      Hidden from the team
                    </p>
                  )}
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
                  <button onClick={() => setClosing(true)} className="btn-secondary">
                    <LockClosedIcon className="mr-2 h-4 w-4" />
                    Close cycle
                  </button>
                )}
              </div>

              {selected.status === 'ACTIVE' && selected.readiness && !selected.readiness.ready && (
                <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
                  <EyeSlashIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold">Running, but hidden from the team</p>
                    <p className="mt-1 text-sm opacity-90">
                      {readinessMessage(selected.readiness)} Until then only planners can see this cycle,
                      so nobody opens Strategy to an empty quarter.
                    </p>
                  </div>
                </div>
              )}

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
                    {objectives.map((o) => (
                      <ObjectiveCard
                        key={o.id}
                        objective={o as ObjectiveShape}
                        canEdit={isAdmin && selected.status !== 'CLOSED'}
                        onChanged={() => loadObjectives(selected.id)}
                      />
                    ))}
                  </ul>
                )}
              </div>
            </motion.section>
          )}

          {closing && selected && (
            <CloseCycleModal
              quarter={selected}
              quarters={quarters}
              onCancel={() => setClosing(false)}
              onClosed={async (next) => {
                setClosing(false)
                const list = await loadQuarters()
                // Follow the company forward. Staying on the quarter just closed
                // would leave the planner looking at finished work.
                if (next && list.some((q) => q.id === next.id)) {
                  setYear(next.year)
                  setSelectedId(next.id)
                  await loadObjectives(next.id)
                } else {
                  await loadObjectives(selected.id)
                }
              }}
            />
          )}

          {endingYear && year !== null && (
            <EndYearModal
              year={year}
              onCancel={() => setEndingYear(false)}
              onClosed={async (nextYear) => {
                setEndingYear(false)
                const list = await loadQuarters()
                // The whole point of ending a year is arriving in the next one.
                const landing =
                  list.find((q) => q.year === nextYear && q.status === 'ACTIVE') ??
                  list.filter((q) => q.year === nextYear).sort((a, b) => a.startDate.localeCompare(b.startDate))[0]
                if (landing) {
                  setYear(nextYear)
                  setSelectedId(landing.id)
                  await loadObjectives(landing.id)
                }
              }}
            />
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
