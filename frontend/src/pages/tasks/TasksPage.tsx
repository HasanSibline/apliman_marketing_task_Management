import React, { useEffect, useMemo, useState } from 'react'
import {
  PlusIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  CalendarDaysIcon,
  ClipboardDocumentListIcon,
} from '@heroicons/react/24/outline'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { fetchTasks, setFilters } from '@/store/slices/tasksSlice'
import CreateTaskModal from '@/components/tasks/CreateTaskModal'
import TaskListItem from '@/components/tasks/TaskListItem'
import ExportButton from '@/components/tasks/ExportButton'
import EmptyState from '@/components/common/EmptyState'
import api, { workflowsApi, usersApi } from '@/services/api'
import toast from 'react-hot-toast'
import { Task } from '@/types/task'
import { taskStage, TaskStage, STAGES } from '@/lib/taskStage'
import TaskScheduleBar from './TaskScheduleBar'

/**
 * Work, arranged the way it is worked.
 *
 * It used to be grouped by workflow, every workflow expanded at once, each holding a
 * three-column grid of cards. That answers "what kind of work is this", which is a
 * question about categories, and never "what is in flight", which is the question
 * someone actually opens this page with. It also grew without bound: ten workflows
 * meant ten stacked sections to scroll past.
 *
 * So one workflow at a time, chosen from a rail across the top, and inside it three
 * columns. Nothing stacks, nothing nests, and the amount on screen does not change
 * with how many workflows the company has.
 */

