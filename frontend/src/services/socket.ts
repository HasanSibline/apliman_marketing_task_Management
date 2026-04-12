import { io, Socket } from 'socket.io-client'
import { store } from '@/store'
import {
  setConnected,
  setCurrentUserStatus,
  updateTeamMemberStatus,
  setTeamMembers,
  addTeamMember,
  removeTeamMember,
  setError,
} from '@/store/slices/presenceSlice'

let socket: Socket | null = null

export const initializeSocket = () => {
  const token = localStorage.getItem('token')
  if (!token) {
    throw new Error('No authentication token')
  }

  const socketUrl = (import.meta as any).env.VITE_SOCKET_URL || 'http://localhost:3001'
  socket = io(`${socketUrl}/presence`, {
    auth: { token },
    transports: ['websocket', 'polling'],
  })

  // ── Presence events ──
  socket.on('connect', () => {
    store.dispatch(setConnected(true))
    store.dispatch(setCurrentUserStatus('ACTIVE'))
  })

  socket.on('disconnect', () => {
    store.dispatch(setConnected(false))
    store.dispatch(setCurrentUserStatus('OFFLINE'))
  })

  socket.on('user-status-updated', (data: { userId: string; status: string; isOnline: boolean }) => {
    store.dispatch(updateTeamMemberStatus(data))
  })

  socket.on('team-members', (members: any[]) => {
    store.dispatch(setTeamMembers(members))
  })

  socket.on('user-joined', (member: any) => {
    store.dispatch(addTeamMember(member))
  })

  socket.on('user-left', (userId: string) => {
    store.dispatch(removeTeamMember(userId))
  })

  socket.on('connect_error', (error) => {
    store.dispatch(setError(error.message))
  })

  // ── Microsoft meeting real-time push events ──
  // The backend's PresenceGateway.sendNotificationToUser() emits 'notification' events.
  socket.on('notification', (payload: any) => {
    if (payload?.type === 'MICROSOFT_STATUS_CHANGE') {
      // Signal the calendar to immediately re-fetch and update meeting statuses
      window.dispatchEvent(new CustomEvent('ws:ms_status_change', { detail: payload }))
    }
    // Always emit generic notification so NotificationBell can instantly refresh
    window.dispatchEvent(new CustomEvent('ws:notification', { detail: payload }))
  })

  return socket
}

export const updateUserStatus = (status: 'ACTIVE' | 'AWAY' | 'OFFLINE') => {
  if (socket && socket.connected) {
    socket.emit('presence:set_status', { status })
  }
}

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}

export const getSocket = () => socket
