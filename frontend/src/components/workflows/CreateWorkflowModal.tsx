import React, { useState, useEffect } from 'react'
import FormDialog from '@/components/ui/FormDialog'
import { PlusIcon, TrashIcon, UserGroupIcon } from '@heroicons/react/24/outline'
import { workflowsApi, usersApi } from '@/services/api'
import toast from 'react-hot-toast'
import Select from '@/components/ui/Select'

interface CreateWorkflowModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  /**
   * The workflow being edited, or null to create one.
   *
   * The update endpoint has existed since this feature shipped and nothing ever called
   * it, so a workflow could be made and deleted but never corrected: a typo in a phase
   * name meant rebuilding the whole thing, which nobody does, so the typo stays.
   *
   * Editing covers the phases too. The server's update reconciles them: it keeps what
   * stayed, adds what is new, and removes what went, refusing only to delete a phase
   * that still holds tasks unless it is told where those tasks go.
   */
  workflow?: any | null
}

interface User {
  id: string
  name: string
  email: string
  position?: string
  role: string
}

/**
 * A stable identity for one phase row, for React's benefit only.
 *
 * Phase rows were keyed by their array index, and phases can be removed from the
 * middle: delete the second of four and React keeps the DOM nodes where they are and
 * shifts the values underneath them, so the caret jumps out of the field being typed
 * in and the allowed-users box scrolls to a different phase's list. A phase that has
 * been saved has an id, but one just added has not, which is what this covers.
 *
 * It never reaches the server; handleSubmit strips it.
 */
let phaseKeySeq = 0
const nextPhaseKey = () => `ph-${++phaseKeySeq}`

interface PhaseData {
  /** Present on a phase that already exists; absent on one being added. */
  id?: string
  /** Local only. Never sent. */
  _rowKey: string
  name: string
  description: string
  allowedUserIds: string[]
  autoAssignUserId: string
  requiresApproval: boolean
  color: string
}