const TasksPage: React.FC = () => {
  const dispatch = useAppDispatch()
  const { tasks: apiTasks, isLoading, filters } = useAppSelector((state) => state.tasks)
  const { user } = useAppSelector((state) => state.auth)

  const tasks = useMemo(
    () => apiTasks.map((t) => ({ ...t, createdById: t.createdBy?.id || '' })) as Task[],
    [apiTasks],
  )

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [workflows, setWorkflows] = useState<any[]>([])
  const [people, setPeople] = useState<{ id: string; name: string }[]>([])
  const [quarters, setQuarters] = useState<any[]>([])

  /** '' is every workflow at once, which is still three columns and not a stack. */
  const [workflowId, setWorkflowId] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Work in nobody's quarter is the easiest to lose: it appears on no quarter page
  // and nothing else surfaces it. The API supports quarterId=null; this exposes it.
  const [scope, setScope] = useState<'all' | 'active' | 'backlog'>('all')

  useEffect(() => {
    const scoped =
      scope === 'backlog' ? { quarterId: 'null' } : scope === 'active' ? { quarterId: 'active' } : {}
    dispatch(fetchTasks({ ...filters, ...scoped, limit: 10000 }))
  }, [dispatch, filters, scope])

  useEffect(() => {
    workflowsApi.getAll().then((w) => setWorkflows(w ?? [])).catch(() => setWorkflows([]))
    // Only quarters that can still receive work: scheduling into a closed one would
    // hide the task the moment it landed.
    api.get('/quarters', { params: { selectable: 'true' } })
      .then(({ data }) => setQuarters(data ?? []))
      .catch(() => setQuarters([]))
    usersApi.getAll()
      .then((u: any) => setPeople((u?.users ?? u ?? []).map((p: any) => ({ id: p.id, name: p.name }))))
      .catch(() => setPeople([]))
  }, [])

  const reload = () => {
    const scoped =
      scope === 'backlog' ? { quarterId: 'null' } : scope === 'active' ? { quarterId: 'active' } : {}
    dispatch(fetchTasks({ ...filters, ...scoped, limit: 10000 }))
  }

  const visible = useMemo(
    () => (workflowId ? tasks.filter((t) => t.workflow?.id === workflowId) : tasks),
    [tasks, workflowId],
  )

  const byStage = useMemo(() => {
    const groups: Record<TaskStage, Task[]> = { TODO: [], IN_PROGRESS: [], COMPLETED: [] }
    for (const task of visible) groups[taskStage(task)].push(task)
    return groups
  }, [visible])

  const countFor = (id: string) =>
    id ? tasks.filter((t) => t.workflow?.id === id).length : tasks.length

  // Selection follows what is on screen. Acting on a task the filters have hidden
  // would be acting on something the person cannot see.
  const visibleIds = useMemo(() => new Set(visible.map((t) => t.id)), [visible])
  const selectedVisible = useMemo(
    () => [...selected].filter((id) => visibleIds.has(id)),
    [selected, visibleIds],
  )

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const toggleStage = (stage: TaskStage) => {
    const ids = byStage[stage].map((t) => t.id)
    const allOn = ids.length > 0 && ids.every((id) => selected.has(id))
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of ids) allOn ? next.delete(id) : next.add(id)
      return next
    })
  }

  const activeFilters = [filters.search, filters.assignedToId, filters.priority].filter(Boolean).length

  const clearFilters = () =>
    dispatch(setFilters({ search: undefined, assignedToId: undefined, priority: undefined }))

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Tasks</h1>
          <p className="page-subtitle">
            {scope === 'backlog'
              ? 'Work that belongs to no quarter yet. Tick what you want to schedule.'
              : scope === 'active'
                ? 'Work in the quarter running now.'
                : 'Everything on the board, by workflow and by where it has got to.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ExportButton filters={filters} />
          <button onClick={() => setShowCreateModal(true)} className="btn-primary">
            <PlusIcon className="mr-2 h-4 w-4" />
            New task
          </button>
        </div>
      </header>

      {/* ── Controls ──────────────────────────────────────────────────────── */}
      <div className="surface flex flex-wrap items-center gap-3 p-3">
        <div className="relative min-w-[14rem] flex-1">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            aria-label="Search tasks"
            placeholder="Search tasks"
            value={filters.search || ''}
            onChange={(e) => dispatch(setFilters({ search: e.target.value || undefined }))}
            className="input-field pl-9"
          />
        </div>

        <div role="group" aria-label="Which tasks" className="surface-muted inline-flex p-1">
          {([
            { key: 'all', label: 'All' },
            { key: 'active', label: 'This quarter' },
            { key: 'backlog', label: 'Not scheduled' },
          ] as const).map((option) => (
            <button
              key={option.key}
              onClick={() => setScope(option.key)}
              aria-pressed={scope === option.key}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                scope === option.key
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <select
          aria-label="Assigned to"
          value={filters.assignedToId || ''}
          onChange={(e) => dispatch(setFilters({ assignedToId: e.target.value || undefined }))}
          className="select-field w-auto"
        >
          <option value="">Anyone</option>
          {user && <option value={user.id}>Assigned to me</option>}
          {people.filter((p) => p.id !== user?.id).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <select
          aria-label="Priority"
          value={filters.priority || ''}
          onChange={(e) =>
            dispatch(setFilters({ priority: e.target.value ? parseInt(e.target.value) : undefined }))
          }
          className="select-field w-auto"
        >
          <option value="">Any priority</option>
          <option value="5">Critical</option>
          <option value="4">Urgent</option>
          <option value="3">High</option>
          <option value="2">Medium</option>
          <option value="1">Low</option>
        </select>

        {activeFilters > 0 && (
          <button onClick={clearFilters} className="btn-secondary">
            <XMarkIcon className="mr-2 h-4 w-4" />
            Clear
          </button>
        )}
      </div>

      {/* ── Workflow rail. One at a time, so nothing stacks. ──────────────── */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Workflow">
        {[{ id: '', name: 'All work', color: null as string | null }, ...workflows].map((w) => {
          const on = workflowId === w.id
          const count = countFor(w.id)
          return (
            <button
              key={w.id || 'all'}
              onClick={() => setWorkflowId(w.id)}
              aria-pressed={on}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                on
                  ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/25 dark:text-primary-300'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-600'
              }`}
            >
              {w.color && (
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: w.color }}
                  aria-hidden="true"
                />
              )}
              {w.name}
              <span className="tabular-nums text-xs text-gray-500 dark:text-gray-400">{count}</span>
            </button>
          )
        })}
      </div>

      {/* ── Three columns ────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-64 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={ClipboardDocumentListIcon}
          title={activeFilters > 0 ? 'Nothing matches those filters' : 'No tasks here yet'}
          description={
            activeFilters > 0
              ? 'Widen the search, or clear the filters to see everything again.'
              : 'A task is a piece of work. Create one to get the board started.'
          }
          action={
            activeFilters > 0 ? (
              <button onClick={clearFilters} className="btn-secondary">Clear filters</button>
            ) : (
              <button onClick={() => setShowCreateModal(true)} className="btn-primary">
                <PlusIcon className="mr-2 h-4 w-4" />
                New task
              </button>
            )
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {STAGES.map((stage) => {
            const column = byStage[stage.key]
            const allTicked = column.length > 0 && column.every((t) => selected.has(t.id))
            return (
              <section key={stage.key} className="surface flex flex-col overflow-hidden">
                <header className="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${stage.dot}`} aria-hidden="true" />
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                      {stage.label}
                    </h2>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium tabular-nums text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                      {column.length}
                    </span>
                  </div>

                  {column.length > 0 && (
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                      <input
                        type="checkbox"
                        checked={allTicked}
                        onChange={() => toggleStage(stage.key)}
                        aria-label={`Select every task in ${stage.label}`}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-900"
                      />
                      All
                    </label>
                  )}
                </header>

                <div className="flex-1 space-y-2.5 p-3">
                  {column.length === 0 ? (
                    <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                      {stage.empty}
                    </p>
                  ) : (
                    column.map((task) => (
                      <div key={task.id} className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={selected.has(task.id)}
                          onChange={() => toggle(task.id)}
                          aria-label={`Select ${task.title}`}
                          className="mt-3 h-4 w-4 shrink-0 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-900"
                        />
                        <div className="min-w-0 flex-1">
                          <TaskListItem task={task} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {!isLoading && visible.length > 0 && (
        <p className="flex items-center justify-center gap-1.5 text-center text-sm text-gray-500 dark:text-gray-400">
          <CalendarDaysIcon className="h-4 w-4" aria-hidden="true" />
          {byStage.TODO.length} to do, {byStage.IN_PROGRESS.length} in progress,{' '}
          {byStage.COMPLETED.length} completed
        </p>
      )}

      <TaskScheduleBar
        taskIds={selectedVisible}
        quarters={quarters}
        onClear={() => setSelected(new Set())}
        onDone={() => {
          setSelected(new Set())
          reload()
        }}
        onError={(message) => toast.error(message)}
      />

      <CreateTaskModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} />
    </div>
  )
}

export default TasksPage
