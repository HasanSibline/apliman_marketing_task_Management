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
  socket = io(socketUrl, {
    auth: {
      token,
    },
    transports: ['websocket', 'polling'],
  })

  // Socket event listeners
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

  return socket
}

export const updateUserStatus = (status: 'ACTIVE' | 'AWAY' | 'OFFLINE') => {
  if (socket && socket.connected) {
    socket.emit('update-status', { status })
  }
}

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}

export const getSocket = () => socket
