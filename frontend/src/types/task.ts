export interface Task {
  id: string
  title: string
  description: string
  priority: number
  phase: 'PENDING_APPROVAL' | 'APPROVED' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'ARCHIVED'
  assignedToId?: string
  assignedTo?: {
    id: string
    name: string
    email: string
    position: string
  }
  createdById: string
  createdBy?: {
    id: string
    name: string
    email: string
    position: string
  }
  dueDate?: string
  createdAt: string
  updatedAt: string
  comments?: any[]
  files?: any[]
  goals?: string
  _count?: {
    files: number
    comments: number
  }
}