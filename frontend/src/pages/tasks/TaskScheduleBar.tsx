import React, { useState } from 'react'
import { XMarkIcon, ArrowPathIcon, CalendarDaysIcon } from '@heroicons/react/24/outline'
import api from '@/services/api'
import toast from 'react-hot-toast'

/**
 * What to do with the tasks you ticked.
 *
 * Appears only when something is selected, so it costs nothing the rest of the time,
 * and sits above the page rather than inside a column: the selection can span all
 * three, and an action that lives in one of them would suggest otherwise.
 *
 * Only quarters that can still receive work are offered. Scheduling into a closed
 * one would hide the task the moment it landed, which looks exactly like losing it.
 */

interface Quarter {
  id: string
  name: string
  year: number
  status: string
}

interface Props {
  taskIds: string[]
  quarters: Quarter[]
  onClear: () => void
  onDone: () => void
  onError: (message: string) => void
}

const TaskScheduleBar: React.FC<Props> = ({ taskIds, quarters, onClear, onDone, onError }) => {
  const [quarterId, setQuarterId] = useState('')
  const [saving, setSaving] = useState(false)

  if (taskIds.length === 0) return null

  const schedule = async (target: string | null) => {
    setSaving(true)
    try {
      const { data } = await api.patch('/tasks/bulk/quarter', { taskIds, quarterId: target })
      const moved = data?.moved ?? 0
      const skipped: { title: string; reason: string }[] = data?.skipped ?? []

      if (moved > 0) {
        toast.success(
          target
            ? `${moved} ${moved === 1 ? 'task' : 'tasks'} scheduled`
            : `${moved} ${moved === 1 ? 'task' : 'tasks'} unscheduled`,
        )
      }

      // Naming what did not move, and why. A count that quietly differs from the
      // number ticked is the kind of thing people notice a week later.
      if (skipped.length > 0) {
        toast(
          `${skipped.length} left where ${skipped.length === 1 ? 'it was' : 'they were'}: ` +
            skipped.slice(0, 2).map((s) => `"${s.title}" is ${s.reason}`).join('; ') +
            (skipped.length > 2 ? `, and ${skipped.length - 2} more` : ''),
          { duration: 9000, icon: '⚠️' },
        )
      }

      onDone()
    } catch (e: any) {
      onError(e?.response?.data?.message ?? 'Could not schedule those tasks')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      role="region"
      aria-label="Selected tasks"
      className="sticky bottom-4 z-30 mx-auto flex w-fit max-w-full flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-lg dark:border-gray-700 dark:bg-gray-800"
    >
      <span className="text-sm font-medium text-gray-900 dark:text-white">
        {taskIds.length} selected
      </span>

      <span className="hidden h-5 w-px bg-gray-200 sm:block dark:bg-gray-700" aria-hidden="true" />

      <label htmlFor="schedule-quarter" className="text-sm text-gray-600 dark:text-gray-400">
        Add to
      </label>
      <select
        id="schedule-quarter"
        value={quarterId}
        onChange={(e) => setQuarterId(e.target.value)}
        className="select-field w-auto"
      >
        <option value="">Choose a quarter</option>
        {quarters.map((q) => (
          <option key={q.id} value={q.id}>
            {q.name} {q.year}
            {q.status === 'UPCOMING' ? ' (upcoming)' : ''}
          </option>
        ))}
      </select>

      <button
        onClick={() => schedule(quarterId)}
        disabled={!quarterId || saving}
        className="btn-primary"
      >
        {saving ? (
          <ArrowPathIcon className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <CalendarDaysIcon className="mr-2 h-4 w-4" />
        )}
        Schedule
      </button>

      <button onClick={() => schedule(null)} disabled={saving} className="btn-secondary">
        Unschedule
      </button>

      <button
        onClick={onClear}
        aria-label="Clear selection"
        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        <XMarkIcon className="h-5 w-5" />
      </button>
    </div>
  )
}

export default TaskScheduleBar
