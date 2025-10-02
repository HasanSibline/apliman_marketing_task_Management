import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'

interface TeamMember {
  id: string
  name: string
  email: string
  role: string
  status: 'ACTIVE' | 'AWAY' | 'OFFLINE'
  isOnline: boolean
  lastSeen: string
}

interface PresenceState {
  isConnected: boolean
  teamMembers: TeamMember[]
  currentUserStatus: 'ACTIVE' | 'AWAY' | 'OFFLINE'
  error: string | null
}

const initialState: PresenceState = {
  isConnected: false,
  teamMembers: [],
  currentUserStatus: 'OFFLINE',
  error: null,
}

// Async thunks
export const initializeSocket = createAsyncThunk(
  'presence/initializeSocket',
  async (_, { rejectWithValue }) => {
    try {
      await import('@/services/socket').then(m => m.initializeSocket())
      return true
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to initialize socket')
    }
  }
)

export const updateUserStatus = createAsyncThunk(
  'presence/updateUserStatus',
  async (status: 'ACTIVE' | 'AWAY' | 'OFFLINE', { rejectWithValue }) => {
    try {
      const { updateUserStatus } = await import('@/services/socket')
      updateUserStatus(status)
      return status
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to update status')
    }
  }
)

export const disconnectSocket = createAsyncThunk(
  'presence/disconnectSocket',
  async () => {
    const { disconnectSocket } = await import('@/services/socket')
    disconnectSocket()
    return null
  }
)

const presenceSlice = createSlice({
  name: 'presence',
  initialState,
  reducers: {
    setConnected: (state, action: PayloadAction<boolean>) => {
      state.isConnected = action.payload
    },
    setCurrentUserStatus: (state, action: PayloadAction<'ACTIVE' | 'AWAY' | 'OFFLINE'>) => {
      state.currentUserStatus = action.payload
    },
    setTeamMembers: (state, action: PayloadAction<TeamMember[]>) => {
      state.teamMembers = action.payload
    },
    addTeamMember: (state, action: PayloadAction<TeamMember>) => {
      const existingIndex = state.teamMembers.findIndex(member => member.id === action.payload.id)
      if (existingIndex !== -1) {
        state.teamMembers[existingIndex] = action.payload
      } else {
        state.teamMembers.push(action.payload)
      }
    },
    removeTeamMember: (state, action: PayloadAction<string>) => {
      const index = state.teamMembers.findIndex(member => member.id === action.payload)
      if (index !== -1) {
        state.teamMembers[index].isOnline = false
        state.teamMembers[index].status = 'OFFLINE'
      }
    },
    updateTeamMemberStatus: (state, action: PayloadAction<{ userId: string; status: string; isOnline: boolean }>) => {
      const index = state.teamMembers.findIndex(member => member.id === action.payload.userId)
      if (index !== -1) {
        state.teamMembers[index].status = action.payload.status as 'ACTIVE' | 'AWAY' | 'OFFLINE'
        state.teamMembers[index].isOnline = action.payload.isOnline
        state.teamMembers[index].lastSeen = new Date().toISOString()
      }
    },
    setError: (state, action: PayloadAction<string>) => {
      state.error = action.payload
    },
    clearError: (state) => {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      // Initialize Socket
      .addCase(initializeSocket.fulfilled, (state) => {
        state.error = null
      })
      .addCase(initializeSocket.rejected, (state, action) => {
        state.error = action.payload as string
      })

      // Update User Status
      .addCase(updateUserStatus.fulfilled, (state, action) => {
        state.currentUserStatus = action.payload
      })
      .addCase(updateUserStatus.rejected, (state, action) => {
        state.error = action.payload as string
      })

      // Disconnect Socket
      .addCase(disconnectSocket.fulfilled, (state) => {
        state.isConnected = false
        state.currentUserStatus = 'OFFLINE'
        state.teamMembers = []
      })
  },
})

export const {
  setConnected,
  setCurrentUserStatus,
  setTeamMembers,
  addTeamMember,
  removeTeamMember,
  updateTeamMemberStatus,
  setError,
  clearError,
} = presenceSlice.actions

export default presenceSlice.reducer