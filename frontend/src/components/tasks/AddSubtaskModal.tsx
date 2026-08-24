import React, { useState, useEffect } from 'react'
import FormDialog from '@/components/ui/FormDialog'
import { PlusIcon, ClockIcon } from '@heroicons/react/24/outline'
import { usersApi } from '@/services/api'
import toast from 'react-hot-toast'
import Select from '@/components/ui/Select'

interface AddSubtaskModalProps {
  isOpen: boolean
  onClose: () => void
  onAdd: (subtask: {
    title: string
    description: string
    assignedToId?: string
    estimatedHours?: number
    phaseId?: string
  }) => void | Promise<void>
  availablePhases: Array<{ id: string; name: string; color: string }>
}

interface User {
  id: string
  name: string
  email: string
  position?: string
}

const AddSubtaskModal: React.FC<AddSubtaskModalProps> = ({
  isOpen,
  onClose,
  onAdd,
  availablePhases,
}) => {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assignedToId, setAssignedToId] = useState<string>('')
  const [estimatedHours, setEstimatedHours] = useState<string>('')
  const [phaseId, setPhaseId] = useState<string>('')
  const [users, setUsers] = useState<User[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  // The caller builds availablePhases with `?.phases || []`, so it is a brand
  // new array on every parent render. Depending on the array itself refired a
  // GET /users each time the parent re-rendered; depend on the id instead.
  const firstPhaseId = availablePhases[0]?.id || ''

  useEffect(() => {
    if (isOpen) {
      loadUsers()
    }
  }, [isOpen])

  // Emptied on every open. The dialog is mounted for the life of the page rather than
  // created per open, so without this, adding one subtask and pressing Add again showed
  // the previous subtask's title, owner and hours still filled in, and the quickest way
  // through the form was to submit the same thing twice.
  useEffect(() => {
    if (!isOpen) return
    setTitle('')
    setDescription('')
    setAssignedToId('')
    setEstimatedHours('')
    setPhaseId(firstPhaseId)
  }, [isOpen])

  useEffect(() => {
    // The parent may still be loading the workflow when this opens, so the first phase
    // can arrive after the reset above. Functional, because the reset in the effect
    // beside this one has not been applied to `phaseId` yet at this point.
    if (isOpen && firstPhaseId) {
      setPhaseId((prev) => prev || firstPhaseId)
    }
  }, [isOpen, firstPhaseId])

  const loadUsers = async () => {
    try {
      const data: any = await usersApi.getAll()
      const userList = Array.isArray(data) ? data : (data.users || [])
      setUsers(userList.filter((u: User) => u))
    } catch (error) {
      console.error('Failed to load users:', error)
    }
  }

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error('Please enter a subtask title')
      return
    }

    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      // Awaited. It used not to be, and onAdd returns a promise: the flag went up and
      // down in the same tick, so the button was never actually disabled and a second
      // click filed the subtask twice.
      await onAdd({
        title: title.trim(),
        description: description.trim(),
        assignedToId: assignedToId || undefined,
        estimatedHours: estimatedHours ? parseFloat(estimatedHours) : undefined,
        phaseId: phaseId || undefined,
      })

      // Closing is the caller's to do, and so is saying it worked. It is the only side
      // that knows whether the server accepted the subtask; this dialog used to
      // announce success and shut itself the instant it handed the work over, so a
      // rejected create showed "Subtask added successfully" and then vanished with the
      // typed-in text, leaving the error toast pointing at nothing.
    } catch (error) {
      toast.error('Failed to add subtask')
    } finally {
      setIsSubmitting(false)
    }
  }

  const selectedPhase = availablePhases.find(p => p.id === phaseId)

  return (
    <FormDialog
      isOpen={isOpen}
      onClose={onClose}
      busy={isSubmitting}
      width="md"
      title="Add a subtask"
      description="A smaller piece of work under this task, with its own owner and dates."
      footer={
        <>
          {/* Quiet while the subtask is on its way, for the same reason Escape and the
              backdrop are: closing over a request in flight leaves the person with no
              idea whether it landed, and the obvious response is to add it again. */}
          <button type="button" onClick={onClose} className="btn-secondary" disabled={isSubmitting}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !title.trim()}
            className="btn-primary"
          >
            <PlusIcon className="h-4 w-4" />
            {isSubmitting ? 'Adding…' : 'Add subtask'}
          </button>
        </>
      }
    >
            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="form-label">
                  Title *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter subtask title"
                  className="input-field"
                  autoFocus
                />
              </div>

              {/* Description */}
              <div>
                <label className="form-label">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Enter subtask description"
                  rows={3}
                  className="input-field resize-none"
                />
              </div>

              {/* These two were hand-built dropdowns: a button, a state flag, and an
                  absolutely positioned panel of more buttons. They cost more than a
                  select and did less, and once the dialog body scrolls, the panel is
                  clipped by it. A native list is drawn by the browser above everything
                  and cannot be clipped by any container, which is the one thing the
                  hand-built version could never do. */}
              <div>
                <label htmlFor="subtask-assignee" className="form-label">
                  Assign to
                </label>
                <Select
                  id="subtask-assignee"
                  value={assignedToId}
                  onChange={(e) => setAssignedToId(e.target.value)}
                  className="select-field"
                >
                  <option value="">Nobody yet</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                      {user.position ? ` · ${user.position}` : ''}
                    </option>
                  ))}
                </Select>
              </div>

              {availablePhases.length > 0 && (
                <div>
                  <label htmlFor="subtask-phase" className="form-label">
                    Phase
                  </label>
                  <Select
                    id="subtask-phase"
                    value={phaseId}
                    onChange={(e) => setPhaseId(e.target.value)}
                    className="select-field"
                  >
                    {availablePhases.map((phase) => (
                      <option key={phase.id} value={phase.id}>
                        {phase.name}
                      </option>
                    ))}
                  </Select>
                  {selectedPhase && (
                    <p className="form-hint flex items-center gap-1.5">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: selectedPhase.color }}
                      />
                      Subtask starts in {selectedPhase.name}.
                    </p>
                  )}
                </div>
              )}

              {/* Estimated Hours */}
              <div>
                <label className="form-label">
                  <ClockIcon className="h-4 w-4 inline mr-1" />
                  Estimated Hours
                </label>
                <input
                  type="number"
                  value={estimatedHours}
                  onChange={(e) => setEstimatedHours(e.target.value)}
                  placeholder="e.g., 2.5"
                  step="0.5"
                  min="0"
                  className="input-field"
                />
              </div>
            </div>
    </FormDialog>
  )
}

export default AddSubtaskModal

