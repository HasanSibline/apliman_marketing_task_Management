import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { analyticsApi } from '@/services/api'

interface AnalyticsData {
  totalTasks: number
  completedTasks: number
  pendingTasks: number
  overdueTasks: number
  totalUsers: number
  activeUsers: number
  tasksByPhase: Record<string, number>
  tasksByPriority: Record<string, number>
  userPerformance: Array<{
    userId: string
    name: string
    tasksAssigned: number
    tasksCompleted: number
    completionRate: number
  }>
  recentActivity: Array<{
    id: string
    type: string
    description: string
    timestamp: string
    userId: string
    userName: string
  }>
}

interface UserAnalytics {
  tasksAssigned: number
  tasksCompleted: number
  tasksInProgress: number
  completionRate: number
  averageCompletionTime: number
  interactions: number
  lastActive: string
  performanceTrend: Array<{
    date: string
    completed: number
    assigned: number
  }>
}

interface AnalyticsState {
  dashboard: AnalyticsData | null
  userAnalytics: UserAnalytics | null
  teamAnalytics: any | null
  taskAnalytics: any | null
  isLoading: boolean
  error: string | null
}

const initialState: AnalyticsState = {
  dashboard: null,
  userAnalytics: null,
  teamAnalytics: null,
  taskAnalytics: null,
  isLoading: false,
  error: null,
}

// Async thunks
export const fetchDashboardAnalytics = createAsyncThunk(
  'analytics/fetchDashboard',
  async (_, { rejectWithValue }) => {
    try {
      const response = await analyticsApi.getDashboard()
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch dashboard analytics')
    }
  }
)

export const fetchUserAnalytics = createAsyncThunk(
  'analytics/fetchUserAnalytics',
  async (userId: string | undefined = undefined, { rejectWithValue }) => {
    try {
      const response = await analyticsApi.getUserAnalytics(userId)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch user analytics')
    }
  }
)

export const fetchTeamAnalytics = createAsyncThunk(
  'analytics/fetchTeamAnalytics',
  async (_, { rejectWithValue }) => {
    try {
      const response = await analyticsApi.getTeamAnalytics()
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch team analytics')
    }
  }
)

export const fetchTaskAnalytics = createAsyncThunk(
  'analytics/fetchTaskAnalytics',
  async (_, { rejectWithValue }) => {
    try {
      const response = await analyticsApi.getTaskAnalytics()
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch task analytics')
    }
  }
)

export const exportTasks = createAsyncThunk(
  'analytics/exportTasks',
  async (params: {
    phase?: string
    assignedToId?: string
    dateFrom?: string
    dateTo?: string
  } = {}, { rejectWithValue }) => {
    try {
      const response = await analyticsApi.exportTasks(params)
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `tasks-export-${new Date().toISOString().split('T')[0]}.xlsx`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      
      return true
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to export tasks')
    }
  }
)

const analyticsSlice = createSlice({
  name: 'analytics',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      // Dashboard Analytics
      .addCase(fetchDashboardAnalytics.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchDashboardAnalytics.fulfilled, (state, action) => {
        state.isLoading = false
        state.dashboard = action.payload
        state.error = null
      })
      .addCase(fetchDashboardAnalytics.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
      })

      // User Analytics
      .addCase(fetchUserAnalytics.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchUserAnalytics.fulfilled, (state, action) => {
        state.isLoading = false
        state.userAnalytics = action.payload
        state.error = null
      })
      .addCase(fetchUserAnalytics.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
      })

      // Team Analytics
      .addCase(fetchTeamAnalytics.fulfilled, (state, action) => {
        state.teamAnalytics = action.payload
      })

      // Task Analytics
      .addCase(fetchTaskAnalytics.fulfilled, (state, action) => {
        state.taskAnalytics = action.payload
      })
  },
})

export const { clearError } = analyticsSlice.actions
export default analyticsSlice.reducer