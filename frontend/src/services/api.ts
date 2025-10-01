import axios from 'axios'
import toast from 'react-hot-toast'

const API_BASE_URL = (import.meta as any).env.VITE_API_URL || 'http://localhost:3001/api'

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    } else if (error.response?.status >= 500) {
      toast.error('Server error. Please try again later.')
    }
    return Promise.reject(error)
  }
)

// Types
export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterData {
  email: string
  name: string
  password: string
  role: 'SUPER_ADMIN' | 'ADMIN' | 'EMPLOYEE'
  position?: string
}

import { Task } from '@/types/task'

export interface ApiTask {
  id: string
  title: string
  description: string
  phase: 'PENDING_APPROVAL' | 'APPROVED' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'ARCHIVED'
  priority: number
  goals?: string
  dueDate?: string
  createdAt: string
  updatedAt: string
  assignedToId?: string
  assignedTo?: {
    id: string
    name: string
    email: string
    position: string
    status: string
  }
  createdBy: {
    id: string
    name: string
    email: string
    position: string
  }
  comments?: any[]
  files?: any[]
  _count: {
    files: number
    comments: number
  }
}

export interface CreateTaskData {
  title: string
  description: string
  phase?: string
  goals?: string
  priority?: number
  dueDate?: string
  assignedToId?: string
}

// Auth API
export const authApi = {
  login: async (credentials: LoginCredentials): Promise<any> => {
    const response = await api.post('/auth/login', credentials)
    return response.data
  },

  logout: async (): Promise<void> => {
    await api.post('/auth/logout')
  },

  refreshToken: async (): Promise<any> => {
    const response = await api.post('/auth/refresh')
    return response.data
  },

  changePassword: async (passwords: { oldPassword: string; newPassword: string }): Promise<void> => {
    await api.post('/auth/change-password', passwords)
  },

  register: async (data: RegisterData): Promise<any> => {
    const response = await api.post('/auth/register', data)
    return response.data
  },
}

// Users API
export const usersApi = {
  getAll: async (params?: { role?: string; status?: string }): Promise<any[]> => {
    const response = await api.get('/users', { params })
    return response.data
  },

  create: async (data: {
    name: string
    email: string
    password: string
    role: string
    position: string
  }): Promise<any> => {
    const response = await api.post('/auth/register', data)
    return response.data
  },

  getById: async (id: string): Promise<any> => {
    const response = await api.get(`/users/${id}`)
    return response.data
  },

  getProfile: async (): Promise<any> => {
    const response = await api.get('/users/me')
    return response.data
  },

  update: async (id: string, data: any): Promise<any> => {
    const response = await api.patch(`/users/${id}`, data)
    return response.data
  },

  updateProfile: async (data: any): Promise<any> => {
    const response = await api.patch('/users/me', data)
    return response.data
  },

  updateStatus: async (id: string, status: string): Promise<any> => {
    const response = await api.patch(`/users/${id}/status`, { status })
    return response.data
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/users/${id}`)
  },

  resetPassword: async (id: string): Promise<any> => {
    const response = await api.post(`/users/${id}/reset-password`)
    return response.data
  },
}

// Tasks API
export const tasksApi = {
  getAll: async (params?: {
    phase?: string
    assignedToId?: string
    createdById?: string
    page?: number
    limit?: number
  }): Promise<{ tasks: Task[]; pagination: any }> => {
    const response = await api.get('/tasks', { params })
    return response.data
  },

  getById: async (id: string): Promise<Task> => {
    const response = await api.get(`/tasks/${id}`)
    return response.data
  },

  getMyTasks: async (params?: { phase?: string; page?: number; limit?: number }): Promise<any> => {
    const response = await api.get('/tasks/my-tasks', { params })
    return response.data
  },

  getPhaseCount: async (): Promise<Record<string, number>> => {
    const response = await api.get('/tasks/phases/count')
    return response.data
  },

  create: async (data: CreateTaskData): Promise<Task> => {
    const response = await api.post('/tasks', data)
    return response.data
  },

  update: async (id: string, data: Partial<CreateTaskData>): Promise<Task> => {
    const response = await api.patch(`/tasks/${id}`, data)
    return response.data
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/tasks/${id}`)
  },

  addComment: async (taskId: string, comment: string): Promise<any> => {
    const response = await api.post(`/tasks/${taskId}/comments`, { comment })
    return response.data
  },

  addSubtask: async (taskId: string, title: string): Promise<any> => {
    const response = await api.post(`/tasks/${taskId}/subtasks`, { title })
    return response.data
  },

  updateSubtask: async (taskId: string, subtaskId: string, data: { completed: boolean }): Promise<any> => {
    const response = await api.patch(`/tasks/${taskId}/subtasks/${subtaskId}`, data)
    return response.data
  },

  deleteSubtask: async (taskId: string, subtaskId: string): Promise<void> => {
    await api.delete(`/tasks/${taskId}/subtasks/${subtaskId}`)
  },

  startTimeTracking: async (taskId: string): Promise<any> => {
    const response = await api.post(`/tasks/${taskId}/time/start`)
    return response.data
  },

  stopTimeTracking: async (taskId: string): Promise<any> => {
    const response = await api.post(`/tasks/${taskId}/time/stop`)
    return response.data
  },

  pauseTimeTracking: async (taskId: string): Promise<any> => {
    const response = await api.post(`/tasks/${taskId}/time/pause`)
    return response.data
  },

  getTimeEntries: async (taskId: string): Promise<any[]> => {
    const response = await api.get(`/tasks/${taskId}/time`)
    return response.data
  },
}

