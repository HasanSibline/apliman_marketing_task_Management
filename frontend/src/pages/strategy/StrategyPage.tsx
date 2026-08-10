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
} from '@heroicons/react/24/outline'
import api from '@/services/api'
import toast from 'react-hot-toast'
import { useAppSelector } from '@/hooks/redux'
import EmptyState from '@/components/common/EmptyState'
import YearReport from './YearReport'
import CloseCycleModal from './CloseCycleModal'
import ObjectiveCard, { Objective as ObjectiveShape } from './ObjectiveCard'

type QuarterStatus = 'UPCOMING' | 'ACTIVE' | 'CLOSED'

interface Quarter {
  id: string
  name: string
  year: number
  status: QuarterStatus
  startDate: string
  endDate: string
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
          {/* Years first, then that year's quarters: a flat list mixed every year
              together and made the running quarter hard to find. */}
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

          <div className="flex gap-3 overflow-x-auto pb-1" role="group" aria-label="Select a quarter">
            {quartersInYear.map((q) => {
              const active = q.id === selectedId
              const st = QUARTER_STATUS[q.status]
              return (
                <button
                  key={q.id}
                  aria-pressed={active}
                  aria-label={`${q.name} ${q.year}, ${st.label}`}
                  onClick={() => setSelectedId(q.id)}
                  className={`surface min-w-[13rem] shrink-0 p-4 text-left transition-colors ${
                    active ? 'ring-2 ring-primary-500' : 'hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-gray-900 dark:text-white">{q.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.className}`}>{st.label}</span>
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
                  <button onClick={() => setClosing(true)} className="btn-secondary">
                    <LockClosedIcon className="mr-2 h-4 w-4" />
                    Close cycle
                  </button>
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
              onClosed={async () => {
                setClosing(false)
                await loadQuarters()
                await loadObjectives(selected.id)
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
