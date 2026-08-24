import React, { useEffect, useMemo, useState } from 'react'
import {
  XMarkIcon,
  ArrowPathIcon,
  ArrowRightCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import api from '@/services/api'
import toast from 'react-hot-toast'

/**
 * Ending a year, with the same care one quarter's close gets.
 *
 * Ending a year used to shut every open quarter directly. Unfinished tasks kept
 * pointing at a closed cycle: not carried, not released, just gone from view, and
 * nobody was told. So the decision is asked once here, across every quarter still
 * open, and the consequence of each choice is stated before it is made.
 *
 * Unmet objectives are carried by the server whatever is chosen here. That is not a
 * decision to offer: a goal the company missed does not stop mattering in January,
 * and the carried copy keeps the miss on last year's record.
 */

interface OpenQuarter {
  id: string
  name: string
  year: number
  status: string
}

interface OpenTask {
  id: string
  title: string
  taskNumber?: string | null
  quarterId: string | null
  assignedTo?: { name: string } | null
}

interface Props {
  year: number
  onCancel: () => void
  onClosed: (nextYear: number) => void
}

const EndYearModal: React.FC<Props> = ({ year, onCancel, onClosed }) => {
  const [quarters, setQuarters] = useState<OpenQuarter[]>([])
  const [tasks, setTasks] = useState<OpenTask[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  /**
   * The open-tasks read failed, so nothing here can be trusted.
   *
   * On failure `quarters` and `tasks` both stayed empty, which rendered "Every quarter
   * in {year} is already closed" over a year that was still running, and left the
   * confirm button live. Confirming then posted `rolloverTaskIds: []`, releasing every
   * unfinished task in the year from its quarter. The dialog's whole job is to make
   * that a choice, so it must refuse to act when it cannot see what it is acting on.
   */
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .get(`/quarters/year/${year}/open-tasks`)
      .then(({ data }) => {
        if (cancelled) return
        const list: OpenTask[] = data?.tasks ?? []
        setQuarters(data?.quarters ?? [])
        setTasks(list)
        // Carrying is the default, so a release is something a person chose.
        setSelected(new Set(list.map((t) => t.id)))
      })
      .catch(() => {
        if (cancelled) return
        setLoadFailed(true)
        toast.error('Could not read what is still open')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [year])

  const byQuarter = useMemo(() => {
    const groups = new Map<string, OpenTask[]>()
    for (const t of tasks) {
      const key = t.quarterId ?? 'none'
      const list = groups.get(key)
      if (list) list.push(t)
      else groups.set(key, [t])
    }
    return groups
  }, [tasks])

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
      const { data } = await api.post(`/quarters/year/${year}/close`, {
        rolloverTaskIds: Array.from(selected),
      })
      toast.success(
        data?.started
          ? `${year} closed. ${data.targetQuarter} ${data.nextYear} has started.`
          : `${year} closed. ${data?.targetQuarter ?? 'The next quarter'} ${data?.nextYear ?? year + 1} is ready to plan.`,
        { duration: 7000 },
      )
      onClosed(data?.nextYear ?? year + 1)
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Could not close this year')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="end-year-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        className="surface flex max-h-[85vh] w-full max-w-2xl flex-col shadow-lg"
      >
        <header className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <div>
            <h2 id="end-year-title" className="section-title">End {year}</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Closes every quarter still open in {year} and carries unmet objectives into {year + 1},
              each resuming from the progress already made.
            </p>
          </div>
          <button
            aria-label="Cancel"
            onClick={onCancel}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
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
          ) : loadFailed ? (
            <div className="py-6 text-center">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                What is still open in {year} could not be read
              </p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Ending the year is blocked until it can. Otherwise every unfinished task would be
                released from its quarter without appearing in this list first.
              </p>
            </div>
          ) : quarters.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-600 dark:text-gray-400">
              Every quarter in {year} is already closed. Ending the year will still carry any unmet
              objective forward.
            </p>
          ) : tasks.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {quarters.length === 1 ? 'One quarter is' : `${quarters.length} quarters are`} still open,
                and every task in {quarters.length === 1 ? 'it' : 'them'} is finished. Nothing needs a decision.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {tasks.length} unfinished {tasks.length === 1 ? 'task' : 'tasks'} across{' '}
                  {quarters.length === 1 ? 'one quarter' : `${quarters.length} quarters`}
                </p>
                <div className="flex gap-2 text-sm">
                  <button
                    onClick={() => setSelected(new Set(tasks.map((t) => t.id)))}
                    className="font-medium text-primary-600 hover:underline dark:text-primary-400"
                  >
                    Carry all
                  </button>
                  <span className="text-gray-400" aria-hidden="true">|</span>
                  <button
                    onClick={() => setSelected(new Set())}
                    className="font-medium text-primary-600 hover:underline dark:text-primary-400"
                  >
                    Carry none
                  </button>
                </div>
              </div>

              {/* Grouped by quarter: which cycle work was stuck in is the context that
                  makes carrying or dropping it an informed choice. */}
              <div className="space-y-4">
                {quarters.map((q) => {
                  const rows = byQuarter.get(q.id) ?? []
                  if (rows.length === 0) return null
                  return (
                    <section key={q.id}>
                      <h3 className="eyebrow mb-2">
                        {q.name} {q.year} · {rows.length} open
                      </h3>
                      <ul className="space-y-1.5">
                        {rows.map((t) => (
                          <li key={t.id}>
                            <label className="surface-muted flex cursor-pointer items-center gap-3 p-3">
                              <input
                                type="checkbox"
                                checked={selected.has(t.id)}
                                onChange={() => toggle(t.id)}
                                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-900"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">
                                  {t.title}
                                </span>
                                <span className="block text-xs text-gray-500 dark:text-gray-400">
                                  {t.taskNumber ? `${t.taskNumber} · ` : ''}
                                  {t.assignedTo?.name ?? 'Unassigned'}
                                </span>
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )
                })}
              </div>
            </>
          )}
        </div>

        <footer className="space-y-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
          <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
            <ArrowRightCircleIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>
              Ticked tasks move into the first quarter of {year + 1}. If {year + 1} is already planned
              its first quarter starts straight away; if not, it is created for you and waits until you
              have written its objectives.
            </p>
          </div>

          {releasedCount > 0 && (
            <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
              <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>
                {releasedCount} {releasedCount === 1 ? 'task keeps its assignee but will belong' : 'tasks keep their assignees but will belong'} to
                no quarter. They stay findable under the Not scheduled filter on Tasks, and their
                assignees are notified.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button onClick={onCancel} className="btn-secondary">Cancel</button>
            <button onClick={submit} disabled={saving || loading || loadFailed} className="btn-primary">
              {saving ? (
                <ArrowPathIcon className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ArrowRightCircleIcon className="mr-2 h-4 w-4" />
              )}
              End {year} and open {year + 1}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

export default EndYearModal
