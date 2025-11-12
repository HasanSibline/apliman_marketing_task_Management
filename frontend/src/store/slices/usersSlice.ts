import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import { usersApi } from '@/services/api'
import toast from 'react-hot-toast'

export interface User {
  id: string
  email: string
  name: string
  role: 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'ADMIN' | 'EMPLOYEE'
  position?: string
  status: 'ACTIVE' | 'AWAY' | 'OFFLINE' | 'RETIRED'
  createdAt: string
  updatedAt: string
  companyId: string | null
}

interface UsersState {
  users: User[]
  currentUser: User | null
  isLoading: boolean
  error: string | null
  filters: {
    role?: string
    status?: string
  }
}

const initialState: UsersState = {
  users: [],
  currentUser: null,
  isLoading: false,
  error: null,
  filters: {},
}

// Async thunks
export const fetchUsers = createAsyncThunk(
  'users/fetchUsers',
  async (params: { role?: string; status?: string } = {}, { rejectWithValue }) => {
    try {
      const response = await usersApi.getAll(params)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch users')
    }
  }
)

export const fetchAssignableUsers = createAsyncThunk(
  'users/fetchAssignableUsers',
  async (_, { rejectWithValue }) => {
    try {
      const response = await usersApi.getAssignable()
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch assignable users')
    }
  }
)

export const fetchUserById = createAsyncThunk(
  'users/fetchUserById',
  async (id: string, { rejectWithValue }) => {
    try {
      const response = await usersApi.getById(id)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch user')
    }
  }
)

export const updateUser = createAsyncThunk(
  'users/updateUser',
  async ({ id, data }: { id: string; data: any }, { rejectWithValue }) => {
    try {
      const response = await usersApi.update(id, data)
      toast.success('User updated successfully!')
      return response
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to update user'
      toast.error(message)
      return rejectWithValue(message)
    }
  }
)

export const updateUserStatus = createAsyncThunk(
  'users/updateUserStatus',
  async ({ id, status }: { id: string; status: string }, { rejectWithValue }) => {
    try {
      const response = await usersApi.updateStatus(id, status)
      toast.success('User status updated successfully!')
      return response
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to update user status'
      toast.error(message)
      return rejectWithValue(message)
    }
  }
)

export const deleteUser = createAsyncThunk(
  'users/deleteUser',
  async (id: string, { rejectWithValue }) => {
    try {
      await usersApi.delete(id)
      toast.success('User deleted successfully!')
      return id
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to delete user'
      toast.error(message)
      return rejectWithValue(message)
    }
  }
)

const usersSlice = createSlice({
  name: 'users',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null
    },
    setFilters: (state, action: PayloadAction<Partial<UsersState['filters']>>) => {
      state.filters = { ...state.filters, ...action.payload }
    },
    clearFilters: (state) => {
      state.filters = {}
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch Users
      .addCase(fetchUsers.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchUsers.fulfilled, (state, action) => {
        state.isLoading = false
        state.users = action.payload
        state.error = null
      })
      .addCase(fetchUsers.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
      })

      // Fetch Assignable Users
      .addCase(fetchAssignableUsers.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchAssignableUsers.fulfilled, (state, action) => {
        state.isLoading = false
        state.users = action.payload
        state.error = null
      })
      .addCase(fetchAssignableUsers.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
      })

      // Fetch User By ID
      .addCase(fetchUserById.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchUserById.fulfilled, (state, action) => {
        state.isLoading = false
        state.currentUser = action.payload
        state.error = null
      })
      .addCase(fetchUserById.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
      })

      // Update User
      .addCase(updateUser.fulfilled, (state, action) => {
        const index = state.users.findIndex(user => user.id === action.payload.id)
        if (index !== -1) {
          state.users[index] = { ...state.users[index], ...action.payload }
        }
        if (state.currentUser?.id === action.payload.id) {
          state.currentUser = { ...state.currentUser, ...action.payload }
        }
      })

      // Update User Status
      .addCase(updateUserStatus.fulfilled, (state, action) => {
        const index = state.users.findIndex(user => user.id === action.payload.id)
        if (index !== -1) {
          state.users[index] = { ...state.users[index], ...action.payload }
        }
        if (state.currentUser?.id === action.payload.id) {
          state.currentUser = { ...state.currentUser, ...action.payload }
        }
      })

      // Delete User
      .addCase(deleteUser.fulfilled, (state, action) => {
        state.users = state.users.filter(user => user.id !== action.payload)
        if (state.currentUser?.id === action.payload) {
          state.currentUser = null
        }
      })
  },
})

export const { clearError, setFilters, clearFilters } = usersSlice.actions
export default usersSlice.reducer