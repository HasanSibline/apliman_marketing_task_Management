import React, { useState, useEffect, useRef } from 'react'
import FormDialog from '@/components/ui/FormDialog'
import { SparklesIcon, CogIcon, PlusIcon, TrashIcon, MapPinIcon, UserIcon, ClockIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { createTask } from '@/store/slices/tasksSlice'
import { fetchAssignableUsers } from '@/store/slices/usersSlice'
import { workflowsApi, quartersApi, objectivesApi, aiApi } from '@/services/api'
import { Workflow } from '@/types/task'
import ContentSuggester from '../ai/ContentSuggester'
import toast from 'react-hot-toast'
import { useAiStatus } from '@/hooks/useAiStatus'
import Select from '@/components/ui/Select'

interface CreateTaskModalProps {
  isOpen: boolean
  onClose: () => void
}

/**
 * A stable identity for one editable subtask row.
 *
 * These rows are keyed in React and they can be deleted from the middle, so the array
 * index is the wrong key: delete the second of four and React keeps the DOM nodes and
 * shifts the values under them, which moves the caret out of the field being typed in
 * and into the next row's text. The id never reaches the server; handleSubmit strips it.
 */
let rowKeySeq = 0
const withRowKey = (subtask: any) => ({ ...subtask, _rowKey: `st-${++rowKeySeq}` })

const CreateTaskModal: React.FC<CreateTaskModalProps> = ({ isOpen, onClose }) => {
  const dispatch = useAppDispatch()
  const { users } = useAppSelector((state) => state.users)
  const { user } = useAppSelector((state) => state.auth)
  /**
   * This dialog's own in-flight flag.
   *
   * It used to disable itself off the tasks slice's shared isLoading, which the board's
   * list fetch also drives. Any list response landing while a create was in flight
   * cleared the flag, re-enabled the button, and a second click filed the task twice.
   */
  const [isSubmitting, setIsSubmitting] = useState(false)
  /**
   * The same two flags, readable synchronously.
   *
   * A state flag is read from the render that built the handler, so two clicks landing
   * before React has re-rendered both see the old value. A ref is written immediately,
   * which is what a guard against filing the same thing twice actually needs.
   */
  const submittingRef = useRef(false)
  const generatingRef = useRef(false)
  /** Whether the form is still open, for anything that outlives the request. */
  const openRef = useRef(isOpen)
  openRef.current = isOpen
  const { aiEnabled, quotaExhausted, resetCountdown, refresh: refreshAiStatus } = useAiStatus()
  const aiBlocked = !aiEnabled || quotaExhausted

  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null)
  const [isLoadingWorkflows, setIsLoadingWorkflows] = useState(false)
  const [aiGeneratedSubtasks, setAiGeneratedSubtasks] = useState<any[]>([])
  const [isGeneratingContent, setIsGeneratingContent] = useState(false)
  const [loadingStage, setLoadingStage] = useState('')
  const [aiPreview, setAiPreview] = useState<{
    description?: string
    goals?: string
    priority?: number
    subtasks?: any[]
    aiProvider?: string
  } | null>(null)
  const [showAiPreview, setShowAiPreview] = useState(false)

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    goals: '',
    priority: 3,
    dueDate: '',
    assignedToId: '',
    assignedUserIds: [] as string[],
    workflowId: '',
    generateSubtasks: false,
    autoAssign: false,
    quarterId: '',
    objectiveId: '',
    keyResultId: '',
  })
  const [quarters, setQuarters] = useState<any[]>([])
  const [objectives, setObjectives] = useState<any[]>([])

  /** An empty form, with the creator already on it. */
  const blankForm = () => ({
    title: '',
    description: '',
    goals: '',
    priority: 3,
    dueDate: '',
    assignedToId: user?.id || '',
    assignedUserIds: user?.id ? [user.id] : ([] as string[]),
    workflowId: '',
    generateSubtasks: false,
    autoAssign: false,
    quarterId: '',
    objectiveId: '',
    keyResultId: '',
  })

  useEffect(() => {
    if (!isOpen) return

    // Cleared on every open, not only after a successful create. The dialog is mounted
    // for the life of the page rather than created per open, so abandoning a draft and
    // opening it again used to show the abandoned draft, its AI subtasks and its
    // quarter still in place.
    setFormData(blankForm())
    setAiGeneratedSubtasks([])
    setAiPreview(null)
    setShowAiPreview(false)
    setSelectedWorkflow(null)
    setIsSubmitting(false)

    dispatch(fetchAssignableUsers())
    loadWorkflows()
    loadMetadata()
  }, [isOpen, dispatch, user?.id])

  const loadMetadata = async () => {
    try {
      const [quartersData, objectivesData] = await Promise.all([
        quartersApi.getSelectable(),
        objectivesApi.getAll(),
      ])
      setQuarters(quartersData)
      setObjectives(objectivesData)
    } catch (error) {
      console.error('Error loading metadata:', error)
    }
  }

  const loadWorkflows = async () => {
    try {
      setIsLoadingWorkflows(true)
      const workflowsData = await workflowsApi.getAll()
      setWorkflows(workflowsData)

      // Auto-select default general workflow if available
      const defaultWorkflow = workflowsData.find(w => w.isDefault && w.taskType === 'GENERAL')
      if (defaultWorkflow) {
        setSelectedWorkflow(defaultWorkflow)
        setFormData(prev => ({ ...prev, workflowId: defaultWorkflow.id }))
      }
    } catch (error) {
      console.error('Error loading workflows:', error)
      toast.error('Failed to load workflows')
    } finally {
      setIsLoadingWorkflows(false)
    }
  }

  const handleWorkflowChange = (workflowId: string) => {
    const workflow = workflows.find(w => w.id === workflowId) || null
    setSelectedWorkflow(workflow)
    setFormData(prev => ({ ...prev, workflowId }))
  }

  const generateAIContent = async () => {
    if (!formData.title.trim()) {
      toast.error('Please enter a task title first')
      return
    }

    // Every run is two upstream calls and both are billed, so a second one is refused
    // outright rather than left to the button's disabled state: the button is the only
    // way in today, but the cost of being wrong about that is money.
    //
    // A ref, not the state flag. `isGeneratingContent` is read from the render that
    // produced this closure, so two clicks arriving before React has re-rendered both
    // see false and both pay. The ref is true the instant the first one starts.
    if (generatingRef.current) return
    generatingRef.current = true

    try {
      setIsGeneratingContent(true)
      setLoadingStage('🤖 AI is thinking about your task...')
      
      // AI Content Generation
      setLoadingStage('✍️ Writing detailed description and goals...')
      const contentData = await aiApi.generateContent(
        formData.title,
        selectedWorkflow?.taskType || 'GENERAL'
      );

      const preview: any = {
        description: contentData.description,
        goals: contentData.goals,
        priority: contentData.priority,
        aiProvider: contentData.ai_provider || contentData.aiProvider
      };

      // Generate subtasks if workflow is selected
      if (selectedWorkflow && formData.generateSubtasks) {
        setLoadingStage('📝 Creating smart subtasks for your workflow...')
        const subtasksData = await aiApi.generateSubtasks({
          title: formData.title,
          description: formData.description || preview.description,
          taskType: selectedWorkflow.taskType,
          workflowPhases: selectedWorkflow.phases.map((p: any) => p.name),
          availableUsers: users.map((u: any) => ({
            id: u.id,
            name: u.name,
            position: u.position,
            role: u.role
          }))
        });
        
        preview.subtasks = (subtasksData.subtasks || []).map(withRowKey)
      }

      setLoadingStage('✨ Finalizing your AI-generated content...')

      // Nothing is shown if the form was closed while this was running. A draft can be
      // most of a minute coming, and without this the preview opened by itself over
      // whatever page the person had moved on to, offering to apply content to a form
      // that was no longer there.
      if (!openRef.current) return

      setAiPreview(preview)
      setShowAiPreview(true)
      toast.success('🎉 AI content generated successfully!')

    } catch (error: any) {
      console.error('Error generating AI content:', error)

      const httpStatus: number | undefined = error.response?.status

      if (httpStatus === 401) {
        toast.error('Session expired. Please refresh the page and log in again.')
        localStorage.removeItem('token')
        window.location.href = '/login'
      } else {
        /**
         * Everything else, said once and said honestly.
         *
         * AI failures arrive classified. The gateway sends a `kind` beside its message
         * and a status that matches it: 503 for something passing, 400 for a prompt it
         * refused. This used to guess at the cause instead, hunting for the word
         * "quota" in a string that never contains it, and then print whatever it found
         * at the reader.
         *
         * The distinction that matters is permanent against transient. No provider
         * configured, an invalid key and a spent budget are all reachable here and none
         * of them improve by waiting, so none of them may be reported as "try again in
         * a moment"; that is a message that leaves somebody retrying a thing that will
         * never work. Those are also worth leaving on screen longer, since the next
         * step is finding an administrator rather than pressing the button again.
         *
         * The message itself is the server's. It is written for the reader and names no
         * provider, status or key, so it is shown as sent rather than reworded here.
         * The status endpoint is refreshed alongside, so a company that has been shut
         * off has the button say so on the next render.
         */
        refreshAiStatus()

        const kind: string | undefined = error.response?.data?.kind
        const serverMsg: string | undefined =
          typeof error.response?.data?.message === 'string' ? error.response.data.message : undefined

        const needsAnAdministrator =
          kind === 'NOT_CONFIGURED' ||
          kind === 'BUDGET_EXHAUSTED' ||
          kind === 'INVALID_API_KEY' ||
          kind === 'AUTHENTICATION_ERROR' ||
          kind === 'ENDPOINT_NOT_FOUND'

        // A 500 with Nest's stock body is the one case where the server has told us
        // nothing, so there is nothing to quote and the generic line has to carry it.
        const unexplained =
          !serverMsg ||
          (httpStatus !== undefined && httpStatus >= 500 && /^internal server error$/i.test(serverMsg.trim()))

        const message =
          !error.response || error.message === 'Network Error'
            ? 'The assistant could not be reached. Check your connection and try again.'
            : unexplained
              ? 'The assistant could not draft this. If it keeps failing, ask your administrator to check the AI settings, since some causes need a person rather than another attempt.'
              : (serverMsg as string)

        toast.error(message, { duration: needsAnAdministrator ? 8000 : 6000 })
      }
    } finally {
      generatingRef.current = false
      setIsGeneratingContent(false)
      setLoadingStage('')
    }
  }

  const applyAiContent = () => {
    if (!aiPreview) return

    setFormData(prev => ({
      ...prev,
      // Typed text wins: these two are long, and overwriting a paragraph somebody
      // wrote is not something a preview screen has permission to do.
      description: prev.description || aiPreview.description || '',
      goals: prev.goals || aiPreview.goals || '',
      // Priority is not like the other two. It is never empty, it starts at 3, and
      // `prev.priority || ...` therefore always kept the 3 and threw the suggestion
      // away: the preview said Critical, Apply was pressed, and the task was filed as
      // Normal. What the preview showed is what gets applied.
      priority: aiPreview.priority ?? prev.priority,
    }))

    if (aiPreview.subtasks) {
      setAiGeneratedSubtasks(aiPreview.subtasks.map((s: any) => (s._rowKey ? s : withRowKey(s))))
    }

    // Close preview
    setShowAiPreview(false)
    toast.success('AI content applied to form!')
  }

  const discardAiContent = () => {
    setAiPreview(null)
    setShowAiPreview(false)
  }

  const updateSubtask = (index: number, field: string, value: string) => {
    const updatedSubtasks = [...aiGeneratedSubtasks]
    updatedSubtasks[index] = { ...updatedSubtasks[index], [field]: value }
    setAiGeneratedSubtasks(updatedSubtasks)
  }

  const removeSubtask = (index: number) => {
    setAiGeneratedSubtasks(subtasks => subtasks.filter((_, i) => i !== index))
  }

  const addCustomSubtask = () => {
    setAiGeneratedSubtasks(prev => [...prev, withRowKey({
      title: '',
      description: '',
      phaseName: selectedWorkflow?.phases[0]?.name || '',
      suggestedRole: '',
      estimatedHours: 2,
    })])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submittingRef.current) return

    // Ensure the creator is always assigned to the task (especially for employees)
    const assignedUserIds = formData.assignedUserIds.length > 0
      ? formData.assignedUserIds
      : (user?.id ? [user.id] : []);

    // Make sure creator is always included if they're an employee
    if (user?.id && !assignedUserIds.includes(user.id)) {
      assignedUserIds.push(user.id);
    }

    const taskData = {
      ...formData,
      dueDate: formData.dueDate ? new Date(formData.dueDate).toISOString() : undefined,
      assignedToId: formData.assignedToId || user?.id || undefined,
      assignedUserIds: assignedUserIds.length > 0 ? assignedUserIds : undefined,
      // Include AI-generated subtasks if any, without the local row keys.
      aiSubtasks:
        aiGeneratedSubtasks.length > 0
          ? aiGeneratedSubtasks.map(({ _rowKey, ...subtask }) => subtask)
          : undefined,
    }

    submittingRef.current = true
    setIsSubmitting(true)
    try {
      // The thunk uses rejectWithValue, so it never throws. A failure arrives as a
      // rejected action and has already been reported by the thunk itself, which is
      // why there is no catch here pretending otherwise: the one that used to be here
      // handled a 401 that could never reach it.
      const result = await dispatch(createTask(taskData))
      if (createTask.fulfilled.match(result)) {
        toast.success('Task created successfully!')

        // Close modal and reset form
        onClose()
        setFormData(blankForm())
        setAiGeneratedSubtasks([]) // Clear AI subtasks

        // Dispatch custom event to notify NotificationBell
        window.dispatchEvent(new CustomEvent('taskUpdated'))

        // The Redux state already has the new task, no need to fetch again
      }
    } finally {
      submittingRef.current = false
      setIsSubmitting(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: name === 'priority' ? parseInt(value) : value
    }))
  }

  return (
    // Both dialogs portal themselves and animate themselves. The AnimatePresence that
    // used to wrap this pair drove nothing: its children never unmount.
    <>
        <FormDialog
          isOpen={isOpen}
          onClose={onClose}
          onSubmit={handleSubmit}
          busy={isSubmitting}
          width="lg"
          title="Create a task"
          description="Pick the workflow it belongs to, then fill in the rest."
          footer={
            <>
              <button type="button" onClick={onClose} className="btn-secondary" disabled={isSubmitting}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <ArrowPathIcon className="h-4 w-4 animate-spin" />
                    <span>Creating…</span>
                  </>
                ) : (
                  <>
                    <PlusIcon className="h-4 w-4" />
                    <span>Create task</span>
                  </>
                )}
              </button>
            </>
          }
        >
                <div className="space-y-6">
                {/* Workflow Selection */}
                <div>
                  <label htmlFor="workflowId" className="form-label">
                    <CogIcon className="h-4 w-4 inline mr-1" />
                    Workflow
                  </label>
                  <Select
                    id="workflowId"
                    name="workflowId"
                    value={formData.workflowId}
                    onChange={(e) => handleWorkflowChange(e.target.value)}
                    className="select-field w-full"
                    disabled={isLoadingWorkflows}
                  >
                    <option value="">Select a workflow</option>
                    {workflows.map((workflow) => (
                      <option key={workflow.id} value={workflow.id}>
                        {workflow.name} ({workflow.taskType})
                      </option>
                    ))}
                  </Select>
                  {selectedWorkflow && (
                    <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-900/40 rounded-md">
                      <p className="text-sm text-gray-600 dark:text-gray-300">{selectedWorkflow.description}</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {selectedWorkflow.phases.map((phase) => (
                          <span
                            key={phase.id}
                            className="text-xs px-2 py-1 rounded-full text-white"
                            style={{ backgroundColor: phase.color }}
                          >
                            {phase.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Title */}
                <div>
                  <label htmlFor="title" className="form-label">
                    Task title
                  </label>
                  <div>
                    {/* The button sits beside the field, not inside it. Floated over
                        the right edge it needed the input to reserve room for it, and
                        pr-10 reserved 2.5rem for a control four times that wide, so
                        anything typed past a few words ran underneath it. */}
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        id="title"
                        name="title"
                        required
                        value={formData.title}
                        onChange={handleChange}
                        className="input-field"
                        placeholder="What needs doing?"
                      />
                      <button
                        type="button"
                        onClick={generateAIContent}
                        disabled={isGeneratingContent || !formData.title.trim() || aiBlocked}
                        title={aiBlocked ? (quotaExhausted ? `The AI provider rate limited this company's key${resetCountdown ? `. Back in ${resetCountdown}` : '. Try again shortly'}` : 'AI is not enabled for your company') : ''}
                        className="btn-secondary shrink-0 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <SparklesIcon className="h-4 w-4" />
                        <span>{isGeneratingContent ? 'Writing…' : aiBlocked ? 'AI unavailable' : 'Draft with AI'}</span>
                      </button>
                    </div>

                    {/* Loading Stage Display */}
                    {isGeneratingContent && loadingStage && (
                      <div className="mt-2 text-sm text-purple-600 dark:text-purple-400 animate-pulse flex items-center">
                        <div className="w-2 h-2 bg-purple-600 rounded-full animate-bounce mr-2"></div>
                        {loadingStage}
                      </div>
                    )}
                    <div
                      id="content-suggester"
                      className="absolute top-full mt-1 left-0 right-0 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-4"
                      style={{ display: 'none' }}
                    >
                      <ContentSuggester
                        title={formData.title}
                        type="task"
                        onSuggestionSelect={(suggestion) => {
                          setFormData(prev => ({
                            ...prev,
                            description: suggestion.description || prev.description,
                            goals: suggestion.goals || prev.goals,
                            priority: suggestion.priority || prev.priority,
                          }));
                          const suggester = document.getElementById('content-suggester');
                          if (suggester) {
                            suggester.style.display = 'none';
                          }
                          toast.success('AI suggestions applied!');
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label htmlFor="description" className="form-label">
                    Description *
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    required
                    rows={4}
                    value={formData.description}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Describe the task in detail"
                  />
                </div>

                {/* Goals */}
                <div>
                  <label htmlFor="goals" className="form-label">
                    Goals & Success Criteria
                  </label>
                  <textarea
                    id="goals"
                    name="goals"
                    rows={3}
                    value={formData.goals}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Define what success looks like for this task"
                  />
                </div>

                {/* Priority and Due Date */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="priority" className="form-label">
                      Priority
                    </label>
                    <Select
                      id="priority"
                      name="priority"
                      value={formData.priority}
                      onChange={handleChange}
                      className="select-field w-full"
                    >
                      <option value={1}>1 - Low</option>
                      <option value={2}>2 - Medium</option>
                      <option value={3}>3 - Normal</option>
                      <option value={4}>4 - High</option>
                      <option value={5}>5 - Critical</option>
                    </Select>
                  </div>

                  <div>
                    <label htmlFor="dueDate" className="form-label">
                      Due Date
                    </label>
                    <input
                      type="date"
                      id="dueDate"
                      name="dueDate"
                      value={formData.dueDate}
                      onChange={handleChange}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Quarter and Objective */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label htmlFor="quarterId" className="form-label">
                      Quarter
                    </label>
                    <Select
                      id="quarterId"
                      name="quarterId"
                      value={formData.quarterId}
                      onChange={handleChange}
                      className="select-field w-full"
                    >
                      <option value="">No Quarter</option>
                      {quarters.map((q) => (
                        <option key={q.id} value={q.id}>{q.name} {q.year}</option>
                      ))}
                    </Select>
                  </div>

                  <div>
                    <label htmlFor="objectiveId" className="form-label">
                      Objective
                    </label>
                    <Select
                      id="objectiveId"
                      name="objectiveId"
                      value={formData.objectiveId}
                      onChange={(e) => {
                        handleChange(e);
                        // Reset keyResultId whenever objective changes
                        setFormData(prev => ({ ...prev, keyResultId: '' }));
                      }}
                      className="select-field w-full"
                    >
                      <option value="">No Objective</option>
                      {objectives
                        .filter(obj => !formData.quarterId || obj.quarterId === formData.quarterId)
                        .map((obj) => (
                          <option key={obj.id} value={obj.id}>{obj.title}</option>
                        ))}
                    </Select>
                  </div>

                  {formData.objectiveId && (
                    <div>
                      <label htmlFor="keyResultId" className="form-label">
                        Track a Key Result
                      </label>
                      <Select
                        id="keyResultId"
                        name="keyResultId"
                        value={formData.keyResultId}
                        onChange={handleChange}
                        className="select-field w-full"
                      >
                        <option value="">Overall Objective</option>
                        {objectives
                          .find(o => o.id === formData.objectiveId)?.keyResults?.map((kr: any) => (
                            <option key={kr.id} value={kr.id}>{kr.title}</option>
                          ))}
                      </Select>
                    </div>
                  )}
                </div>

                {/* Assign To */}
                <div>
                  <label className="form-label">
                    Assign To
                  </label>
                  <div className="space-y-2">
                    {/* Single assignment (backward compatibility) */}
                    <div>
                      <label htmlFor="assignedToId" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                        Single Assignment (Legacy)
                      </label>
                      <Select
                        id="assignedToId"
                        name="assignedToId"
                        value={formData.assignedToId}
                        onChange={handleChange}
                        className="select-field w-full"
                      >
                        <option value="">Select primary assignee</option>
                        {users.map((u: any) => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.email}) {u.id === user?.id ? '(You)' : ''}
                          </option>
                        ))}
                      </Select>
                    </div>

                    {/* Multiple assignments */}
                    <div>
                      <label className="form-label">
                        Assign Team Members
                      </label>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                        You are automatically assigned. Select additional team members to collaborate.
                      </p>
                      <div className="space-y-2 max-h-32 overflow-y-auto">
                        {users.map((u: any) => (
                          <label key={u.id} className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              checked={formData.assignedUserIds.includes(u.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFormData(prev => ({
                                    ...prev,
                                    assignedUserIds: [...prev.assignedUserIds, u.id]
                                  }))
                                } else {
                                  setFormData(prev => ({
                                    ...prev,
                                    assignedUserIds: prev.assignedUserIds.filter(id => id !== u.id)
                                  }))
                                }
                              }}
                              className="rounded border-gray-300 dark:border-gray-600 text-primary-600 dark:text-primary-400 focus:ring-primary-500"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-200">
                              {u.name} ({u.email}) {u.id === user?.id ? '(You)' : ''}
                            </span>
                          </label>
                        ))}
                      </div>
                      {formData.assignedUserIds.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Selected: {formData.assignedUserIds.length} user(s)
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* AI Options */}
                <div className="border-t pt-6">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center">
                    <SparklesIcon className="h-5 w-5 mr-2 text-purple-500" />
                    AI-Powered Features
                  </h3>

                  <div className="space-y-4">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.generateSubtasks}
                        onChange={(e) => setFormData(prev => ({ ...prev, generateSubtasks: e.target.checked }))}
                        className="rounded border-gray-300 dark:border-gray-600 text-purple-600 dark:text-purple-400 focus:ring-purple-500"
                      />
                      <span className="ml-2 text-sm text-gray-700 dark:text-gray-200">
                        Generate AI subtasks based on task type and workflow
                      </span>
                    </label>

                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.autoAssign}
                        onChange={(e) => setFormData(prev => ({ ...prev, autoAssign: e.target.checked }))}
                        className="rounded border-gray-300 dark:border-gray-600 text-purple-600 dark:text-purple-400 focus:ring-purple-500"
                      />
                      <span className="ml-2 text-sm text-gray-700 dark:text-gray-200">
                        Auto-assign subtasks to team members based on their roles
                      </span>
                    </label>

                    <div className="text-xs text-gray-500 dark:text-gray-400 bg-purple-50 dark:bg-purple-900/30 p-3 rounded-md">
                      <p className="font-medium mb-1">AI will help with:</p>
                      <ul className="list-disc list-inside space-y-1">
                        <li>Task type detection from title</li>
                        <li>Generate description and goals if not provided</li>
                        <li>Create intelligent subtasks matched to workflow phases</li>
                        <li>Suggest team members for subtasks based on their positions</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* AI-Generated Subtasks */}
                {aiGeneratedSubtasks.length > 0 && (
                  <div className="border-t pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-medium text-gray-900 dark:text-white flex items-center">
                        <SparklesIcon className="h-5 w-5 mr-2 text-green-500" />
                        AI-Generated Subtasks ({aiGeneratedSubtasks.length})
                      </h3>
                      <button
                        type="button"
                        onClick={addCustomSubtask}
                        className="btn-secondary text-sm flex items-center space-x-2"
                      >
                        <PlusIcon className="h-4 w-4" />
                        <span>Add Custom</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {aiGeneratedSubtasks.map((subtask, index) => (
                        <div
                          key={subtask._rowKey ?? `ai-st-${index}`}
                          className="bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-lg p-4 relative group"
                        >
                          <button
                            type="button"
                            onClick={() => removeSubtask(index)}
                            className="absolute top-2 right-2 text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>

                          <div className="space-y-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">
                                Subtask Title
                              </label>
                              <input
                                type="text"
                                value={subtask.title}
                                onChange={(e) => updateSubtask(index, 'title', e.target.value)}
                                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                                placeholder="Subtask title"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">
                                Description
                              </label>
                              <textarea
                                rows={2}
                                value={subtask.description}
                                onChange={(e) => updateSubtask(index, 'description', e.target.value)}
                                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                                placeholder="Brief description"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">
                                  Phase
                                </label>
                                <Select
                                  value={subtask.phaseName}
                                  onChange={(e) => updateSubtask(index, 'phaseName', e.target.value)}
                                  className="select-field w-full text-sm"
                                >
                                  {selectedWorkflow?.phases.map((phase) => (
                                    <option key={phase.id} value={phase.name}>
                                      {phase.name}
                                    </option>
                                  ))}
                                </Select>
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">
                                  Est. Hours
                                </label>
                                <input
                                  type="number"
                                  min="0.5"
                                  step="0.5"
                                  value={subtask.estimatedHours}
                                  onChange={(e) => updateSubtask(index, 'estimatedHours', e.target.value)}
                                  className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                                />
                              </div>
                            </div>

                            {subtask.suggestedRole && (
                              <div className="flex items-center space-x-2">
                                <span className="text-xs text-gray-500 dark:text-gray-400">Suggested for:</span>
                                <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 px-2 py-1 rounded-full">
                                  {subtask.suggestedRole}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 text-sm text-gray-600 dark:text-gray-300 bg-green-50 dark:bg-green-900/30 p-3 rounded-md">
                      <p className="font-medium mb-1">📝 These subtasks were generated by AI based on your task details.</p>
                      <p>You can edit, remove, or add custom subtasks. They will be created automatically when you create the task.</p>
                    </div>
                  </div>
                )}
              </div>
        </FormDialog>

      {/*
        The preview is a dialog, and it is drawn as one.

        It used to be a bare overlay written inline here, with z-index 9999 and its own
        backdrop, and neither did anything: the page content sits inside a stacking
        context, so no z-index it gives itself can climb above a FormDialog portalled to
        the body, and the dialog chrome marks everything outside the open panel `inert`.
        So the preview rendered underneath the form, behind its backdrop, unclickable.
        A successful draft looked like nothing at all had happened, and the work the AI
        had just been paid for was on screen only in the sense that it was in the DOM.

        Portalled through FormDialog it lands on top, and the shared Escape stack means
        the key closes the preview and leaves the form standing, which is what the
        `dismissible` flag on the form was previously trying and failing to arrange.
      */}
      <FormDialog
        isOpen={showAiPreview && !!aiPreview}
        onClose={discardAiContent}
        width="xl"
        title="AI generated content preview"
        description="Nothing is applied to the form until you say so."
        icon={<SparklesIcon className="h-6 w-6 text-purple-500" />}
        footer={
          <>
            <button type="button" onClick={discardAiContent} className="btn-secondary">
              Discard
            </button>
            <button type="button" onClick={applyAiContent} className="btn-primary">
              Apply to form
            </button>
          </>
        }
      >
        {aiPreview && (
              <div className="space-y-6">
                {/* Description Preview */}
                {aiPreview.description && (
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">📝 Description</h3>
                    <div className="bg-gray-50 dark:bg-gray-900/40 p-4 rounded-lg border">
                      <p className="text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{aiPreview.description}</p>
                    </div>
                  </div>
                )}

                {/* Goals Preview */}
                {aiPreview.goals && (
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">🎯 Goals</h3>
                    <div className="bg-gray-50 dark:bg-gray-900/40 p-4 rounded-lg border">
                      <p className="text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{aiPreview.goals}</p>
                    </div>
                  </div>
                )}

                {/* Priority Preview */}
                {aiPreview.priority && (
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">⚡ Priority</h3>
                    <div className="bg-gray-50 dark:bg-gray-900/40 p-4 rounded-lg border">
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${aiPreview.priority === 5 ? 'bg-red-100 text-red-800' :
                        aiPreview.priority === 4 ? 'bg-orange-100 text-orange-800' :
                          aiPreview.priority === 3 ? 'bg-yellow-100 text-yellow-800' :
                            aiPreview.priority === 2 ? 'bg-blue-100 text-blue-800' :
                              'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100'
                        }`}>
                        {aiPreview.priority === 5 ? 'Critical' :
                          aiPreview.priority === 4 ? 'High' :
                            aiPreview.priority === 3 ? 'Normal' :
                              aiPreview.priority === 2 ? 'Medium' :
                                'Low'} Priority
                      </span>
                    </div>
                  </div>
                )}

                {/* Subtasks Preview */}
                {aiPreview.subtasks && aiPreview.subtasks.length > 0 && (
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                      📋 Subtasks ({aiPreview.subtasks.length})
                    </h3>
                    <div className="space-y-4">
                      {aiPreview.subtasks.map((subtask, index) => (
                        <div key={subtask._rowKey ?? `preview-st-${index}`} className="bg-gray-50 dark:bg-gray-900/40 p-4 rounded-lg border">
                          <div className="flex items-start justify-between mb-3">
                            <h4 className="font-medium text-gray-900 dark:text-white flex-1">{subtask.title}</h4>
                            <button
                              onClick={() => {
                                const updatedSubtasks = aiPreview.subtasks?.filter((_, i) => i !== index) || []
                                setAiPreview(prev => prev ? { ...prev, subtasks: updatedSubtasks } : null)
                              }}
                              className="text-red-500 hover:text-red-700 ml-2"
                              title="Remove subtask"
                            >
                              ✕
                            </button>
                          </div>

                          {subtask.description && (
                            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">{subtask.description}</p>
                          )}

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                            {/* Phase Selection */}
                            <div>
                              <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">Phase</label>
                              <Select
                                value={subtask.phaseName || ''}
                                onChange={(e) => {
                                  const updatedSubtasks = [...(aiPreview.subtasks || [])]
                                  updatedSubtasks[index] = { ...updatedSubtasks[index], phaseName: e.target.value }
                                  setAiPreview(prev => prev ? { ...prev, subtasks: updatedSubtasks } : null)
                                }}
                                className="select-field w-full text-xs"
                              >
                                <option value="">Select Phase</option>
                                {selectedWorkflow?.phases.map(phase => (
                                  <option key={phase.id} value={phase.name}>{phase.name}</option>
                                ))}
                              </Select>
                            </div>

                            {/* User Assignment */}
                            <div>
                              <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">Assign To</label>
                              <Select
                                value={subtask.suggestedUserId || ''}
                                onChange={(e) => {
                                  const selectedUser = users.find(u => u.id === e.target.value)
                                  const updatedSubtasks = [...(aiPreview.subtasks || [])]
                                  updatedSubtasks[index] = {
                                    ...updatedSubtasks[index],
                                    suggestedUserId: e.target.value,
                                    suggestedUserName: selectedUser?.name || '',
                                    suggestedRole: selectedUser?.position || subtask.suggestedRole
                                  }
                                  setAiPreview(prev => prev ? { ...prev, subtasks: updatedSubtasks } : null)
                                }}
                                className="select-field w-full text-xs"
                              >
                                <option value="">Unassigned</option>
                                {users.map((u: any) => (
                                  <option key={u.id} value={u.id}>
                                    {u.name} ({u.position})
                                  </option>
                                ))}
                              </Select>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2 text-xs">
                            {subtask.phaseName && (
                              <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 px-2 py-1 rounded inline-flex items-center gap-1">
                                <MapPinIcon className="w-3 h-3" /> {subtask.phaseName}
                              </span>
                            )}
                            {(subtask.suggestedUserName || subtask.suggestedRole) && (
                              <span className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 px-2 py-1 rounded inline-flex items-center gap-1">
                                <UserIcon className="w-3 h-3" /> {subtask.suggestedUserName || subtask.suggestedRole}
                              </span>
                            )}
                            {subtask.estimatedHours && (
                              <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 px-2 py-1 rounded inline-flex items-center gap-1">
                                <ClockIcon className="w-3 h-3" /> {subtask.estimatedHours}h
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Add Custom Subtask Button */}
                    <button
                      onClick={() => {
                        const newSubtask = withRowKey({
                          title: 'New Subtask',
                          description: '',
                          phaseName: selectedWorkflow?.phases[0]?.name || '',
                          suggestedRole: '',
                          suggestedUserId: '',
                          suggestedUserName: '',
                          estimatedHours: 2,
                        })
                        setAiPreview(prev => prev ? {
                          ...prev,
                          subtasks: [...(prev.subtasks || []), newSubtask]
                        } : null)
                      }}
                      className="mt-3 w-full px-4 py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:border-primary-300 hover:text-primary-600 transition-colors"
                    >
                      + Add Custom Subtask
                    </button>
                  </div>
                )}

                {/* Where this came from. No provider is named: which one answered is
                    the gateway's business, and there is no single key to point at any
                    more, so the old line telling people to set up a Google API key was
                    advice nobody in this app can act on. */}
                <div className={`p-4 rounded-lg ${aiPreview.aiProvider === 'fallback'
                  ? 'bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200'
                  : 'bg-green-50 dark:bg-green-900/30 border border-green-200'
                  }`}>
                  <p className="text-sm">
                    {aiPreview.aiProvider === 'fallback' ? (
                      <>
                        <strong>Standard template:</strong> the assistant could not be
                        reached, so this is a generic draft rather than one written for
                        your task. Ask your administrator to check the AI settings.
                      </>
                    ) : (
                      <>
                        <strong>Written by the assistant</strong> from the title and
                        workflow you chose. Read it before applying it.
                      </>
                    )}
                  </p>
                </div>
              </div>
        )}
      </FormDialog>
    </>
  )
}

export default CreateTaskModal
