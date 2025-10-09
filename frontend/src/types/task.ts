export interface Phase {
  id: string
  name: string
  description?: string
  order: number
  color: string
  allowedRoles: string[]
  autoAssignRole?: string
  isStartPhase: boolean
  isEndPhase: boolean
  requiresApproval: boolean
  workflowId: string
}

export interface Workflow {
  id: string
  name: string
  description?: string
  taskType: string
  isActive: boolean
  isDefault: boolean
  color: string
  icon?: string
  createdById: string
  createdBy?: {
    id: string
    name: string
    email: string
  }
  phases: Phase[]
  createdAt: string
  updatedAt: string
}

export interface Subtask {
  id: string
  taskId: string
  title: string
  description?: string
  order: number
  phaseId?: string
  phase?: Phase
  assignedToId?: string
  assignedTo?: {
    id: string
    name: string
    email: string
    position?: string
  }
  suggestedRole?: string
  isCompleted: boolean
  completedAt?: string
  dueDate?: string
  estimatedHours?: number
  createdAt: string
  updatedAt: string
}

export interface Task {
  id: string
  title: string
  description: string
  priority: number
  // Legacy phase field for backward compatibility
  phase?: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'ARCHIVED'
  // New workflow fields
  taskType?: string
  workflowId?: string
  workflow?: Workflow
  currentPhaseId?: string
  currentPhase?: Phase
  assignedToId?: string
  assignedTo?: {
    id: string
    name: string
    email: string
    position?: string
  }
  assignments?: {
    id: string
    userId: string
    assignedAt: string
    assignedBy?: string
    user: {
      id: string
      name: string
      email: string
      position?: string
    }
  }[]
  createdById: string
  createdBy?: {
    id: string
    name: string
    email: string
    position?: string
  }
  dueDate?: string
  completedAt?: string
  createdAt: string
  updatedAt?: string
  comments?: any[]
  files?: any[]
  subtasks?: Subtask[]
  goals?: string
  _count?: {
    files: number
    comments: number
    subtasks?: number
  }
}