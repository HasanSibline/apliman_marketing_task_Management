import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import { tasksApi, Task, CreateTaskData } from '@/services/api'
import toast from 'react-hot-toast'

interface TasksState {
  tasks: Task[]
  currentTask: Task | null
  phaseCount: Record<string, number>
  pagination: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
  isLoading: boolean
  error: string | null
  filters: {
    phase?: string
    assignedToId?: string
    createdById?: string
  }
}

const initialState: TasksState = {
  tasks: [],
  currentTask: null,
  phaseCount: {},
  pagination: {
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0,
  },
  isLoading: false,
  error: null,
  filters: {},
}

// Async thunks
export const fetchTasks = createAsyncThunk(
  'tasks/fetchTasks',
  async (params?: {
    phase?: string
    assignedToId?: string
    createdById?: string
    page?: number
    limit?: number
  }, { rejectWithValue }) => {
    try {
      const response = await tasksApi.getAll(params)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch tasks')
    }
  }
)

export const fetchTaskById = createAsyncThunk(
  'tasks/fetchTaskById',
  async (id: string, { rejectWithValue }) => {
    try {
      const response = await tasksApi.getById(id)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch task')
    }
  }
)

export const fetchMyTasks = createAsyncThunk(
  'tasks/fetchMyTasks',
  async (params?: { phase?: string; page?: number; limit?: number }, { rejectWithValue }) => {
    try {
      const response = await tasksApi.getMyTasks(params)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch tasks')
    }
  }
)

export const fetchPhaseCount = createAsyncThunk(
  'tasks/fetchPhaseCount',
  async (_, { rejectWithValue }) => {
    try {
      const response = await tasksApi.getPhaseCount()
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch phase count')
    }
  }
)

export const createTask = createAsyncThunk(
  'tasks/createTask',
  async (data: CreateTaskData, { rejectWithValue }) => {
    try {
      const response = await tasksApi.create(data)
      toast.success('Task created successfully!')
      return response
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to create task'
      toast.error(message)
      return rejectWithValue(message)
    }
  }
)

export const updateTask = createAsyncThunk(
  'tasks/updateTask',
  async ({ id, data }: { id: string; data: Partial<CreateTaskData> }, { rejectWithValue }) => {
    try {
      const response = await tasksApi.update(id, data)
      toast.success('Task updated successfully!')
      return response
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to update task'
      toast.error(message)
      return rejectWithValue(message)
    }
  }
)

export const deleteTask = createAsyncThunk(
  'tasks/deleteTask',
  async (id: string, { rejectWithValue }) => {
    try {
      await tasksApi.delete(id)
      toast.success('Task deleted successfully!')
      return id
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to delete task'
      toast.error(message)
      return rejectWithValue(message)
    }
  }
)

export const addComment = createAsyncThunk(
  'tasks/addComment',
  async ({ taskId, comment }: { taskId: string; comment: string }, { rejectWithValue }) => {
    try {
      const response = await tasksApi.addComment(taskId, comment)
      toast.success('Comment added successfully!')
      return response
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to add comment'
      toast.error(message)
      return rejectWithValue(message)
    }
  }
)

const tasksSlice = createSlice({
  name: 'tasks',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null
    },
    setFilters: (state, action: PayloadAction<Partial<TasksState['filters']>>) => {
      state.filters = { ...state.filters, ...action.payload }
    },
    clearFilters: (state) => {
      state.filters = {}
    },
    setCurrentTask: (state, action: PayloadAction<Task | null>) => {
      state.currentTask = action.payload
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch Tasks
      .addCase(fetchTasks.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchTasks.fulfilled, (state, action) => {
        state.isLoading = false
        state.tasks = action.payload.tasks
        state.pagination = action.payload.pagination
        state.error = null
      })
      .addCase(fetchTasks.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
      })

      // Fetch Task By ID
      .addCase(fetchTaskById.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchTaskById.fulfilled, (state, action) => {
        state.isLoading = false
        state.currentTask = action.payload
        state.error = null
      })
      .addCase(fetchTaskById.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
      })

      // Fetch My Tasks
      .addCase(fetchMyTasks.fulfilled, (state, action) => {
        state.tasks = action.payload.tasks
        state.pagination = action.payload.pagination
      })

      // Fetch Phase Count
      .addCase(fetchPhaseCount.fulfilled, (state, action) => {
        state.phaseCount = action.payload
      })

      // Create Task
      .addCase(createTask.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(createTask.fulfilled, (state, action) => {
        state.isLoading = false
        state.tasks.unshift(action.payload)
        state.error = null
      })
      .addCase(createTask.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
      })

      // Update Task
      .addCase(updateTask.fulfilled, (state, action) => {
        const index = state.tasks.findIndex(task => task.id === action.payload.id)
        if (index !== -1) {
          state.tasks[index] = action.payload
        }
        if (state.currentTask?.id === action.payload.id) {
          state.currentTask = action.payload
        }
      })

      // Delete Task
      .addCase(deleteTask.fulfilled, (state, action) => {
        state.tasks = state.tasks.filter(task => task.id !== action.payload)
        if (state.currentTask?.id === action.payload) {
          state.currentTask = null
        }
      })
  },
})

export const { clearError, setFilters, clearFilters, setCurrentTask } = tasksSlice.actions
export default tasksSlice.reducer
