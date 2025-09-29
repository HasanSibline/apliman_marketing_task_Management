export enum TaskPhase {
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  ASSIGNED = 'ASSIGNED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  ARCHIVED = 'ARCHIVED',
}

export interface Task {
  id: string
  title: string
  description: string
  phase: TaskPhase
  goals?: string
  priority: number
  dueDate?: string
  createdAt: string
  updatedAt: string
  assignedToId?: string
  createdById: string
  assignedTo?: {
    id: string
    name: string
    email: string
    position?: string
  }
  createdBy?: {
    id: string
    name: string
    email: string
  }
  comments?: TaskComment[]
  files?: TaskFile[]
}

export interface TaskComment {
  id: string
  taskId: string
  userId: string
  comment: string
  createdAt: string
  user: {
    id: string
    name: string
    email: string
  }
}

export interface TaskFile {
  id: string
  taskId: string
  fileName: string
  filePath: string
  fileType: string
  fileSize: number
  uploadedAt: string
}
