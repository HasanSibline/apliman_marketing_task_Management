import React, { useState, useEffect } from 'react'
import FormDialog from '@/components/ui/FormDialog'
import { CalendarIcon, FlagIcon, UserGroupIcon } from '@heroicons/react/24/outline'
import { tasksApi, usersApi, quartersApi, objectivesApi } from '@/services/api'
import toast from 'react-hot-toast'
import { useAppSelector } from '@/hooks/redux'
import { LockClosedIcon } from '@heroicons/react/24/outline'
import Select from '@/components/ui/Select'

interface EditTaskModalProps {
  task: any
  isOpen: boolean
  onClose: () => void
  onTaskUpdated: () => void
}

const EditTaskModal: React.FC<EditTaskModalProps> = ({ task, isOpen, onClose, onTaskUpdated }) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    goals: '',
    priority: 1,
    dueDate: '',
    assignedUserIds: [] as string[],
    quarterId: '',
    objectiveId: '',
    keyResultId: '',
  })
  const [users, setUsers] = useState<any[]>([])
  const [quarters, setQuarters] = useState<any[]>([])
  const [objectives, setObjectives] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const { user } = useAppSelector(state => state.auth)
  const isAdmin = ['COMPANY_ADMIN', 'ADMIN', 'SUPER_ADMIN'].includes(user?.role ?? '')
  const isLocked = !isAdmin && task?.quarter?.status === 'UPCOMING'

  /**
   * Seeded when the dialog opens, and not again while it is open.
   *
   * It used to seed off the task prop alone, which was wrong in both directions. The
   * dialog is never unmounted, so editing a task, cancelling, and opening it again
   * showed the abandoned edits rather than what is actually saved. And the page behind
   * refreshes the same task on a timer and after every change, so a refresh landing
   * mid-edit replaced whatever was being typed with the server's copy.
   */
  useEffect(() => {
    if (isOpen && task) {
      // Collect all assigned user IDs from assignments array
      const assignedIds = task.assignments?.map((a: any) => a.userId) || []

      setFormData({
        title: task.title || '',
        description: task.description || '',
        goals: task.goals || '',
        priority: task.priority || 1,
        dueDate: task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '',
        assignedUserIds: assignedIds,
        quarterId: task.quarterId || '',
        objectiveId: task.objectiveId || '',
        keyResultId: task.keyResultId || '',
      })
    }
  }, [isOpen, task?.id])

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [usersData, quartersData, objectivesData] = await Promise.all([
          usersApi.getAll(),
          quartersApi.getSelectable(),
          objectivesApi.getAll(),
        ])
        setUsers(Array.isArray(usersData) ? usersData : (usersData as any).users || [])
        setQuarters(quartersData)
        setObjectives(objectivesData)
      } catch (error) {
        console.error('Failed to fetch modal data:', error)
      }
    }
    if (isOpen) {
      fetchData()
    }
  }, [isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isLoading) return
    setIsLoading(true)

    /**
     * Empty pickers are sent as nothing, not as an empty string.
     *
     * The form's blanks are `''`, and the whole object used to be posted as it stood.
     * The server validates the body strictly: an empty due date is not a date, so it
     * was rejected outright with "Due date must be a valid ISO date string", and an
     * empty quarter or objective went to the database as an id of `''`, which matches
     * no row and fails the foreign key. Between them that is most tasks: anything with
     * no deadline and no quarter could not be edited at all, and the message blamed a
     * field the person had not touched.
     */
    const payload = {
      title: formData.title,
      description: formData.description,
      goals: formData.goals,
      priority: formData.priority,
      assignedUserIds: formData.assignedUserIds,
      // Omitted rather than nulled: the server reads an absent due date as "leave it
      // alone", so there is nothing to be gained by sending an empty one.
      ...(formData.dueDate ? { dueDate: formData.dueDate } : {}),
      quarterId: formData.quarterId || null,
      objectiveId: formData.objectiveId || null,
      keyResultId: formData.keyResultId || null,
    }

    try {
      await tasksApi.update(task.id, payload)
      toast.success('Task updated successfully')
      onTaskUpdated()
      onClose()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update task')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <FormDialog
      isOpen={isOpen}
      onClose={onClose}
      onSubmit={handleSubmit}
      busy={isLoading}
      width="lg"
      title="Edit task"
      description={task?.title}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={isLoading || isLocked} className="btn-primary">
            {isLoading ? 'Saving…' : 'Save changes'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
            {isLocked && (
              <div className="flex items-start gap-3 rounded-xl border border-primary-100 bg-primary-50 p-4 dark:border-primary-900/40 dark:bg-primary-900/20">
                <LockClosedIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary-600 dark:text-primary-400" />
                <div>
                  <p className="text-sm font-medium text-primary-900 dark:text-primary-200">
                    Locked until {task?.quarter?.name} starts
                  </p>
                  <p className="mt-1 text-sm text-primary-700 dark:text-primary-300">
                    This task belongs to a quarter that has not begun. An admin can still change it.
                  </p>
                </div>
              </div>
            )}

              {/* Title */}
              <div>
                <label className="form-label">
                  Title
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="input-field"
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className="form-label">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={4}
                  className="input-field resize-none"
                />
              </div>

              {/* Goals */}
              <div>
                <label className="form-label">
                  Goals
                </label>
                <textarea
                  value={formData.goals}
                  onChange={(e) => setFormData({ ...formData, goals: e.target.value })}
                  rows={3}
                  className="input-field resize-none"
                />
              </div>

              {/* Priority and Due Date Row */}
              <div className="grid grid-cols-2 gap-4">
                {/* Priority */}
                <div>
                  <label className="form-label">
                    <FlagIcon className="w-4 h-4 inline mr-1" />
                    Priority
                  </label>
                  {/* Five levels, the same five the rest of the app uses. This offered
                      three, so a task created at High or Critical opened here with the
                      priority box blank, and any edit at all looked like it had lost
                      the value even though the number was still being sent back. */}
                  <Select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })}
                    className="select-field w-full"
                  >
                    <option value={1}>1 - Low</option>
                    <option value={2}>2 - Medium</option>
                    <option value={3}>3 - Normal</option>
                    <option value={4}>4 - High</option>
                    <option value={5}>5 - Critical</option>
                  </Select>
                </div>

                {/* Due Date */}
                <div>
                  <label className="form-label">
                    <CalendarIcon className="w-4 h-4 inline mr-1" />
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    className="input-field"
                  />
                </div>
              </div>

              {/* Quarter and Objective Row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Quarter */}
                <div>
                  <label className="form-label">
                    Quarter
                  </label>
                  <Select
                    value={formData.quarterId}
                    onChange={(e) => setFormData({ ...formData, quarterId: e.target.value })}
                    className="select-field w-full"
                  >
                    <option value="">No Quarter</option>
                    {quarters.map((q) => (
                      <option key={q.id} value={q.id}>{q.name} {q.year}</option>
                    ))}
                  </Select>
                </div>

                {/* Objective */}
                <div>
                  <label className="form-label">
                    Objective
                  </label>
                  <Select
                    value={formData.objectiveId}
                    onChange={(e) => setFormData({ ...formData, objectiveId: e.target.value, keyResultId: '' })}
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

                {/* Key Result */}
                {formData.objectiveId && (
                  <div>
                    <label className="form-label">
                      Track a Key Result
                    </label>
                    <Select
                      value={formData.keyResultId}
                      onChange={(e) => setFormData({ ...formData, keyResultId: e.target.value })}
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

              {/* Assigned Users (Multiple Selection) */}
              <div>
                <label className="form-label">
                  <UserGroupIcon className="w-4 h-4 inline mr-1" />
                  Assigned Users (Select Multiple)
                </label>
                <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-3 max-h-48 overflow-y-auto space-y-2">
                  {users.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Loading users...</p>
                  ) : (
                    users.map((user) => (
                      <label key={user.id} className="flex items-center space-x-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.assignedUserIds.includes(user.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormData({
                                ...formData,
                                assignedUserIds: [...formData.assignedUserIds, user.id],
                              })
                            } else {
                              setFormData({
                                ...formData,
                                assignedUserIds: formData.assignedUserIds.filter(id => id !== user.id),
                              })
                            }
                          }}
                          className="w-4 h-4 text-blue-600 dark:text-blue-400 border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-200">{user.name} - {user.position}</span>
                      </label>
                    ))
                  )}
                </div>
                {formData.assignedUserIds.length > 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                    {formData.assignedUserIds.length} user(s) selected
                  </p>
                )}
              </div>

      </div>
    </FormDialog>
  )
}

export default EditTaskModal

