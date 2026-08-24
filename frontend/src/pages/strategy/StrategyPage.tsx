import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  TrashIcon,
} from '@heroicons/react/24/outline'
import api from '@/services/api'
import toast from 'react-hot-toast'
import { useAppSelector } from '@/hooks/redux'
import EmptyState from '@/components/common/EmptyState'
import YearReport from './YearReport'
import CloseCycleModal from './CloseCycleModal'
import EndYearModal from './EndYearModal'
import YearFolder from './YearFolder'
import ObjectiveCard, { Objective as ObjectiveShape } from './ObjectiveCard'

type QuarterStatus = 'UPCOMING' | 'ACTIVE' | 'CLOSED'

interface Readiness {
  ready: boolean
  reason: 'no-objectives' | 'objectives-without-key-results' | null
  titles: string[]
}

interface Ending {
  state: 'open' | 'early' | 'on-time' | 'late'
  days: number
}

interface Quarter {
  id: string
  name: string
  year: number
  status: QuarterStatus
  startDate: string
  endDate: string
  readiness?: Readiness
  ending?: Ending
}

/**
 * Dates are the plan; closing is the event. When the two disagree the record says
 * so, because a cycle the team finished six weeks early is a fact worth keeping and
 * not a rounding error against the calendar.
 */
const ENDING: Record<'early' | 'late', { label: string; className: string }> = {
  early: {
    label: 'Ended early',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  },
  late: {
    label: 'Ran over',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  },
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
  /**
   * The quarter list failed to load.
   *
   * Without it the only state left was `quarters === []`, which rendered the "No
   * quarters yet" empty state, complete with an "Open the first quarter" button. An
   * admin acting on that after a dropped connection opens a duplicate cycle in a
   * company that already has several.
   */
  const [quartersFailed, setQuartersFailed] = useState(false)
  /** The same distinction as quartersFailed, for the objectives inside a quarter. */
  const [objectivesFailed, setObjectivesFailed] = useState(false)

  /** Which objectives request is still current. See loadObjectives. */
  const objectivesRequestId = useRef(0)

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
    /**
     * Only the newest quarter's answer may land.
     *
     * Clicking through quarters starts a request each time, and an earlier one
     * answering last put another quarter's objectives under the selected quarter's
     * heading, where they could then be edited or deleted in good faith.
     */
    const mine = ++objectivesRequestId.current
    if (!quarterId) {
      setObjectives([])
      return
    }
    const { data } = await api.get('/objectives', { params: { quarterId } })
    if (mine !== objectivesRequestId.current) return
    setObjectives(data ?? [])
  }, [])

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setQuartersFailed(false)
      try {
        await loadQuarters()
      } catch {
        setQuartersFailed(true)
        toast.error('Could not load quarters')
      } finally {
        setLoading(false)
      }
    })()
  }, [loadQuarters])

  useEffect(() => {
    /**
     * A failed objectives load is not a quarter with no objectives.
     *
     * The catch here only toasted, and the panel below then rendered "No objectives in
     * this quarter". Two things follow from that. The reader is told something false
     * about the quarter, and the Remove quarter button is gated on
     * `objectives.length === 0`, so a dropped request offered to delete a quarter that
     * may be full of them. The server refuses that, so nothing is lost, but a
     * destructive control that exists only because a request failed should not be on
     * the screen at all.
     */
    setObjectivesFailed(false)
    loadObjectives(selectedId).catch(() => {
      setObjectivesFailed(true)
      toast.error('Could not load objectives')
    })
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

  // Only ever offered for a cycle that never started and holds nothing. The server
  // enforces that too; this just keeps the button away from the other cases.
  const removeQuarter = async (quarter: Quarter) => {
    setBusy(true)
    try {
      await api.delete(`/quarters/${quarter.id}`)
      toast.success(`${quarter.name} ${quarter.year} removed`)
      const list = await loadQuarters()
      const fallback = list.find((q) => q.status === 'ACTIVE') ?? list[0]
      if (fallback) {
        setYear(fallback.year)
        setSelectedId(fallback.id)
        await loadObjectives(fallback.id)
      } else {
        setSelectedId('')
        setObjectives([])
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Could not remove this quarter')
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
      ) : quartersFailed ? (
        <EmptyState
          icon={CalendarDaysIcon}
          title="Quarters could not be loaded"
          description="This is a problem reaching the server, not an empty plan. Nothing has been lost, and no quarter should be created to work around it."
          action={
            <button onClick={() => window.location.reload()} className="btn-primary">
              Try again
            </button>
          }
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
          {/* Folders are taller than a button, so the row aligns on its baseline
              rather than centring the actions against the artwork. */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-wrap items-end gap-1" role="group" aria-label="Select a year">
            {years.map((y) => {
              const count = quarters.filter((q) => q.year === y).length
              const on = year === y
              return (
                <button
                  key={y}
                  onClick={() => {
                    setYear(y)
                    const first = quarters.find((q) => q.year === y && q.status === 'ACTIVE')
                      ?? quarters.find((q) => q.year === y)
                    if (first) setSelectedId(first.id)
                  }}
                  aria-pressed={on}
                  aria-label={`${y}, ${count} ${count === 1 ? 'quarter' : 'quarters'}`}
                  className={`group flex w-24 flex-col items-center gap-1 rounded-xl px-2 py-2.5 transition-colors ${
                    on
                      ? 'bg-primary-50 dark:bg-primary-900/25'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <YearFolder
                    open={on}
                    className={`h-11 w-11 transition-transform ${on ? '' : 'group-hover:-translate-y-0.5'}`}
                  />
                  <span
                    className={`text-sm font-semibold tabular-nums ${
                      on ? 'text-primary-700 dark:text-primary-300' : 'text-gray-800 dark:text-gray-200'
                    }`}
                  >
                    {y}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {count} {count === 1 ? 'quarter' : 'quarters'}
                  </span>
                </button>
              )
            })}
            </div>

            {isAdmin && (
              <div className="ml-auto flex flex-wrap gap-2 pb-1.5">
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
              const canStart = isAdmin && q.status === 'UPCOMING'
              return (
                // A card carrying its own action cannot be a button: nesting one
                // inside another is invalid and leaves the inner one unreachable.
                // Selecting is a button stretched over the card instead, with the
                // action sitting above it.
                <div
                  key={q.id}
                  className={`surface relative flex flex-col gap-2 p-4 transition-colors ${
                    active
                      // Border and ground rather than a ring: a ring paints outside
                      // the box and is the first thing any container clips.
                      ? 'border-primary-500 bg-primary-50/70 dark:border-primary-500 dark:bg-primary-900/20'
                      : 'hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <button
                    aria-pressed={active}
                    aria-label={`${q.name} ${q.year}, ${st.label}`}
                    onClick={() => setSelectedId(q.id)}
                    className="absolute inset-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
                  />

                  {/* Text is inert so a click anywhere on it reaches the card. */}
                  <div className="pointer-events-none relative flex flex-col gap-2">
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

                    {q.ending && (q.ending.state === 'early' || q.ending.state === 'late') && (
                      <span
                        className={`w-fit rounded-full px-2 py-0.5 text-xs font-medium ${ENDING[q.ending.state].className}`}
                      >
                        {ENDING[q.ending.state].label} by {q.ending.days}{' '}
                        {q.ending.days === 1 ? 'day' : 'days'}
                      </span>
                    )}

                    {hidden && (
                      <p className="flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                        <EyeSlashIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        Hidden from the team
                      </p>
                    )}
                  </div>

                  {/* Starting a cycle belongs to the quarter it starts, so it sits on
                      that quarter rather than in a header shared by all of them.
                      mt-auto keeps it on the bottom edge however tall the row grows. */}
                  {canStart && (
                    <button
                      onClick={() => startCycle(q)}
                      disabled={busy}
                      aria-label={`Start ${q.name} ${q.year}`}
                      className="btn-primary relative mt-auto w-full justify-center"
                    >
                      {busy ? (
                        <ArrowPathIcon className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <PlayCircleIcon className="mr-2 h-4 w-4" />
                      )}
                      Start cycle
                    </button>
                  )}
                </div>
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
                        ? 'Not started yet. Plan its objectives here, then press Start cycle on the card above.'
                        : selected.ending?.state === 'early'
                          ? `Closed ${selected.ending.days} ${selected.ending.days === 1 ? 'day' : 'days'} before its planned end. Its record is kept, and the next cycle picked up from there.`
                          : selected.ending?.state === 'late'
                            ? `Closed ${selected.ending.days} ${selected.ending.days === 1 ? 'day' : 'days'} after its planned end. Its record is kept, but new work should go to a running quarter.`
                            : 'Closed. Its record is kept, but new work should go to a running quarter.'}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {isAdmin && selected.status === 'ACTIVE' && (
                    <button onClick={() => setClosing(true)} className="btn-secondary">
                      <LockClosedIcon className="mr-2 h-4 w-4" />
                      Close cycle
                    </button>
                  )}
                  {isAdmin && selected.status === 'UPCOMING' && objectives.length === 0 && !objectivesFailed && (
                    <button
                      onClick={() => removeQuarter(selected)}
                      disabled={busy}
                      className="btn-secondary text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                    >
                      <TrashIcon className="mr-2 h-4 w-4" />
                      Remove
                    </button>
                  )}
                </div>
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

                {objectivesFailed ? (
                  <EmptyState
                    bare
                    icon={FlagIcon}
                    title="Objectives could not be loaded"
                    description="This is a problem reaching the server, not an empty quarter."
                    action={
                      <button
                        onClick={() => {
                          setObjectivesFailed(false)
                          loadObjectives(selectedId).catch(() => setObjectivesFailed(true))
                        }}
                        className="btn-primary"
                      >
                        Try again
                      </button>
                    }
                  />
                ) : objectives.length === 0 ? (
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
