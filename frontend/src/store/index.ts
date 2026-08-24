import { configureStore } from '@reduxjs/toolkit'
import { persistStore, persistReducer } from 'redux-persist'
import storage from 'redux-persist/lib/storage'
import { combineReducers } from '@reduxjs/toolkit'

// Slices
import authSlice from './slices/authSlice'
import tasksSlice from './slices/tasksSlice'
import usersSlice from './slices/usersSlice'
import analyticsSlice from './slices/analyticsSlice'
import presenceSlice from './slices/presenceSlice'
import uiSlice from './slices/uiSlice'
import timeTrackingSlice, { restoreTimeTracking } from './slices/timeTrackingSlice'

const persistConfig = {
  key: 'root',
  storage,
  whitelist: ['auth'], // Only persist auth state - timeTracking uses its own localStorage
}

const appReducer = combineReducers({
  auth: authSlice,
  tasks: tasksSlice,
  users: usersSlice,
  analytics: analyticsSlice,
  presence: presenceSlice,
  ui: uiSlice,
  timeTracking: timeTrackingSlice,
})

/**
 * A session ending empties the store, not just the auth slice.
 *
 * Only `auth` was cleared before. Everything else survived: the task list, the user
 * directory, the analytics dashboards, the presence roster. On a shared machine the
 * next person to sign in saw the previous tenant's data on screen for as long as their
 * own first fetch took, and on any screen that renders from the store without
 * refetching, indefinitely. This is a multi-tenant app; that is not a cosmetic flicker.
 *
 * Reset on the way in as well as the way out, so a session that begins without a
 * sign-out having happened first (a token swapped underneath us, a restore that
 * rejected) still starts from nothing.
 */
const SESSION_BOUNDARY = new Set([
  'auth/logout/fulfilled',
  'auth/logout/rejected',
  'auth/clearSession',
  'auth/checkAuth/rejected',
  'auth/login/fulfilled',
])

const rootReducer: typeof appReducer = (state, action) => {
  // `undefined`, so every slice rebuilds from its own initial state. redux-persist
  // strips and restores its own bookkeeping key around this call, so there is nothing
  // here to preserve by hand.
  if (SESSION_BOUNDARY.has(action.type)) {
    return appReducer(undefined, action)
  }
  return appReducer(state, action)
}

const persistedReducer = persistReducer(persistConfig, rootReducer)

export const store = configureStore({
  reducer: persistedReducer,
  // timeTracking keeps its own localStorage copy rather than going through
  // redux-persist, so it is seeded here. Cast because the persisted reducer's state
  // type is not a plain combined one, which is what makes preloadedState partial.
  preloadedState: { timeTracking: restoreTimeTracking() } as any,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
      },
    }),
  devTools: process.env.NODE_ENV !== 'production',
})

export const persistor = persistStore(store)

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
