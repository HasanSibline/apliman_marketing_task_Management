import React, { useState, useEffect } from 'react'
import { confirmDialog } from '@/components/ui/confirm'
import { motion } from 'framer-motion'
import { PlusIcon, Squares2X2Icon, TrashIcon, PencilIcon } from '@heroicons/react/24/outline'
import { useAppSelector } from '@/hooks/redux'
import { workflowsApi } from '@/services/api'
import { Workflow } from '@/types/task'
import CreateWorkflowModal from '@/components/workflows/CreateWorkflowModal'
import toast from 'react-hot-toast'

/**
 * The steps work moves through, per kind of work.
 *
 * Managers can configure these, not only admins. A workflow describes how one team's
 * own work actually flows, and the manager is the person who knows that; sending every
 * phase rename through someone with no view of the work is how a workflow drifts out of
 * step with what the team really does. Which company a workflow belongs to is enforced
 * on the server, so this decides who may configure their own and nothing wider.
 */
const WorkflowsPage: React.FC = () => {
  const { user } = useAppSelector((state) => state.auth)
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editing, setEditing] = useState<Workflow | null>(null)

  const canManage = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'ADMIN', 'MANAGER'].includes(user?.role ?? '')

  useEffect(() => {
    loadWorkflows()
  }, [])

  const loadWorkflows = async () => {
    try {
      setIsLoading(true)
      const data = await workflowsApi.getAll()
      setWorkflows(data)
    } catch (error) {
      console.error('Error loading workflows:', error)
      toast.error('Could not load workflows')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteWorkflow = async (workflow: Workflow) => {
    if (
      !(await confirmDialog({
        title: `Delete ${workflow.name}?`,
        description:
          'Tasks already using it keep working exactly as they are. You will not be able to choose it for new ones.',
        confirmText: 'Delete workflow',
        variant: 'danger',
      }))
    )
      return

    try {
      await workflowsApi.delete(workflow.id)
      toast.success(`${workflow.name} deleted`)
      loadWorkflows()
    } catch (error: any) {
      // The server explains why in the one case that matters, which is a workflow
      // still in use, so its message is worth more than a generic failure.
      toast.error(error.response?.data?.message || 'Could not delete this workflow')
    }
  }

  if (!canManage) {
    return (
      <div className="surface flex flex-col items-center justify-center px-6 py-20 text-center">
        <Squares2X2Icon className="h-10 w-10 text-gray-400 dark:text-gray-500" />
        <h1 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
          Workflows are set up by your manager
        </h1>
        <p className="mt-1 max-w-sm text-sm text-gray-500 dark:text-gray-400">
          You will still see a task move through its phases. Changing the phases themselves is done
          here by an admin or a manager.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Workflows</h1>
          <p className="page-subtitle">The phases work moves through, one set per kind of work.</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="btn-primary">
          <PlusIcon className="h-4 w-4" />
          New workflow
        </button>
      </header>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="surface h-56 animate-pulse" />
          ))}
        </div>
      ) : workflows.length === 0 ? (
        <div className="surface flex flex-col items-center justify-center px-6 py-16 text-center">
          <Squares2X2Icon className="h-10 w-10 text-gray-400 dark:text-gray-500" />
          <h2 className="mt-4 text-base font-semibold text-gray-900 dark:text-white">
            No workflows yet
          </h2>
          <p className="mt-1 max-w-sm text-sm text-gray-500 dark:text-gray-400">
            A workflow is the set of phases a task passes through. Create one and it becomes
            available when anybody starts a task of that kind.
          </p>
          <button onClick={() => setShowCreateModal(true)} className="btn-primary mt-5">
            <PlusIcon className="h-4 w-4" />
            Create the first one
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {workflows.map((workflow, i) => {
            // Copied before sorting. Array.prototype.sort works in place, so sorting
            // the phases straight off state mutates the object React is holding, and
            // the render that caused it is a render that changed state.
            const phases = [...(workflow.phases ?? [])].sort((a, b) => a.order - b.order)

            return (
              <motion.article
                key={workflow.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, delay: Math.min(i * 0.04, 0.24) }}
                className="surface group flex flex-col gap-4 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span
                      className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: workflow.color }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-semibold text-gray-900 dark:text-white">
                        {workflow.name}
                      </h2>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {workflow.taskType?.replace(/_/g, ' ').toLowerCase() || 'Any work'}
                        {workflow.isDefault && ' · used by default'}
                      </p>
                    </div>
                  </div>

                  {/* Revealed on hover, reachable on focus. Actions that are only ever
                      visible on hover are invisible to a keyboard. */}
                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                    <button
                      onClick={() => setEditing(workflow)}
                      aria-label={`Edit ${workflow.name}`}
                      className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteWorkflow(workflow)}
                      aria-label={`Delete ${workflow.name}`}
                      className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {workflow.description && (
                  <p className="line-clamp-2 text-sm text-gray-600 dark:text-gray-300">
                    {workflow.description}
                  </p>
                )}

                {/* The phases in order, as a path rather than a bag of chips: the order
                    is the entire point of a workflow, and separate pills say nothing
                    about which comes first. */}
                <div className="mt-auto">
                  <p className="eyebrow">
                    {phases.length} {phases.length === 1 ? 'phase' : 'phases'}
                  </p>
                  <ol className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-2">
                    {phases.map((phase, index) => (
                      <li key={phase.id} className="flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 py-1 pl-2 pr-2.5 text-xs font-medium text-gray-700 dark:border-gray-700 dark:text-gray-200">
                          {/* The phase colour as a dot, not as the label's ground. A
                              user-chosen colour behind white text is a contrast bet
                              nobody placed. */}
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: phase.color }}
                            aria-hidden="true"
                          />
                          {phase.name}
                        </span>
                        {index < phases.length - 1 && (
                          <span className="text-gray-300 dark:text-gray-600" aria-hidden="true">
                            →
                          </span>
                        )}
                      </li>
                    ))}
                    {phases.length === 0 && (
                      <li className="text-xs text-gray-500 dark:text-gray-400">
                        No phases yet, so tasks using this have nowhere to move.
                      </li>
                    )}
                  </ol>
                </div>

                <p className="border-t border-gray-100 pt-3 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  {workflow.createdBy?.name ? `Set up by ${workflow.createdBy.name}` : 'Set up'}
                  {' · '}
                  {new Date(workflow.createdAt).toLocaleDateString()}
                </p>
              </motion.article>
            )
          })}
        </div>
      )}

      <CreateWorkflowModal
        isOpen={showCreateModal || !!editing}
        workflow={editing}
        onClose={() => {
          setShowCreateModal(false)
          setEditing(null)
        }}
        onSuccess={() => {
          setShowCreateModal(false)
          setEditing(null)
          loadWorkflows()
        }}
      />
    </div>
  )
}

export default WorkflowsPage
