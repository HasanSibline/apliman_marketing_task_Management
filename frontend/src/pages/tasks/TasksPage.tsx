import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import type { DropResult } from '@hello-pangea/dnd'
import { Menu } from '@headlessui/react'
import { EllipsisVerticalIcon } from '@heroicons/react/24/outline'
import { tasksApi } from '@/services/api'
import { taskStage, TaskStage, STAGES, byDeadline } from '@/lib/taskStage'
import TaskScheduleBar from './TaskScheduleBar'
import CompleteTaskDialog from './CompleteTaskDialog'
import Select from '@/components/ui/Select'

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
  const navigate = useNavigate()

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

  // Where a card is shown while the server catches up. Dropping a card and watching
  // it sit still until a request returns feels broken even when nothing is wrong.
  const [moved, setMoved] = useState<Record<string, TaskStage>>({})
  const [confirming, setConfirming] = useState<{ task: Task; from: TaskStage } | null>(null)

  const isAdmin = !!user && ['SUPER_ADMIN', 'COMPANY_ADMIN', 'ADMIN'].includes(user.role)
  /** Your own work, or anyone's if you are an admin. */
  const canMove = (task: Task) => isAdmin || task.assignedToId === user?.id

  /**
   * Done is the asker's word. Whoever requested the work decides whether what came
   * back is what they wanted, and completing counts the task in full toward its key
   * result, so it moves an objective on that person's say-so. The server enforces
   * this; the board only avoids offering a move it knows will be refused.
   */
  const canComplete = (task: Task) =>
    isAdmin || (task as any).createdById === user?.id || task.createdBy?.id === user?.id

  // Work in nobody's quarter is the easiest to lose: it appears on no quarter page
  // and nothing else surfaces it. The API supports quarterId=null; this exposes it.
  const [scope, setScope] = useState<'all' | 'active' | 'backlog' | 'history'>('all')
  /** History only. Managers see the team's by default; this narrows it to themselves. */
  const [mineOnly, setMineOnly] = useState(false)

  /**
   * Whether this person's list contains anybody else's work.
   *
   * The server already restricts an employee to their own tasks, so for them the
   * toggle would filter a list down to itself. Reviewing what the team shipped is the
   * main reason anyone opens History, so it stays off by default for those who can.
   */
  const canSeeOthers = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'ADMIN', 'MANAGER'].includes(
    user?.role ?? '',
  )

  /**
   * Why the board is empty, when it is empty.
   *
   * The page read nothing about failure, so an outage rendered as "No tasks here
   * yet" over a button inviting the user to create the first one. Everything they
   * had was still on the server.
   *
   * It is tracked here rather than read from `state.tasks.error`, because that field
   * is shared: createTask and updateTask write to it too, so a rejected save on an
   * empty board would have been reported as a board that failed to load. The result
   * of this dispatch is about this dispatch and nothing else.
   */
  const [listError, setListError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const scoped =
      scope === 'backlog' ? { quarterId: 'null' } : scope === 'active' ? { quarterId: 'active' } : {}
    const result = await dispatch(fetchTasks({ ...filters, ...scoped, limit: 10000 }))
    setListError(
      fetchTasks.rejected.match(result)
        ? (result.payload as string) || 'The server did not answer.'
        : null,
    )
  }, [dispatch, filters, scope])

  useEffect(() => {
    load()
  }, [load])

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
    void load()
  }

  /**
   * When finished work stops being current.
   *
   * The board had no bound on its Completed column, so it accumulated every task the
   * company ever finished and eventually showed mostly archive. Fourteen days is the
   * span in which "did we ship that?" is still a live question; past it, the answer is
   * history and belongs somewhere you go on purpose.
   *
   * Ageing rather than a Close button people press: a manual step gets forgotten, and a
   * board that is only tidy when everybody remembers is a board that is never tidy.
   * Nothing moves, nothing is marked, nothing is destroyed. This is a view.
   */
  const RECENT_DAYS = 14

  const isAged = (task: Task) => {
    if (taskStage(task) !== 'COMPLETED') return false
    // Finished but with no completion date recorded is old work from before that was
    // written, so it belongs in history rather than sitting on the board forever.
    if (!task.completedAt) return true
    return Date.now() - new Date(task.completedAt).getTime() > RECENT_DAYS * 86_400_000
  }

  const mine = (task: Task) =>
    task.assignedToId === user?.id ||
    task.createdById === user?.id ||
    task.assignments?.some((a: any) => a.userId === user?.id)

  /**
   * Everything the current view covers, before the workflow rail narrows it.
   *
   * Split out from `visible` so the counts on the rail can be measured against the
   * same set of tasks the columns are drawn from. They used to be counted off the raw
   * `tasks` list, which still holds work that ageing has moved to History and work the
   * scope filter has excluded, so the pill on "All work" regularly read higher than
   * the three columns underneath it summed to. Two numbers about the same board,
   * disagreeing, a few hundred pixels apart.
   */
  const scoped = useMemo(() => {
    if (scope === 'history') {
      const finished = tasks.filter(isAged)
      return mineOnly ? finished.filter(mine) : finished
    }
    // Aged work leaves the board. It is still one click away under History.
    return tasks.filter((t) => !isAged(t))
  }, [tasks, scope, mineOnly, user?.id])

  const visible = useMemo(
    () => (workflowId ? scoped.filter((t) => t.workflow?.id === workflowId) : scoped),
    [scoped, workflowId],
  )

  /**
   * Drop an optimistic move once the server has confirmed it.
   *
   * `moved` was written on every drag and only ever deleted when the request failed.
   * After a successful move the entry stayed for the rest of the session, and
   * `byStage` prefers it over whatever arrives from the server, so the reload fired
   * on the next line was ignored for that card forever. If a colleague moved the task
   * afterwards, or the server put it somewhere else, this board kept showing the
   * local guess and no amount of refreshing would correct it.
   */
  useEffect(() => {
    setMoved((prev) => {
      const stillPending = Object.entries(prev).filter(([taskId, stage]) => {
        const task = tasks.find((t) => t.id === taskId)
        // Keep it while the server has not caught up, or while the task is not in
        // this page of results at all.
        return !task || taskStage(task) !== stage
      })
      // Same object back when nothing changed, so this cannot loop on itself.
      return stillPending.length === Object.keys(prev).length ? prev : Object.fromEntries(stillPending)
    })
  }, [tasks])

  const byStage = useMemo(() => {
    const groups: Record<TaskStage, Task[]> = { TODO: [], IN_PROGRESS: [], COMPLETED: [] }
    for (const task of visible) groups[moved[task.id] ?? taskStage(task)].push(task)
    // Soonest due at the top of every column, so the next thing needing attention is
    // the first thing read.
    for (const key of Object.keys(groups) as TaskStage[]) groups[key].sort(byDeadline)
    return groups
  }, [visible, moved])

  const countFor = (id: string) =>
    id ? scoped.filter((t) => t.workflow?.id === id).length : scoped.length

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

  /**
   * Move a task, showing it moved straight away.
   *
   * No confirmation: a drag is already deliberate and dragging back undoes it, so
   * asking every time would only train people to dismiss dialogs. Undo is offered
   * instead, which costs nothing to ignore. If the server refuses, the card returns
   * to where it came from and says why.
   */
  const move = async (
    task: Task,
    to: TaskStage,
    opts: { from?: TaskStage; undo?: boolean } = {},
  ) => {
    // Undo has to say where the task is now. Reading it from state here looked
    // equivalent and was not: the toast holds the version of this function from the
    // render that created it, so `moved` still looked empty and the source came out
    // equal to the destination. Undo returned on the next line and did nothing.
    const from = opts.from ?? moved[task.id] ?? taskStage(task)
    if (from === to) return

    setMoved((prev) => ({ ...prev, [task.id]: to }))
    try {
      await tasksApi.setStage(task.id, to)
      const label = STAGES.find((x) => x.key === to)!.label
      if (opts.undo === false) {
        toast.success(`Moved to ${label}`)
      } else {
        toast.success(
          (t) => (
            <span className="flex items-center gap-3">
              Moved to {label}
              <button
                onClick={() => {
                  toast.dismiss(t.id)
                  move(task, from, { from: to, undo: false })
                }}
                className="font-semibold text-primary-600 underline dark:text-primary-400"
              >
                Undo
              </button>
            </span>
          ),
          { duration: 6000 },
        )
      }
      reload()
    } catch (e: any) {
      setMoved((prev) => {
        const next = { ...prev }
        delete next[task.id]
        return next
      })
      toast.error(e?.response?.data?.message ?? 'Could not move that task')
    }
  }

  /**
   * Completing counts a task in full toward its key result even with subtasks
   * unticked, which moves an objective's progress by more than expected. That is the
   * only move here worth stopping for.
   */
  const requestMove = (task: Task, to: TaskStage) => {
    const subtasks = task.subtasks ?? []
    const unfinished = subtasks.filter((s: any) => !s.isCompleted).length
    if (to === 'COMPLETED' && unfinished > 0) {
      setConfirming({ task, from: moved[task.id] ?? taskStage(task) })
      return
    }
    move(task, to)
  }

  const onDragEnd = (result: DropResult) => {
    const { source, destination, draggableId } = result
    if (!destination || destination.droppableId === source.droppableId) return
    const task = visible.find((t) => t.id === draggableId)
    if (!task) return

    const to = destination.droppableId as TaskStage
    const from = source.droppableId as TaskStage
    if ((to === 'COMPLETED' || from === 'COMPLETED') && !canComplete(task)) {
      toast.error(
        to === 'COMPLETED'
          ? 'Only whoever created this task can mark it complete.'
          : 'Only whoever created this task can reopen it.',
      )
      return
    }

    requestMove(task, to)
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
            { key: 'history', label: 'History' },
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

        {/* Only in History, and only for people who see more than their own work.
            An employee already sees nothing but their own, so the toggle would filter
            a list to itself and read as broken. */}
        {scope === 'history' && canSeeOthers && (
          <button
            type="button"
            onClick={() => setMineOnly((v) => !v)}
            aria-pressed={mineOnly}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
              mineOnly
                ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/25 dark:text-primary-300'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
            }`}
          >
            Mine only
          </button>
        )}

        <Select
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
        </Select>

        <Select
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
        </Select>

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
      ) : listError && visible.length === 0 ? (
        <EmptyState
          icon={ClipboardDocumentListIcon}
          title="Your tasks could not be loaded"
          description={`${listError} Nothing has been lost; the board simply has nothing to draw yet.`}
          action={
            <button onClick={reload} className="btn-primary">
              Try again
            </button>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={ClipboardDocumentListIcon}
          title={
            scope === 'history'
              ? 'Nothing here yet'
              : activeFilters > 0
                ? 'Nothing matches those filters'
                : 'No tasks here yet'
          }
          description={
            // History fills itself over time, so offering "create a task" here would
            // answer a question nobody asked.
            scope === 'history'
              ? `Work moves here on its own once it has been finished for ${RECENT_DAYS} days. Until then it stays on the board.`
              : activeFilters > 0
                ? 'Widen the search, or clear the filters to see everything again.'
                : 'A task is a piece of work. Create one to get the board started.'
          }
          action={
            scope === 'history' ? undefined : activeFilters > 0 ? (
              <button onClick={clearFilters} className="btn-secondary">Clear filters</button>
            ) : (
              <button onClick={() => setShowCreateModal(true)} className="btn-primary">
                <PlusIcon className="mr-2 h-4 w-4" />
                New task
              </button>
            )
          }
        />
      ) : scope === 'history' ? (
        /* ── History ──────────────────────────────────────────────────────
           A list, not three columns. Everything here is finished, so a board
           with two permanently empty columns would be two thirds of nothing,
           and nothing here is draggable because there is nowhere to drag it. */
        <div className="surface divide-y divide-gray-100 dark:divide-gray-700">
          {visible
            .slice()
            .sort((a, b) => {
              const at = a.completedAt ? new Date(a.completedAt).getTime() : 0
              const bt = b.completedAt ? new Date(b.completedAt).getTime() : 0
              return bt - at // most recently finished first
            })
            .map((task) => (
              <button
                key={task.id}
                onClick={() => navigate(`/tasks/${task.id}`)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/40"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" aria-hidden="true" />
                <span className="w-[5.5rem] shrink-0 truncate text-xs tabular-nums text-gray-400 dark:text-gray-500">
                  {task.taskNumber ?? '-'}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-gray-800 dark:text-gray-100">
                  {task.title}
                </span>
                {task.workflow?.name && (
                  <span className="hidden shrink-0 text-xs text-gray-400 sm:inline dark:text-gray-500">
                    {task.workflow.name}
                  </span>
                )}
                <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">
                  {task.completedAt
                    ? new Date(task.completedAt).toLocaleDateString()
                    : 'Date not recorded'}
                </span>
              </button>
            ))}
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="grid gap-4 lg:grid-cols-3">
            {STAGES.map((stage) => {
              const column = byStage[stage.key]
              const allTicked = column.length > 0 && column.every((t) => selected.has(t.id))
              return (
                <Droppable droppableId={stage.key} key={stage.key}>
                  {(dropProvided, dropSnapshot) => (
                    <section
                      ref={dropProvided.innerRef}
                      {...dropProvided.droppableProps}
                      className={`surface flex flex-col overflow-hidden transition-colors ${
                        dropSnapshot.isDraggingOver
                          ? 'border-primary-400 bg-primary-50/50 dark:bg-primary-900/10'
                          : ''
                      }`}
                    >
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
                            {dropSnapshot.isDraggingOver ? 'Drop to move it here' : stage.empty}
                          </p>
                        ) : (
                          column.map((task, index) => {
                            const movable = canMove(task)
                            return (
                              <Draggable
                                key={task.id}
                                draggableId={task.id}
                                index={index}
                                isDragDisabled={!movable}
                              >
                                {(dragProvided, dragSnapshot) => (
                                  <div
                                    ref={dragProvided.innerRef}
                                    {...dragProvided.draggableProps}
                                    className={`flex items-start gap-1.5 rounded-xl ${
                                      dragSnapshot.isDragging ? 'shadow-xl ring-2 ring-primary-400' : ''
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selected.has(task.id)}
                                      onChange={() => toggle(task.id)}
                                      aria-label={`Select ${task.title}`}
                                      className="mt-3 h-4 w-4 shrink-0 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-900"
                                    />

                                    {/* The handle is its own control rather than the
                                        whole card, which stays clickable to open the
                                        task. Work assigned to someone else shows the
                                        handle disabled instead of hiding it, so the
                                        rule is visible rather than mysterious. */}
                                    <div
                                      {...dragProvided.dragHandleProps}
                                      aria-label={
                                        movable
                                          ? `Drag ${task.title} to another column`
                                          : `${task.title} is assigned to someone else`
                                      }
                                      title={movable ? 'Drag to move' : 'Only an admin can move this'}
                                      className={`mt-2.5 shrink-0 rounded p-1 ${
                                        movable
                                          ? 'cursor-grab text-gray-400 hover:text-gray-600 active:cursor-grabbing dark:hover:text-gray-200'
                                          : 'cursor-not-allowed text-gray-300 dark:text-gray-600'
                                      }`}
                                    >
                                      <svg viewBox="0 0 10 16" className="h-4 w-3 fill-current" aria-hidden="true">
                                        <circle cx="2" cy="3" r="1.3" />
                                        <circle cx="8" cy="3" r="1.3" />
                                        <circle cx="2" cy="8" r="1.3" />
                                        <circle cx="8" cy="8" r="1.3" />
                                        <circle cx="2" cy="13" r="1.3" />
                                        <circle cx="8" cy="13" r="1.3" />
                                      </svg>
                                    </div>

                                    <div className="min-w-0 flex-1">
                                      <TaskListItem task={task} />
                                    </div>

                                    {/* Touch and keyboard reach the same action. The
                                        columns stack on a phone, where dragging between
                                        them would mean dragging while scrolling. */}
                                    {movable && (
                                      <Menu as="div" className="relative mt-2 shrink-0">
                                        <Menu.Button
                                          aria-label={`Move ${task.title}`}
                                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                                        >
                                          <EllipsisVerticalIcon className="h-5 w-5" />
                                        </Menu.Button>
                                        <Menu.Items className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg focus:outline-none dark:border-gray-700 dark:bg-gray-800">
                                          {STAGES.filter(
                                            (x) =>
                                              x.key !== stage.key &&
                                              // Completing, and reopening, belong to
                                              // whoever asked for the work.
                                              !(
                                                (x.key === 'COMPLETED' || stage.key === 'COMPLETED') &&
                                                !canComplete(task)
                                              ),
                                          ).map((target) => (
                                            <Menu.Item key={target.key}>
                                              {({ active }) => (
                                                <button
                                                  onClick={() => requestMove(task, target.key)}
                                                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 ${
                                                    active ? 'bg-gray-100 dark:bg-gray-700' : ''
                                                  }`}
                                                >
                                                  <span className={`h-2 w-2 rounded-full ${target.dot}`} aria-hidden="true" />
                                                  Move to {target.label}
                                                </button>
                                              )}
                                            </Menu.Item>
                                          ))}
                                        </Menu.Items>
                                      </Menu>
                                    )}
                                  </div>
                                )}
                              </Draggable>
                            )
                          })
                        )}
                        {dropProvided.placeholder}
                      </div>
                    </section>
                  )}
                </Droppable>
              )
            })}
          </div>
        </DragDropContext>
      )}

      {!isLoading && visible.length > 0 && (
        <p className="flex items-center justify-center gap-1.5 text-center text-sm text-gray-500 dark:text-gray-400">
          <CalendarDaysIcon className="h-4 w-4" aria-hidden="true" />
          {scope === 'history' ? (
            // The board's three-way count says nothing here, where every row is the
            // same stage. What matters instead is how far back the list reaches.
            <>
              {visible.length} finished {visible.length === 1 ? 'task' : 'tasks'}
              {mineOnly ? ', yours only' : ''}
            </>
          ) : (
            <>
              {byStage.TODO.length} to do, {byStage.IN_PROGRESS.length} in progress,{' '}
              {byStage.COMPLETED.length} completed
            </>
          )}
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

      {confirming && (
        <CompleteTaskDialog
          title={confirming.task.title}
          done={(confirming.task.subtasks ?? []).filter((s: any) => s.isCompleted).length}
          total={(confirming.task.subtasks ?? []).length}
          keyResultTitle={(confirming.task as any).keyResult?.title ?? null}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            const { task } = confirming
            setConfirming(null)
            move(task, 'COMPLETED')
          }}
        />
      )}

      <CreateTaskModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} />
    </div>
  )
}

export default TasksPage
