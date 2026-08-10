import React, { useEffect, useMemo, useState } from 'react'
import { XMarkIcon, LockClosedIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import api from '@/services/api'
import toast from 'react-hot-toast'

/**
 * Closing a quarter, decided in one place.
 *
 * Closing is what decides the fate of every unfinished task: carry it into the next
 * quarter, or release it. Anything left unticked keeps its assignee but belongs to
 * no quarter, so the consequence is stated plainly rather than left to be found.
 *
 * Closing also hands the company to the next cycle. A quarter the planners had
 * already prepared takes over at once; one the app has to invent waits, because
 * nobody has agreed to its dates or written a single objective in it. Either way the
 * team sees nothing until there is a plan, so an empty cycle never goes public.
 */

interface Quarter {
  id: string
  name: string
  year: number
  status: string
  startDate: string
}

interface TaskRow {
  id: string
  title: string
  taskNumber?: string | null
  assignedTo?: { name: string } | null
}

interface Props {
  quarter: Quarter
  quarters: Quarter[]
  onCancel: () => void
  onClosed: (next: { id: string; year: number; started: boolean } | null) => void
}

/** Sentinel for the deliberate choice to park carried work outside any quarter. */
const UNSCHEDULED = '__unscheduled__'

const CloseCycleModal: React.FC<Props> = ({ quarter, quarters, onCancel, onClosed }) => {
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [nextQuarterId, setNextQuarterId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Only quarters that can still receive work, earliest first: carrying tasks into
  // a closed one would hide them immediately, and the cycle that follows this one is
  // nearly always the answer, so it should be the one offered first.
  const targets = useMemo(
    () =>
      quarters
        .filter((q) => q.id !== quarter.id && q.status !== 'CLOSED')
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [quarters, quarter.id],
  )

  // Work follows the company forward unless someone says otherwise.
  const successor = targets.find((q) => q.startDate >= quarter.startDate) ?? targets[0] ?? null
  useEffect(() => {
    setNextQuarterId((current) => current || successor?.id || UNSCHEDULED)
  }, [successor?.id])

  useEffect(() => {
    let cancelled = false
    api
      .get('/tasks', { params: { quarterId: quarter.id, limit: 500 } })
      .then(({ data }) => {
        if (cancelled) return
        const list: TaskRow[] = (data?.tasks ?? data ?? []).filter(
          (t: any) => !['COMPLETED', 'ARCHIVED'].includes(t.phase),
        )
        setTasks(list)
        // Default to carrying everything: losing work silently is the failure mode
        // worth designing against, so opting out is the deliberate act.
        setSelected(new Set(list.map((t) => t.id)))
      })
      .catch(() => { if (!cancelled) toast.error('Could not load this quarter\'s tasks') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [quarter.id])

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const releasedCount = tasks.length - selected.size

  const submit = async () => {
    setSaving(true)
    try {
      const leaveUnscheduled = nextQuarterId === UNSCHEDULED
      const { data } = await api.post(`/quarters/${quarter.id}/close`, {
        rolloverTaskIds: Array.from(selected),
        nextQuarterId: leaveUnscheduled ? undefined : nextQuarterId || undefined,
        leaveUnscheduled,
      })
      toast.success(data?.message ?? 'Quarter closed.', { duration: 7000 })
      onClosed(
        data?.nextQuarter
          ? {
              id: data.nextQuarter.id,
              year: data.nextQuarter.year,
              started: Boolean(data.nextQuarter.started),
            }
          : null,
      )
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Could not close this quarter')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="close-cycle-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        className="surface flex max-h-[85vh] w-full max-w-2xl flex-col shadow-lg"
      >
        <header className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <div>
            <h2 id="close-cycle-title" className="section-title">
              Close {quarter.name} {quarter.year}
            </h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Choose what happens to work that is not finished. The next cycle takes over from here,
              and stays hidden from the team until its objectives have key results.
            </p>
          </div>
          <button aria-label="Cancel" onClick={onCancel} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
              ))}
            </div>
          ) : tasks.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-600 dark:text-gray-400">
              Every task in this quarter is finished. Nothing needs a decision.
            </p>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {tasks.length} unfinished {tasks.length === 1 ? 'task' : 'tasks'}
                </p>
                <div className="flex gap-2 text-sm">
                  <button onClick={() => setSelected(new Set(tasks.map((t) => t.id)))} className="font-medium text-primary-600 hover:underline dark:text-primary-400">
                    Carry all
                  </button>
                  <span className="text-gray-400" aria-hidden="true">|</span>
                  <button onClick={() => setSelected(new Set())} className="font-medium text-primary-600 hover:underline dark:text-primary-400">
                    Carry none
                  </button>
                </div>
              </div>

              <ul className="space-y-1.5">
                {tasks.map((t) => (
                  <li key={t.id}>
                    <label className="surface-muted flex cursor-pointer items-center gap-3 p-3">
                      <input
                        type="checkbox"
                        checked={selected.has(t.id)}
                        onChange={() => toggle(t.id)}
                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-900"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">{t.title}</span>
                        <span className="block text-xs text-gray-500 dark:text-gray-400">
                          {t.taskNumber ? `${t.taskNumber} · ` : ''}
                          {t.assignedTo?.name ?? 'Unassigned'}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <footer className="space-y-4 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
          {selected.size > 0 && (
            <div>
              <label htmlFor="next-quarter" className="form-label">Carry the ticked tasks into</label>
              <select id="next-quarter" value={nextQuarterId} onChange={(e) => setNextQuarterId(e.target.value)} className="select-field">
                {targets.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.name} {q.year}
                    {q.id === successor?.id ? ' (next cycle)' : ''}
                  </option>
                ))}
                <option value={UNSCHEDULED}>No quarter yet, leave them unscheduled</option>
              </select>
            </div>
          )}

          {releasedCount > 0 && (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              {releasedCount} {releasedCount === 1 ? 'task keeps its assignee but will belong' : 'tasks keep their assignees but will belong'} to
              no quarter. They stay findable under the Not scheduled filter on Tasks, and their assignees are notified.
            </p>
          )}

          <div className="flex justify-end gap-3">
            <button onClick={onCancel} className="btn-secondary">Cancel</button>
            <button onClick={submit} disabled={saving || loading} className="btn-primary">
              {saving ? <ArrowPathIcon className="mr-2 h-4 w-4 animate-spin" /> : <LockClosedIcon className="mr-2 h-4 w-4" />}
              Close quarter
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

export default CloseCycleModal