// Files API
export const filesApi = {
  upload: async (taskId: string, files: FileList): Promise<any[]> => {
    const formData = new FormData()
    Array.from(files).forEach((file) => {
      formData.append('files', file)
    })

    const response = await api.post(`/files/upload/${taskId}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  },

  getTaskFiles: async (taskId: string): Promise<any[]> => {
    const response = await api.get(`/files/task/${taskId}`)
    return response.data
  },

  download: async (fileId: string): Promise<Blob> => {
    const response = await api.get(`/files/download/${fileId}`, {
      responseType: 'blob',
    })
    return response.data
  },

  delete: async (fileId: string): Promise<void> => {
    await api.delete(`/files/${fileId}`)
  },

  getStats: async (): Promise<any> => {
    const response = await api.get('/files/stats')
    return response.data
  },
}

// Analytics API
export const analyticsApi = {
  generateInsights: async (analyticsData: any): Promise<any> => {
    const response = await api.post('/ai/performance-insights', {
      user_id: analyticsData.user?.id,
      team_id: analyticsData.team?.id,
      time_range: 'last_30_days',
      metrics: {
        tasks: analyticsData.tasks,
        dashboard: analyticsData.dashboard
      }
    })
    return response.data
  },
  exportTasksReport: async (): Promise<any> => {
    const response = await api.get('/analytics/export/tasks', {
      responseType: 'blob',
    })
    return response.data
  },
  getDashboard: async (): Promise<any> => {
    const response = await api.get('/analytics/dashboard')
    return response.data
  },

  getUserAnalytics: async (userId?: string): Promise<any> => {
    const url = userId ? `/analytics/user/${userId}` : '/analytics/user/me'
    const response = await api.get(url)
    return response.data
  },

  getTeamAnalytics: async (): Promise<any> => {
    const response = await api.get('/analytics/team')
    return response.data
  },

  getTaskAnalytics: async (): Promise<any> => {
    const response = await api.get('/analytics/tasks')
    return response.data
  },

  exportTasks: async (params?: {
    phase?: string
    assignedToId?: string
    dateFrom?: string
    dateTo?: string
  }): Promise<Blob> => {
    const response = await api.get('/analytics/export/tasks', {
      params,
      responseType: 'blob',
    })
    return response.data
  },
}

// AI API
export const aiApi = {
  generateContent: async (title: string, type: string): Promise<any> => {
    const response = await api.post('/ai/generate-content', { title, type })
    return response.data
  },
  checkHealth: async (): Promise<any> => {
    const response = await api.get('/ai/health')
    return response.data
  },

  summarizeText: async (text: string, maxLength?: number): Promise<any> => {
    const response = await api.post('/ai/summarize', { text, maxLength })
    return response.data
  },

  analyzePriority: async (title: string, description: string): Promise<any> => {
    const response = await api.post('/ai/analyze-priority', { title, description })
    return response.data
  },

  checkCompleteness: async (description: string, goals: string, phase: string): Promise<any> => {
    const response = await api.post('/ai/check-completeness', { description, goals, phase })
    return response.data
  },

  generateInsights: async (analyticsData: any): Promise<any> => {
    const response = await api.post('/ai/performance-insights', analyticsData)
    return response.data
  },
}

export default api