const CreateWorkflowModal: React.FC<CreateWorkflowModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  workflow = null,
}) => {
  const isEditing = !!workflow

  const [isLoading, setIsLoading] = useState(false)
  const [users, setUsers] = useState<User[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [teams, setTeams] = useState<any[]>([])
  /** The phase awaiting a destination for its tasks, while the dialog is open. */
  const [rehoming, setRehoming] = useState<{ phase: PhaseData; index: number; count: number } | null>(null)
  /** Removed phase id → where its tasks go. Sent with the update. */
  const [reassign, setReassign] = useState<Record<string, string>>({})
  /** The destination chosen in the dialog, before it is confirmed. */
  const [rehomeTarget, setRehomeTarget] = useState('')
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    taskType: '',
    isDefault: false,
    color: '#3B82F6',
    /** Empty means the whole company, which is what every existing workflow is. */
    departmentId: '',
    /** Empty means the whole department. Only meaningful with a department set. */
    teamIds: [] as string[],
  })

  const [phases, setPhases] = useState<PhaseData[]>([
    {
      _rowKey: nextPhaseKey(),
      name: 'To Do',
      description: 'Tasks that need to be started',
      allowedUserIds: [],
      autoAssignUserId: '',
      requiresApproval: false,
      color: '#9CA3AF',
    },
    {
      _rowKey: nextPhaseKey(),
      name: 'In Progress',
      description: 'Tasks currently being worked on',
      allowedUserIds: [],
      autoAssignUserId: '',
      requiresApproval: false,
      color: '#3B82F6',
    },
    {
      _rowKey: nextPhaseKey(),
      name: 'Completed',
      description: 'Finished tasks',
      allowedUserIds: [],
      autoAssignUserId: '',
      requiresApproval: false,
      color: '#10B981',
    },
  ])

  useEffect(() => {
    if (isOpen) {
      loadUsers()
      loadScopeOptions()
    }
  }, [isOpen])

  // Seeded from the workflow each time the dialog opens on one, so editing a second
  // workflow after a first does not show the first one's values.
  //
  // Opening on nothing has to clear just as deliberately. The dialog is mounted for
  // the life of the page rather than created per open, so without this, closing an
  // edit and then pressing "New workflow" showed the workflow just edited, phase ids
  // and all, and saving it created a copy of it under whatever name was left in the
  // box.
  useEffect(() => {
    if (!isOpen) return
    if (!workflow) {
      resetForm()
      setReassign({})
      setRehoming(null)
      setRehomeTarget('')
      return
    }
    setFormData({
      name: workflow.name ?? '',
      description: workflow.description ?? '',
      taskType: workflow.taskType ?? '',
      isDefault: !!workflow.isDefault,
      color: workflow.color ?? '#3B82F6',
      departmentId: workflow.departmentId ?? '',
      teamIds: workflow.teamIds ?? [],
    })

    // Phases are editable now, so the editor opens on the real ones rather than the
    // three defaults a new workflow starts with.
    if (Array.isArray(workflow.phases)) {
      setPhases(
        [...workflow.phases]
          .sort((a: any, b: any) => a.order - b.order)
          .map((p: any) => ({
            id: p.id,
            _rowKey: nextPhaseKey(),
            name: p.name ?? '',
            description: p.description ?? '',
            allowedUserIds: p.allowedUsers ?? [],
            autoAssignUserId: p.autoAssignUserId ?? '',
            requiresApproval: !!p.requiresApproval,
            color: p.color ?? '#6B7280',
          })),
      )
    }
  }, [isOpen, workflow])

  // Both fail quietly to empty lists. Without departments the scope picker offers only
  // "whole company", which is the behaviour this feature replaced and a safe place to
  // land rather than a blocked form.
  const loadScopeOptions = async () => {
    const [depts, tms] = await Promise.allSettled([usersApi.getDepartments(), usersApi.getTeams()])
    if (depts.status === 'fulfilled') setDepartments(Array.isArray(depts.value) ? depts.value : [])
    if (tms.status === 'fulfilled') setTeams(Array.isArray(tms.value) ? tms.value : [])
  }

  const loadUsers = async () => {
    try {
      const data: any = await usersApi.getAll()
      const userList = Array.isArray(data) ? data : (data.users || [])
      setUsers(userList)

      // A new workflow starts permissive: every phase open to everyone, narrowed from
      // there. An existing one must not be touched. This lands after the effect that
      // seeds the editor from the workflow, so applying it while editing silently
      // replaced each phase's real allowed-user list with "everybody", and saving then
      // wrote that back and destroyed the restriction.
      if (workflow) return

      const allUserIds = userList.map((u: User) => u.id)
      setPhases(prev => prev.map(phase => ({
        ...phase,
        allowedUserIds: allUserIds
      })))
    } catch (error) {
      console.error('Failed to load users:', error)
      toast.error('Failed to load users')
    }
  }

  const taskTypes = [
    'SOCIAL_MEDIA_POST',
    'VIDEO_CONTENT',
    'BLOG_ARTICLE',
    'EMAIL_CAMPAIGN',
    'CASE_STUDY',
    'WEBSITE_CONTENT',
    'WHITEPAPER',
    'WEBINAR',
    'INFOGRAPHIC',
    'PRESS_RELEASE',
    'GENERAL',
    'CUSTOM',
  ]

  const colorOptions = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6B7280'
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // The button is disabled while this runs, but the guard does not depend on that
    // being the only way in: a second save would create a second workflow.
    if (isLoading) return

    // Checked here rather than left to the browser. The task type picker used to be
    // a native select whose `required` blocked submission on the empty first option;
    // it is a listbox now, and a button does not take part in form validation, so
    // without this the form would happily post a workflow with no type.
    if (!formData.taskType) {
      toast.error('Choose a task type for this workflow')
      return
    }

    // Phases are editable in both modes now, so the minimum applies to both.
    if (phases.length < 2) {
      toast.error('A workflow needs at least two phases')
      return
    }

    if (phases.some((p) => !p.name.trim())) {
      toast.error('Every phase needs a name')
      return
    }

    // Teams only mean something inside a department, and sending them without one
    // would be a restriction the server drops silently.
    const scope = {
      departmentId: formData.departmentId || null,
      teamIds: formData.departmentId ? formData.teamIds : [],
    }

    // The row keys are React's, not the server's, and the server validates the phase
    // objects it is sent.
    const phasesToSend = phases.map(({ _rowKey, ...phase }) => phase)

    try {
      setIsLoading(true)

      if (isEditing) {
        await workflowsApi.update(workflow.id, {
          name: formData.name,
          description: formData.description,
          color: formData.color,
          isDefault: formData.isDefault,
          ...scope,
          phases: phasesToSend,
          reassign,
        })
        toast.success(`${formData.name} saved`)
      } else {
        await workflowsApi.create({ ...formData, ...scope, phases: phasesToSend })
        toast.success(`${formData.name} created`)
      }

      onSuccess()
      resetForm()
    } catch (error: any) {
      toast.error(
        error.response?.data?.message ||
          (isEditing ? 'Could not save this workflow' : 'Could not create this workflow'),
      )
    } finally {
      setIsLoading(false)
    }
  }

  const resetForm = () => {
    const allUserIds = users.map(u => u.id)
    setFormData({
      name: '',
      description: '',
      taskType: '',
      isDefault: false,
      color: '#3B82F6',
      departmentId: '',
      teamIds: [],
    })
    setPhases([
      {
        _rowKey: nextPhaseKey(),
        name: 'To Do',
        description: 'Tasks that need to be started',
        allowedUserIds: allUserIds,
        autoAssignUserId: '',
        requiresApproval: false,
        color: '#9CA3AF',
      },
      {
        _rowKey: nextPhaseKey(),
        name: 'In Progress',
        description: 'Tasks currently being worked on',
        allowedUserIds: allUserIds,
        autoAssignUserId: '',
        requiresApproval: false,
        color: '#3B82F6',
      },
      {
        _rowKey: nextPhaseKey(),
        name: 'Completed',
        description: 'Finished tasks',
        allowedUserIds: allUserIds,
        autoAssignUserId: '',
        requiresApproval: false,
        color: '#10B981',
      },
    ])
  }

  const addPhase = () => {
    setPhases([
      ...phases,
      {
        _rowKey: nextPhaseKey(),
        name: '',
        description: '',
        allowedUserIds: users.map(u => u.id),
        autoAssignUserId: '',
        requiresApproval: false,
        color: '#6B7280',
      },
    ])
  }

  /**
   * Removing a phase, asking first when there is work in it.
   *
   * A phase holding tasks cannot simply vanish: the tasks would be left pointing at
   * nothing, which reads as neither started nor finished everywhere in the app. So the
   * count is shown and a destination is chosen, here, while the person still has the
   * context to choose sensibly. Deciding at submit time, or worse being refused then,
   * means re-deriving what they were doing several clicks later.
   */
  const removePhase = (index: number) => {
    if (phases.length <= 2) {
      toast.error('A workflow needs at least two phases')
      return
    }

    const phase = phases[index]
    const taskCount = phaseTaskCount(phase)

    if (taskCount > 0) {
      // Cleared each time, so removing a second phase does not open on the destination
      // chosen for the first and let it be confirmed without being read.
      setRehomeTarget('')
      setRehoming({ phase, index, count: taskCount })
      return
    }

    setPhases(phases.filter((_, i) => i !== index))
  }

  /** How many tasks sit in a phase, from the counts the server sent with the workflow. */
  const phaseTaskCount = (phase: PhaseData): number => {
    if (!phase.id || !workflow?.phases) return 0
    const live = workflow.phases.find((p: any) => p.id === phase.id)
    return live?._count?.tasks ?? 0
  }

  /** Confirmed removal: record where the work goes, then drop the phase. */
  const confirmRehome = (targetPhaseId: string) => {
    if (!rehoming) return
    const { phase, index } = rehoming
    if (phase.id) {
      setReassign((prev) => ({ ...prev, [phase.id as string]: targetPhaseId }))
    }
    setPhases((prev) => prev.filter((_, i) => i !== index))
    setRehoming(null)
  }

  const updatePhase = (index: number, field: keyof PhaseData, value: any) => {
    const newPhases = [...phases]
    newPhases[index] = { ...newPhases[index], [field]: value }
    setPhases(newPhases)
  }

  const toggleUser = (phaseIndex: number, userId: string) => {
    const phase = phases[phaseIndex]
    const newUserIds = phase.allowedUserIds.includes(userId)
      ? phase.allowedUserIds.filter(id => id !== userId)
      : [...phase.allowedUserIds, userId]
    
    updatePhase(phaseIndex, 'allowedUserIds', newUserIds)
  }

  const selectAllUsers = (phaseIndex: number) => {
    updatePhase(phaseIndex, 'allowedUserIds', users.map(u => u.id))
  }

  const deselectAllUsers = (phaseIndex: number) => {
    updatePhase(phaseIndex, 'allowedUserIds', [])
  }

  /** Phases that will survive, so the picker cannot offer one that is also going. */
  const rehomeTargets = phases.filter((p) => p.id !== rehoming?.phase.id && p.name.trim())

  return (
    <>
    <FormDialog
      isOpen={isOpen}
      onClose={onClose}
      onSubmit={handleSubmit}
      busy={isLoading}
      width="xl"
      title={isEditing ? `Edit ${workflow.name}` : 'Create a workflow'}
      description={
        isEditing
          ? 'Phases can be renamed, added and removed. Work already in one moves where you say.'
          : 'Set out the phases work moves through, and who can move it.'
      }
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary" disabled={isLoading}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={isLoading}>
            {isLoading
              ? isEditing
                ? 'Saving…'
                : 'Creating…'
              : isEditing
                ? 'Save changes'
                : 'Create workflow'}
          </button>
        </>
      }
    >
      <div className="space-y-6">
                {/* Basic Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="name" className="form-label">
                      Workflow Name *
                    </label>
                    <input
                      type="text"
                      id="name"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      className="input-field"
                      placeholder="e.g., Social Media Workflow"
                    />
                  </div>

                  <div>
                    <label htmlFor="taskType" className="form-label">
                      Task Type *
                    </label>
                    <Select
                      id="taskType"
                      required
                      value={formData.taskType}
                      onChange={(e) => setFormData(prev => ({ ...prev, taskType: e.target.value }))}
                      className="select-field w-full"
                    >
                      <option value="">Select task type</option>
                      {taskTypes.map(type => (
                        <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>
                      ))}
                    </Select>
                  </div>
                </div>

                <div>
                  <label htmlFor="description" className="form-label">
                    Description
                  </label>
                  <textarea
                    id="description"
                    rows={3}
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    className="input-field"
                    placeholder="Describe this workflow..."
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="color" className="form-label">
                      Workflow Color
                    </label>
                    <div className="flex space-x-2">
                      {colorOptions.map(color => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, color }))}
                          className={`w-8 h-8 rounded-full border-2 ${
                            formData.color === color ? 'border-gray-800' : 'border-gray-300 dark:border-gray-600'
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.isDefault}
                        onChange={(e) => setFormData(prev => ({ ...prev, isDefault: e.target.checked }))}
                        className="rounded border-gray-300 dark:border-gray-600 text-blue-600 dark:text-blue-400 focus:ring-primary-500"
                      />
                      <span className="ml-2 text-sm text-gray-700 dark:text-gray-200">
                        Set as default workflow for this task type
                      </span>
                    </label>
                  </div>

                  {/* ── Who can use it ──────────────────────────────────────────
                      Restricts who may pick this workflow when starting a task. It
                      deliberately does not hide tasks: work stays visible to whoever
                      it is assigned to, whatever workflow it uses. */}
                  <div className="space-y-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                    <div>
                      <label htmlFor="wf-department" className="form-label">
                        Who can use this
                      </label>
                      <Select
                        id="wf-department"
                        value={formData.departmentId}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            departmentId: e.target.value,
                            // Teams belong to the department that was just replaced, so
                            // keeping them would narrow the new one to teams from the old.
                            teamIds: [],
                          }))
                        }
                        className="select-field"
                      >
                        <option value="">Everyone in the company</option>
                        {departments.map((d: any) => (
                          <option key={d.id} value={d.id}>
                            {d.name} only
                          </option>
                        ))}
                      </Select>
                      <p className="form-hint">
                        Leave this on the whole company unless a department owns this kind of work.
                      </p>
                    </div>

                    {formData.departmentId && teams.length > 0 && (
                      <div>
                        <span className="form-label">Narrow to teams</span>
                        <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-lg border border-gray-200 p-2.5 dark:border-gray-700">
                          {teams.map((t: any) => {
                            const on = formData.teamIds.includes(t.id)
                            return (
                              <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded p-1 hover:bg-gray-50 dark:hover:bg-gray-700">
                                <input
                                  type="checkbox"
                                  checked={on}
                                  onChange={() =>
                                    setFormData((prev) => ({
                                      ...prev,
                                      teamIds: on
                                        ? prev.teamIds.filter((id) => id !== t.id)
                                        : [...prev.teamIds, t.id],
                                    }))
                                  }
                                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600"
                                />
                                <span className="text-sm text-gray-700 dark:text-gray-200">{t.name}</span>
                              </label>
                            )
                          })}
                        </div>
                        <p className="form-hint">
                          {formData.teamIds.length === 0
                            ? 'None selected, so everyone in the department can use it.'
                            : `Only ${formData.teamIds.length} ${formData.teamIds.length === 1 ? 'team' : 'teams'} can use it.`}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Phases, editable in both modes. The update endpoint reconciles them
                    now: it updates what stayed, adds what is new, and removes what went,
                    refusing only to delete a phase that still has tasks in it. */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">Workflow Phases</h3>
                    <button
                      type="button"
                      onClick={addPhase}
                      className="btn-secondary flex items-center space-x-2"
                    >
                      <PlusIcon className="h-4 w-4" />
                      <span>Add Phase</span>
                    </button>
                  </div>

                  <div className="space-y-4">
                    {phases.map((phase, index) => (
                      <div key={phase._rowKey} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-900/40">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="font-medium text-gray-900 dark:text-white">Phase {index + 1}</h4>
                          {phases.length > 2 && (
                            <button
                              type="button"
                              onClick={() => removePhase(index)}
                              className="text-red-600 dark:text-red-400 hover:text-red-800"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="form-label">
                              Phase Name *
                            </label>
                            <input
                              type="text"
                              required
                              value={phase.name}
                              onChange={(e) => updatePhase(index, 'name', e.target.value)}
                              className="input-field"
                              placeholder="e.g., In Progress"
                            />
                          </div>

                          <div>
                            <label className="form-label">
                              Phase Color
                            </label>
                            <div className="flex space-x-2">
                              {colorOptions.slice(0, 5).map(color => (
                                <button
                                  key={color}
                                  type="button"
                                  onClick={() => updatePhase(index, 'color', color)}
                                  className={`w-6 h-6 rounded-full border-2 ${
                                    phase.color === color ? 'border-gray-800' : 'border-gray-300 dark:border-gray-600'
                                  }`}
                                  style={{ backgroundColor: color }}
                                />
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="mt-4">
                          <label className="form-label">
                            Description
                          </label>
                          <input
                            type="text"
                            value={phase.description}
                            onChange={(e) => updatePhase(index, 'description', e.target.value)}
                            className="input-field"
                            placeholder="Describe this phase"
                          />
                        </div>

                        <div className="mt-4">
                          <div className="flex items-center justify-between mb-2">
                            <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-200">
                              <UserGroupIcon className="h-4 w-4 mr-1" />
                              Allowed Users
                            </label>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => selectAllUsers(index)}
                                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800"
                              >
                                Select All
                              </button>
                              <span className="text-gray-500 dark:text-gray-400">|</span>
                              <button
                                type="button"
                                onClick={() => deselectAllUsers(index)}
                                className="text-xs text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
                              >
                                Clear
                              </button>
                            </div>
                          </div>
                          <div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md p-3 max-h-40 overflow-y-auto">
                            {users.length === 0 ? (
                              <p className="text-sm text-gray-500 dark:text-gray-400">Loading users...</p>
                            ) : (
                              <div className="space-y-2">
                                {users.map(user => (
                                  <label key={user.id} className="flex items-center hover:bg-gray-50 dark:hover:bg-gray-700 p-1 rounded">
                                    <input
                                      type="checkbox"
                                      checked={phase.allowedUserIds.includes(user.id)}
                                      onChange={() => toggleUser(index, user.id)}
                                      className="rounded border-gray-300 dark:border-gray-600 text-blue-600 dark:text-blue-400 focus:ring-primary-500"
                                    />
                                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-200 flex-1">
                                      {user.name}
                                      {user.position && (
                                        <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">• {user.position}</span>
                                      )}
                                    </span>
                                    <span className="text-xs text-gray-500 dark:text-gray-400">{user.role}</span>
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {phase.allowedUserIds.length} user(s) selected. Only these users can access this phase.
                          </p>
                        </div>

                        {/* Approvals requirement disabled globally */}
                      </div>
                    ))}
                  </div>
                </div>

      </div>
    </FormDialog>

    {/* Where the work goes. Outside the form dialog so it lands on top of it: both
        portal to the body, and nested it would be clipped by the form's scrolling
        body. */}
    <FormDialog
      isOpen={!!rehoming}
      onClose={() => setRehoming(null)}
      width="sm"
      title={`Remove ${rehoming?.phase.name || 'this phase'}?`}
      description={
        rehoming
          ? `${rehoming.count} ${rehoming.count === 1 ? 'task is' : 'tasks are'} in it. Choose where they go, and they move when you save.`
          : undefined
      }
      icon={
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
          <TrashIcon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        </div>
      }
      footer={
        <>
          <button type="button" onClick={() => setRehoming(null)} className="btn-secondary">
            Keep the phase
          </button>
          <button
            type="button"
            onClick={() => rehomeTarget && confirmRehome(rehomeTarget)}
            disabled={!rehomeTarget}
            className="btn-primary"
          >
            Move and remove
          </button>
        </>
      }
    >
      <div>
        <label htmlFor="rehome-target" className="form-label">
          Move the work to
        </label>
        <Select
          id="rehome-target"
          value={rehomeTarget}
          onChange={(e) => setRehomeTarget(e.target.value)}
          className="select-field"
        >
          <option value="">Choose a phase…</option>
          {rehomeTargets.map((p) => (
            <option key={p.id ?? p.name} value={p.id ?? ''} disabled={!p.id}>
              {p.name}
              {!p.id ? ' (save this phase first)' : ''}
            </option>
          ))}
        </Select>
        <p className="form-hint">
          Nothing is deleted until you save, and the tasks keep everything else: their
          owner, dates and comments are untouched.
        </p>
      </div>
    </FormDialog>
    </>
  )
}

export default CreateWorkflowModal
