export interface Task {
  id: string
  title: string
  description: string
  priority: number
  phase: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'ARCHIVED'
  assignedToId?: string
  assignedTo?: {
    id: string
    name: string
    email: string
    position: string
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
      position: string
    }
  }[]
  createdById: string
  createdBy?: {
    id: string
    name: string
    email: string
    position: string
  }
  dueDate?: string
  createdAt: string
  updatedAt?: string
  comments?: any[]
  files?: any[]
  subtasks?: Subtask[]
  goals?: string
  _count?: {
    files: number
    comments: number
    subtasks: number
  }
}

export interface Subtask {
  id: string
  title: string
  description?: string
  completed: boolean
  priority: number
  dueDate?: string
  createdAt: string
  updatedAt: string
  taskId: string
  assignedToId?: string
  assignedTo?: {
    id: string
    name: string
    email: string
    position: string
  }
  createdById: string
  createdBy: {
    id: string
    name: string
    email: string
    position: string
  }
}