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

/**
 * One presence connection per tab, alive for exactly as long as a session is.
 *
 * Three things this now gets right that the previous version did not.
 *
 * It is idempotent. Every call used to build a fresh connection and drop the old one
 * on the floor still connected, with its listeners still dispatching. The caller runs
 * from an effect keyed on the signed-in user, so anything that replaced that object
 * (saving a profile, a token refresh, StrictMode's double mount in development) opened
 * another socket: the server counted one person as several and every presence event
 * arrived once per leaked connection.
 *
 * It presents the token that is current, not the one it was born with. The token is
 * reissued on every load and the old one expires; captured once in the handshake, a
 * socket reconnects happily until that moment and then never again, with nothing on
 * screen to say presence has stopped working.
 *
 * And it can be torn down. Nothing disconnected it before, so signing out left a
 * connection authenticated as the previous user streaming their company's team roster
 * into a store the next person to sign in on that browser would share.
 */

let socket: Socket | null = null

/**
 * The gateway answers a token it cannot verify by closing the connection itself, and
 * socket.io deliberately never retries that: a server-initiated close is taken as
 * final. That is right for a refusal and wrong for the ordinary case of a token that
 * simply aged out while the tab sat open, so a few attempts are made by hand, each one
 * re-reading storage. Bounded, because if the fresh token is refused too then the
 * answer is not going to change and retrying forever only hammers the gateway.
 */
const MAX_REAUTH_ATTEMPTS = 3
const REAUTH_DELAY_MS = 5_000

let reauthAttempts = 0
let reauthTimer: ReturnType<typeof setTimeout> | null = null

const readToken = () => localStorage.getItem('token')

const cancelReauth = () => {
  if (reauthTimer) {
    clearTimeout(reauthTimer)
    reauthTimer = null
  }
}

export const initializeSocket = () => {
  const token = readToken()
  if (!token) {
    throw new Error('No authentication token')
  }

  // Already have one: make sure it is trying, and hand back the same instance.
  if (socket) {
    if (!socket.connected) socket.connect()
    return socket
  }

  const socketUrl = (import.meta as any).env.VITE_SOCKET_URL || 'http://localhost:3001'
  const s = io(`${socketUrl}/presence`, {
    // A callback, not an object: socket.io calls it before every connection attempt,
    // so each reconnect carries whatever token storage holds at that moment.
    auth: (cb) => cb({ token: readToken() ?? '' }),
    transports: ['websocket', 'polling'],
  })
  socket = s

  /**
   * Guards every handler below.
   *
   * A socket that has been replaced or disconnected must not keep writing presence
   * for a session that has ended, and a close can deliver one last event after the
   * teardown has already run.
   */
  const current = () => socket === s

  // ── Presence events ──
  s.on('connect', () => {
    reauthAttempts = 0
    cancelReauth()
    if (!current()) return
    store.dispatch(setConnected(true))
    store.dispatch(setCurrentUserStatus('ACTIVE'))
  })

  s.on('disconnect', (reason) => {
    if (!current()) return
    store.dispatch(setConnected(false))
    store.dispatch(setCurrentUserStatus('OFFLINE'))

    // Everything else (a Render restart, a dropped transport, a ping timeout) is
    // already retried by socket.io's own backoff, and now reconnects with a fresh
    // token because of the callback above. Only the gateway's own refusal needs
    // help, and only a few times.
    if (reason === 'io server disconnect' && reauthAttempts < MAX_REAUTH_ATTEMPTS && readToken()) {
      reauthAttempts += 1
      cancelReauth()
      reauthTimer = setTimeout(() => {
        reauthTimer = null
        if (current()) s.connect()
      }, REAUTH_DELAY_MS)
    }
  })

  s.on('user-status-updated', (data: { userId: string; status: string; isOnline: boolean }) => {
    if (current()) store.dispatch(updateTeamMemberStatus(data))
  })

  s.on('team-members', (members: any[]) => {
    if (current()) store.dispatch(setTeamMembers(members))
  })

  s.on('user-joined', (member: any) => {
    if (current()) store.dispatch(addTeamMember(member))
  })

  s.on('user-left', (userId: string) => {
    if (current()) store.dispatch(removeTeamMember(userId))
  })

  s.on('connect_error', (error) => {
    if (current()) store.dispatch(setError(error.message))
  })

  // ── Microsoft meeting real-time push events ──
  // The backend's PresenceGateway.sendNotificationToUser() emits 'notification' events.
  s.on('notification', (payload: any) => {
    if (!current()) return
    if (payload?.type === 'MICROSOFT_STATUS_CHANGE') {
      // Signal the calendar to immediately re-fetch and update meeting statuses
      window.dispatchEvent(new CustomEvent('ws:ms_status_change', { detail: payload }))
    }
    // Always emit generic notification so NotificationBell can instantly refresh
    window.dispatchEvent(new CustomEvent('ws:notification', { detail: payload }))
  })

  return s
}

export const updateUserStatus = (status: 'ACTIVE' | 'AWAY' | 'OFFLINE') => {
  if (socket && socket.connected) {
    socket.emit('presence:set_status', { status })
  }
}

export const disconnectSocket = () => {
  cancelReauth()
  reauthAttempts = 0

  const s = socket
  socket = null
  if (!s) return

  // Listeners off before the close. Otherwise the teardown's own 'disconnect' fires
  // handlers belonging to the session being ended; the state those handlers would
  // have written is set here instead, once and deliberately.
  s.removeAllListeners()
  s.disconnect()

  store.dispatch(setConnected(false))
  store.dispatch(setCurrentUserStatus('OFFLINE'))
}

export const getSocket = () => socket
