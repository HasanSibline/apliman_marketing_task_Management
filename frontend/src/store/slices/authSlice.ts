import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import { authApi } from '@/services/api'
import { clearTimeTrackingStorage } from './timeTrackingSlice'
import toast from 'react-hot-toast'

export interface User {
  id: string
  email: string
  name: string
  role: 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'ADMIN' | 'MANAGER' | 'EMPLOYEE'
  position?: string
  status: 'ACTIVE' | 'AWAY' | 'OFFLINE' | 'RETIRED'
  companyId?: string | null
  subscriptionPlan?: string | null
  departmentId?: string | null
  managerId?: string | null
  avatar?: string | null
  strategyAccess: 'NONE' | 'READ' | 'EDIT'
  companyLogo?: string | null
  companyColor?: string | null
  /** The company's own sign-in address, so sign-out can return to it. */
  companySlug?: string | null
  isMicrosoftSynced?: boolean
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
}

const initialState: AuthState = {
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
}

// Async thunks
export const login = createAsyncThunk(
  'auth/login',
  async (credentials: { email: string; password: string }, { rejectWithValue }) => {
    try {
      const response = await authApi.login(credentials)
      localStorage.setItem('token', response.accessToken)
      toast.success('Login successful!')
      return response
    } catch (error: any) {
      const message = error.response?.data?.message || 'Login failed'
      toast.error(message)
      return rejectWithValue(message)
    }
  }
)

export const logout = createAsyncThunk(
  'auth/logout',
  async (_, { rejectWithValue }) => {
    try {
      await authApi.logout()
      endLocalSession()
      toast.success('Logged out successfully')
      return null
    } catch (error: any) {
      endLocalSession()
      return rejectWithValue(error.response?.data?.message || 'Logout failed')
    }
  }
)

/**
 * Everything this browser was holding on behalf of the person signing out.
 *
 * The store is emptied by the root reducer on the same action, but two things live
 * outside it: the token, and the task timers, which keep their own localStorage copy.
 * Left behind, the timers are restored on the next load and shown to whoever signs in
 * next on this machine.
 */
function endLocalSession() {
  localStorage.removeItem('token')
  clearTimeTrackingStorage()
}

export const checkAuth = createAsyncThunk(
  'auth/checkAuth',
  async (_, { rejectWithValue }) => {
    try {
      const token = localStorage.getItem('token')
      if (!token) {
        return rejectWithValue('No token found')
      }

      const response = await authApi.refreshToken()
      localStorage.setItem('token', response.accessToken)
      return response
    } catch (error: any) {
      // A server that never answered has said nothing about the token. Throwing it
      // away on a timeout signs people out because the backend was cold, and the
      // token may well still be valid a moment later. Only a refusal is a refusal.
      const refused = error.response?.status === 401 || error.response?.status === 403
      if (refused) localStorage.removeItem('token')

      return rejectWithValue(
        refused
          ? error.response?.data?.message || 'Your session has expired. Please sign in again.'
          : 'Could not reach the server. Please try again.',
      )
    }
  }
)

export const changePassword = createAsyncThunk(
  'auth/changePassword',
  async (
    passwords: { oldPassword: string; newPassword: string },
    { rejectWithValue }
  ) => {
    try {
      await authApi.changePassword(passwords)
      toast.success('Password changed successfully!')
      return null
    } catch (error: any) {
      const message = error.response?.data?.message || 'Password change failed'
      toast.error(message)
      return rejectWithValue(message)
    }
  }
)

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null
    },
    updateUser: (state, action: PayloadAction<Partial<User>>) => {
      if (state.user) {
        state.user = { ...state.user, ...action.payload }
      }
    },
    /**
     * Drop the session locally, without asking the server.
     *
     * For the cases where it has already ended: another tab signed out, or the idle
     * timer fired. Navigating while `isAuthenticated` stayed true sent people
     * straight back to the dashboard with no token, where every request 401s.
     */
    clearSession: (state) => {
      state.user = null
      state.token = null
      state.isAuthenticated = false
      state.error = null
    },
    setAuth: (state, action: PayloadAction<{ user: User; token: string }>) => {
      state.user = action.payload.user
      state.token = action.payload.token
      state.isAuthenticated = true
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      // Login
      .addCase(login.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(login.fulfilled, (state, action) => {
        state.isLoading = false
        state.isAuthenticated = true
        state.user = action.payload.user
        state.token = action.payload.accessToken
        state.error = null
      })
      .addCase(login.rejected, (state, action) => {
        state.isLoading = false
        state.isAuthenticated = false
        state.user = null
        state.token = null
        state.error = action.payload as string
      })

      // Logout. Both outcomes clear: the token is already gone from storage either
      // way, and leaving the app believing it is signed in after a failed sign-out
      // is the worse of the two states.
      .addCase(logout.fulfilled, (state) => {
        state.isAuthenticated = false
        state.user = null
        state.token = null
        state.error = null
      })
      .addCase(logout.rejected, (state) => {
        state.isAuthenticated = false
        state.user = null
        state.token = null
        state.error = null
      })

      // Check Auth
      .addCase(checkAuth.pending, (state) => {
        state.isLoading = true
      })
      .addCase(checkAuth.fulfilled, (state, action) => {
        state.isLoading = false
        state.isAuthenticated = true
        state.user = action.payload.user // FIX: Add user to state
        state.token = action.payload.accessToken
        state.error = null
      })
      .addCase(checkAuth.rejected, (state) => {
        state.isLoading = false
        state.isAuthenticated = false
        state.user = null
        state.token = null
        state.error = null
      })

      // Change Password
      .addCase(changePassword.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(changePassword.fulfilled, (state) => {
        state.isLoading = false
        state.error = null
      })
      .addCase(changePassword.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
      })
  },
})

export const { clearError, updateUser, setAuth, clearSession } = authSlice.actions
export default authSlice.reducer
