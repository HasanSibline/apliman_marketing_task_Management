import React, { useState } from 'react'
import { confirmDialog } from '@/components/ui/confirm'
import {
  CheckCircleIcon,
  ChevronRightIcon,
  PlusIcon,
  TrashIcon,
  PencilIcon,
} from '@heroicons/react/24/outline'
import api from '@/services/api'
import toast from 'react-hot-toast'

/**
 * One objective, with its key results and the work behind each of them.
 *
 * Everything is editable here. Sending someone to another page to add a key result
 * or to see which tasks moved a number breaks the one thing this section is for.
 *
 * currentValue is never editable: it is calculated from the linked tasks. Only what
 * a key result measures (its title, unit, start and target) is set by a person.
 */

export interface KeyResult {
  id: string
  title: string
  unit?: string | null
  startValue: number
  targetValue: number
  currentValue: number
}

export interface Objective {
  id: string
  title: string
  description?: string | null
  status: string
  progress?: number
  keyResults: KeyResult[]
}

interface LinkedTask {
  id: string
  title: string
  taskNumber?: string | null
  phaseName: string
  assignee: string | null
  isComplete: boolean
  subtasksTotal: number
  subtasksDone: number
  contribution: number
}

const STATUS: Record<string, { label: string; className: string }> = {
  ON_TRACK: { label: 'On track', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  AT_RISK: { label: 'At risk', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
  OFF_TRACK: { label: 'Off track', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
  COMPLETED: { label: 'Completed', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  CANCELLED: { label: 'Cancelled', className: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200' },
}

export function krProgress(kr: KeyResult): number {
  const range = kr.targetValue - kr.startValue
  if (range === 0) return kr.currentValue >= kr.targetValue ? 100 : 0
  return Math.min(100, Math.max(0, Math.round(((kr.currentValue - kr.startValue) / range) * 100)))
}

export function objProgress(o: Objective): number {
  if (typeof o.progress === 'number') return o.progress
  if (!o.keyResults?.length) return 0
  return Math.round(o.keyResults.reduce((s, kr) => s + krProgress(kr), 0) / o.keyResults.length)
}

const blankKr = { title: '', unit: '', startValue: '0', targetValue: '100' }

const ObjectiveCard: React.FC<{
  objective: Objective
  canEdit: boolean
  onChanged: () => void
}> = ({ objective, canEdit, onChanged }) => {
  const [openKr, setOpenKr] = useState<string | null>(null)
  const [tasks, setTasks] = useState<Record<string, LinkedTask[]>>({})
  const [loadingTasks, setLoadingTasks] = useState<string | null>(null)
  const [addingKr, setAddingKr] = useState(false)
  const [editingKr, setEditingKr] = useState<string | null>(null)
  const [form, setForm] = useState(blankKr)
  const [busy, setBusy] = useState(false)

  const progress = objProgress(objective)
  const st = STATUS[objective.status] ?? STATUS.ON_TRACK

  const toggleTasks = async (krId: string) => {
    if (openKr === krId) return setOpenKr(null)
    setOpenKr(krId)
    if (tasks[krId]) return
    setLoadingTasks(krId)
    try {
      const { data } = await api.get(`/objectives/key-results/${krId}/tasks`)
      setTasks((t) => ({ ...t, [krId]: data.tasks ?? [] }))
    } catch {
      toast.error('Could not load the tasks behind this key result')
    } finally {
      setLoadingTasks(null)
    }
  }

  const saveKr = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      title: form.title.trim(),
      unit: form.unit.trim() || undefined,
      startValue: Number(form.startValue),
      targetValue: Number(form.targetValue),
    }
    if (!payload.title) return
    if (Number.isNaN(payload.startValue) || Number.isNaN(payload.targetValue)) {
      return toast.error('Start and target must be numbers')
    }
    setBusy(true)
    try {
      if (editingKr) {
        await api.patch(`/objectives/key-results/${editingKr}`, payload)
        toast.success('Key result updated')
      } else {
        await api.post(`/objectives/${objective.id}/key-results`, payload)
        toast.success('Key result added')
      }
      setForm(blankKr)
      setAddingKr(false)
      setEditingKr(null)
      onChanged()
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Could not save the key result')
    } finally {
      setBusy(false)
    }
  }

  const removeKr = async (kr: KeyResult) => {
    if (!(await confirmDialog({
      title: `Delete "${kr.title}"?`,
      description: 'The tasks linked to it stay exactly as they are, but stop measuring anything.',
      confirmText: 'Delete key result',
      variant: 'danger',
    }))) return
    setBusy(true)
    try {
      await api.delete(`/objectives/key-results/${kr.id}`)
      toast.success('Key result deleted')
      onChanged()
    } catch {
      toast.error('Could not delete the key result')
    } finally {
      setBusy(false)
    }
  }

  const startEdit = (kr: KeyResult) => {
    setEditingKr(kr.id)
    setAddingKr(false)
    setForm({
      title: kr.title,
      unit: kr.unit ?? '',
      startValue: String(kr.startValue),
      targetValue: String(kr.targetValue),
    })
  }

  return (
    <li className="surface-muted p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-medium text-gray-900 dark:text-white">{objective.title}</h4>
          {objective.description && (
            <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">{objective.description}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.className}`}>{st.label}</span>
          <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-white">{progress}%</span>
        </div>
      </div>

      <div
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${objective.title} progress`}
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
      >
        <div className="h-full rounded-full bg-primary-600 transition-all" style={{ width: `${progress}%` }} />
      </div>

      {objective.keyResults?.length > 0 && (
        <ul className="mt-4 space-y-2">
          {objective.keyResults.map((kr) => {
            const p = krProgress(kr)
            const open = openKr === kr.id
            const rows = tasks[kr.id]
            return (
              <li key={kr.id} className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleTasks(kr.id)}
                    aria-expanded={open}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <ChevronRightIcon className={`h-4 w-4 shrink-0 text-gray-500 transition-transform dark:text-gray-400 ${open ? 'rotate-90' : ''}`} />
                    {p >= 100 ? (
                      <CheckCircleIcon className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                    ) : (
                      <span className="h-4 w-4 shrink-0 rounded-full border border-gray-300 dark:border-gray-600" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm text-gray-800 dark:text-gray-200">{kr.title}</span>
                    <span className="shrink-0 text-sm tabular-nums text-gray-600 dark:text-gray-400">
                      {Math.round(kr.currentValue)} of {kr.targetValue}{kr.unit ? ` ${kr.unit}` : ''}
                    </span>
                  </button>

                  {canEdit && (
                    <span className="flex shrink-0 gap-1">
                      <button aria-label={`Edit ${kr.title}`} onClick={() => startEdit(kr)} className="rounded p-1 text-gray-500 hover:text-primary-600 dark:text-gray-400">
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <button aria-label={`Delete ${kr.title}`} onClick={() => removeKr(kr)} className="rounded p-1 text-gray-500 hover:text-red-600 dark:text-gray-400">
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </span>
                  )}
                </div>

                {open && (
                  <div className="mt-3 border-t border-gray-200 pt-3 dark:border-gray-700">
                    {loadingTasks === kr.id ? (
                      <div className="h-10 animate-pulse rounded bg-gray-100 dark:bg-gray-700" />
                    ) : !rows || rows.length === 0 ? (
                      <p className="text-sm text-amber-700 dark:text-amber-400">
                        No tasks are linked, so this stays at its starting value. Link a task to this key
                        result from the task itself and progress will follow the work.
                      </p>
                    ) : (
                      <>
                        <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                          Calculated from {rows.length} {rows.length === 1 ? 'task' : 'tasks'}. Each contributes
                          up to an equal share.
                        </p>
                        <ul className="space-y-1.5">
                          {rows.map((t) => (
                            <li key={t.id} className="flex items-center gap-3 text-sm">
                              <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-300">
                                {t.title}
                                {t.subtasksTotal > 0 && (
                                  <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
                                    ({t.subtasksDone}/{t.subtasksTotal} subtasks)
                                  </span>
                                )}
                              </span>
                              <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{t.assignee ?? 'Unassigned'}</span>
                              <span className="w-12 shrink-0 text-right text-sm font-medium tabular-nums text-gray-900 dark:text-white">
                                {t.contribution}%
                              </span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {(!objective.keyResults || objective.keyResults.length === 0) && !addingKr && (
        <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">
          No key results yet, so this objective cannot show progress.
        </p>
      )}

      {canEdit && (addingKr || editingKr) && (
        <form onSubmit={saveKr} className="mt-3 space-y-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div>
            <label htmlFor={`kr-title-${objective.id}`} className="form-label">What is measured?</label>
            <input
              id={`kr-title-${objective.id}`}
              autoFocus
              required
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Enterprise accounts renewed"
              className="input-field"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor={`kr-start-${objective.id}`} className="form-label">Start</label>
              <input id={`kr-start-${objective.id}`} type="number" value={form.startValue}
                onChange={(e) => setForm((f) => ({ ...f, startValue: e.target.value }))} className="input-field" />
            </div>
            <div>
              <label htmlFor={`kr-target-${objective.id}`} className="form-label">Target</label>
              <input id={`kr-target-${objective.id}`} type="number" value={form.targetValue}
                onChange={(e) => setForm((f) => ({ ...f, targetValue: e.target.value }))} className="input-field" />
            </div>
            <div>
              <label htmlFor={`kr-unit-${objective.id}`} className="form-label">Unit (optional)</label>
              <input id={`kr-unit-${objective.id}`} value={form.unit}
                onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} placeholder="accounts" className="input-field" />
            </div>
          </div>
          <p className="form-hint">
            The current value is not set here. It is calculated from the tasks linked to this key result.
          </p>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? 'Saving…' : editingKr ? 'Save changes' : 'Add key result'}
            </button>
            <button type="button" onClick={() => { setAddingKr(false); setEditingKr(null); setForm(blankKr) }} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      )}

      {canEdit && !addingKr && !editingKr && (
        <button
          onClick={() => { setAddingKr(true); setForm(blankKr) }}
          className="mt-3 text-sm font-medium text-primary-600 hover:underline dark:text-primary-400"
        >
          <PlusIcon className="mr-1 inline h-4 w-4" />
          Add a key result
        </button>
      )}
    </li>
  )
}

export default ObjectiveCard
