import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface TimeTrackingState {
  activeTaskId: string | null
  startTime: number | null
  elapsedTime: number
  isRunning: boolean
}

const initialState: TimeTrackingState = {
  activeTaskId: null,
  startTime: null,
  elapsedTime: 0,
  isRunning: false,
}

// Load from localStorage if available
const loadFromStorage = (): TimeTrackingState => {
  try {
    const stored = localStorage.getItem('timeTracking')
    if (stored) {
      const data = JSON.parse(stored)
      // If timer was running, calculate elapsed time since last save
      if (data.isRunning && data.startTime) {
        const now = Date.now()
        const additionalTime = Math.floor((now - data.startTime) / 1000)
        return {
          ...data,
          elapsedTime: data.elapsedTime + additionalTime,
          startTime: now,
        }
      }
      return data
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
      state.activeTaskId = action.payload
      state.startTime = Date.now()
      state.isRunning = true
      saveToStorage(state)
    },
    pauseTimer: (state) => {
      if (state.startTime) {
        const elapsed = Math.floor((Date.now() - state.startTime) / 1000)
        state.elapsedTime += elapsed
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
      state.activeTaskId = null
      state.startTime = null
      state.elapsedTime = 0
      state.isRunning = false
      saveToStorage(state)
    },
    updateElapsedTime: (state, action: PayloadAction<number>) => {
      state.elapsedTime = action.payload
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

export const { startTimer, pauseTimer, resumeTimer, stopTimer, updateElapsedTime } = timeTrackingSlice.actions
export default timeTrackingSlice.reducer

