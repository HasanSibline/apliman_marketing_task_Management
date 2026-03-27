import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface TimeTrackingState {
  activeTaskId: string | null
  startTime: number | null
  isRunning: boolean
  taskTimes: Record<string, number> // Map of taskId -> seconds
}

const initialState: TimeTrackingState = {
  activeTaskId: null,
  startTime: null,
  isRunning: false,
  taskTimes: {},
}

// Load from localStorage if available
const loadFromStorage = (): TimeTrackingState => {
  try {
    const stored = localStorage.getItem('timeTracking')
    if (stored) {
      const data = JSON.parse(stored)
      
      // Ensure essential fields exist, merge with initialState for robustness
      const state = {
        ...initialState,
        ...data,
        taskTimes: data.taskTimes || {}
      }

      // If timer was running, calculate elapsed time since last save for the active task
      if (state.isRunning && state.activeTaskId && state.startTime) {
        const now = Date.now()
        const additionalTime = Math.floor((now - state.startTime) / 1000)
        const currentElapsed = state.taskTimes[state.activeTaskId] || 0
        
        return {
          ...state,
          taskTimes: {
            ...state.taskTimes,
            [state.activeTaskId]: currentElapsed + additionalTime
          },
          startTime: now,
        }
      }
      return state
    }
  } catch (error) {
    console.error('Failed to load time tracking from storage:', error)
  }
  return initialState
}

const timeTrackingSlice = createSlice({
  name: 'timeTracking',
  initialState: loadFromStorage(),
  reducers: {
    startTimer: (state, action: PayloadAction<string>) => {
      // If another task was running, pause it first
      if (state.isRunning && state.activeTaskId && state.activeTaskId !== action.payload) {
        if (state.startTime) {
          const elapsed = Math.floor((Date.now() - state.startTime) / 1000)
          state.taskTimes[state.activeTaskId] = (state.taskTimes[state.activeTaskId] || 0) + elapsed
        }
      }

      state.activeTaskId = action.payload
      state.startTime = Date.now()
      state.isRunning = true
      saveToStorage(state)
    },
    pauseTimer: (state) => {
      if (state.startTime && state.activeTaskId) {
        const elapsed = Math.floor((Date.now() - state.startTime) / 1000)
        state.taskTimes[state.activeTaskId] = (state.taskTimes[state.activeTaskId] || 0) + elapsed
      }
      state.startTime = null
      state.isRunning = false
      saveToStorage(state)
    },
    resumeTimer: (state) => {
      state.startTime = Date.now()
      state.isRunning = true
      saveToStorage(state)
    },
    stopTimer: (state) => {
      if (state.startTime && state.isRunning && state.activeTaskId) {
        const elapsed = Math.floor((Date.now() - state.startTime) / 1000)
        state.taskTimes[state.activeTaskId] = (state.taskTimes[state.activeTaskId] || 0) + elapsed
      }
      state.startTime = null
      state.isRunning = false
      saveToStorage(state)
    },
    updateElapsedTime: (state, action: PayloadAction<{ taskId: string; seconds: number }>) => {
      state.taskTimes[action.payload.taskId] = action.payload.seconds
      saveToStorage(state)
    },
    resetTimer: (state, action: PayloadAction<string | undefined>) => {
      if (action.payload) {
        // Reset specific task
        state.taskTimes[action.payload] = 0
        if (state.activeTaskId === action.payload) {
          state.startTime = null
          state.isRunning = false
          state.activeTaskId = null
        }
      } else {
        // Full reset
        state.activeTaskId = null
        state.startTime = null
        state.isRunning = false
        state.taskTimes = {}
      }
      saveToStorage(state)
    },
  },
})

const saveToStorage = (state: TimeTrackingState) => {
  try {
    localStorage.setItem('timeTracking', JSON.stringify(state))
  } catch (error) {
    console.error('Failed to save time tracking to storage:', error)
  }
}

export const { startTimer, pauseTimer, resumeTimer, stopTimer, updateElapsedTime, resetTimer } = timeTrackingSlice.actions
export default timeTrackingSlice.reducer

