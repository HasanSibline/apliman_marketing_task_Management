import React from 'react'
import { motion } from 'framer-motion'

interface TaskBoardProps {
  tasks: any[]
  onTaskClick: (task: any) => void
}

const TaskBoard: React.FC<TaskBoardProps> = ({ tasks, onTaskClick }) => {

  const phases = [
    { key: 'PENDING_APPROVAL', title: 'Pending Approval', color: 'bg-gray-100 border-gray-300' },
    { key: 'APPROVED', title: 'Approved', color: 'bg-blue-100 border-blue-300' },
    { key: 'ASSIGNED', title: 'Assigned', color: 'bg-purple-100 border-purple-300' },
    { key: 'IN_PROGRESS', title: 'In Progress', color: 'bg-yellow-100 border-yellow-300' },
    { key: 'COMPLETED', title: 'Completed', color: 'bg-green-100 border-green-300' },
    { key: 'ARCHIVED', title: 'Archived', color: 'bg-gray-100 border-gray-400' },
  ]

  const getTasksByPhase = (phase: string) => {
    return tasks.filter(task => task.phase === phase)
  }

  const getPriorityColor = (priority: number) => {
    switch (priority) {
      case 1: return 'border-l-gray-400'
      case 2: return 'border-l-blue-400'
      case 3: return 'border-l-yellow-400'
      case 4: return 'border-l-orange-400'
      case 5: return 'border-l-red-400'
      default: return 'border-l-gray-400'
    }
  }

  const getPriorityText = (priority: number) => {
    switch (priority) {
      case 1: return 'Low'
      case 2: return 'Medium'
      case 3: return 'Normal'
      case 4: return 'High'
      case 5: return 'Critical'
      default: return 'Normal'
    }
  }

  // const canMoveTask = (_task: any, _newPhase: string) => {
  //   // Only admins can move tasks between phases
  //   return user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN'
  // }

  // const _handleTaskMove = async (task: any, newPhase: string) => {
  //   if (!canMoveTask(task, newPhase)) return

  //   try {
  //     await dispatch(updateTask({ 
  //       id: task.id, 
  //       data: { phase: newPhase } 
  //     })).unwrap()
  //   } catch (error) {
  //     console.error('Failed to update task phase:', error)
  //   }
  // }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
      {phases.map((phase) => {
        const phaseTasks = getTasksByPhase(phase.key)
        
        return (
          <div key={phase.key} className="flex flex-col">
            {/* Column Header */}
            <div className={`rounded-t-lg p-4 border-2 ${phase.color}`}>
              <h3 className="font-semibold text-gray-900 text-sm">
                {phase.title}
              </h3>
              <p className="text-xs text-gray-600 mt-1">
                {phaseTasks.length} task{phaseTasks.length !== 1 ? 's' : ''}
              </p>
            </div>

            {/* Tasks Container */}
            <div className="flex-1 bg-gray-50 border-l-2 border-r-2 border-b-2 border-gray-200 rounded-b-lg p-2 min-h-[400px]">
              <div className="space-y-3">
                {phaseTasks.map((task, index) => (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className={`bg-white rounded-lg p-4 shadow-sm border-l-4 cursor-pointer hover:shadow-md transition-shadow ${getPriorityColor(task.priority)}`}
                    onClick={() => onTaskClick(task)}
                  >
                    {/* Task Title */}
                    <h4 className="font-medium text-gray-900 text-sm mb-2 line-clamp-2">
                      {task.title}
                    </h4>

                    {/* Task Description */}
                    <p className="text-xs text-gray-600 mb-3 line-clamp-2">
                      {task.description}
                    </p>

                    {/* Task Meta */}
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <div className="flex items-center space-x-2">
                        {/* Priority */}
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          task.priority >= 4 ? 'bg-red-100 text-red-800' :
                          task.priority === 3 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {getPriorityText(task.priority)}
                        </span>

                        {/* Assigned User */}
                        {task.assignedTo && (
                          <div className="flex items-center space-x-1">
                            <div className="w-5 h-5 rounded-full bg-primary-600 flex items-center justify-center">
                              <span className="text-xs font-medium text-white">
                                {task.assignedTo.name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <span className="text-xs text-gray-600">
                              {task.assignedTo.name}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Due Date */}
                      {task.dueDate && (
                        <span className={`text-xs ${
                          new Date(task.dueDate) < new Date() 
                            ? 'text-red-600 font-medium' 
                            : 'text-gray-500'
                        }`}>
                          {new Date(task.dueDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>

                    {/* Task Stats */}
                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">
                      <div className="flex items-center space-x-3 text-xs text-gray-500">
                        {/* Comments Count */}
                        {task.comments && task.comments.length > 0 && (
                          <span className="flex items-center space-x-1">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                            </svg>
                            <span>{task.comments.length}</span>
                          </span>
                        )}

                        {/* Files Count */}
                        {task.files && task.files.length > 0 && (
                          <span className="flex items-center space-x-1">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M8 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a1 1 0 112 0v4a7 7 0 11-14 0V7a5 5 0 0110 0v4a3 3 0 11-6 0V7a1 1 0 012 0v4a1 1 0 102 0V7a3 3 0 00-3-3z" clipRule="evenodd" />
                            </svg>
                            <span>{task.files.length}</span>
                          </span>
                        )}
                      </div>

                      {/* Created Date */}
                      <span className="text-xs text-gray-400">
                        {new Date(task.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </motion.div>
                ))}

                {/* Empty State */}
                {phaseTasks.length === 0 && (
                  <div className="text-center py-8">
                    <p className="text-gray-400 text-sm">No tasks in this phase</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default TaskBoard
