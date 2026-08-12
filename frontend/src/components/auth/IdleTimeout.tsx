import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { logout, clearSession } from '@/store/slices/authSlice'
import { useNavigate } from 'react-router-dom'
import { companyLoginPath } from '@/lib/companyLogin'
import ActionModal from '@/components/ui/ActionModal'

/**
 * Sign someone out after a long enough silence, having warned them first.
 *
 * The token lasts a week, which is right for not making people sign in every morning
 * and wrong for a shared or unattended screen: a session left open on a laptop stays
 * open for seven days, and everything it reaches is reachable by whoever sits down
 * next. This closes that window without shortening the token, so coming back tomorrow
 * still works and walking away for an hour does not.
 *
 * Four things this gets right that the obvious version does not.
 *
 * Activity is shared between tabs through storage, not counted per tab. Idleness is
 * per tab but signing out is global, so a forgotten background tab would otherwise
 * end the session of someone actively working in another one.
 *
 * Dismissing the warning keeps you signed in. Escape, the backdrop and the close
 * button are what people press reflexively, and wiring the destructive path to the
 * reflex is how an app loses someone's work.
 *
 * Signing out happens once. Driven from an interval with no guard, a slow or failing
 * sign-out re-fired every second, and with no reducer for a rejected logout the app
 * still believed it was signed in, so it dispatched and navigated once a second
 * forever.
 *
 * And a session ended in another tab ends here, in state and not only in the address
 * bar: navigating while the store still says signed in just bounces back to the
 * dashboard with no token, where everything 401s.
 */

/** Long enough not to interrupt reading, short enough to matter on a shared screen. */
const IDLE_LIMIT_MS = 30 * 60_000
/** How long the warning stands before it acts. */
const WARN_BEFORE_MS = 60_000
const TICK_MS = 1_000

/** Shared so any tab's activity counts for all of them. */
const LAST_ACTIVE_KEY = 'aura-last-active'
/** Writing on every event would hit storage constantly; a few seconds is plenty. */
const WRITE_EVERY_MS = 5_000

const ACTIVITY = ['mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'] as const

function readLastActive(): number {
  try {
    const raw = Number(localStorage.getItem(LAST_ACTIVE_KEY))
    return Number.isFinite(raw) && raw > 0 ? raw : Date.now()
  } catch {
    return Date.now()
  }
}

function writeLastActive(at: number): void {
  try {
    localStorage.setItem(LAST_ACTIVE_KEY, String(at))
  } catch {
    /* private mode; the in-memory value still works for this tab */
  }
}

const IdleTimeout: React.FC = () => {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { isAuthenticated, user } = useAppSelector((s) => s.auth)

  const lastActive = useRef(Date.now())
  const lastWrite = useRef(0)
  const ending = useRef(false)
  const [warning, setWarning] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(Math.round(WARN_BEFORE_MS / 1000))

  /** A system administrator belongs to no company, so it has no branded page. */
  const signInPath = user?.role === 'SUPER_ADMIN' ? '/admin/login' : companyLoginPath()

  const markActive = useCallback(() => {
    const now = Date.now()
    lastActive.current = now
    if (now - lastWrite.current > WRITE_EVERY_MS) {
      lastWrite.current = now
      writeLastActive(now)
    }
  }, [])

  const staySignedIn = useCallback(() => {
    setWarning(false)
    markActive()
    writeLastActive(Date.now())
  }, [markActive])

  const endSession = useCallback(async () => {
    if (ending.current) return
    ending.current = true
    setWarning(false)

    // Cleared locally first, so the app stops believing it is signed in even if the
    // request to end the session never lands.
    dispatch(clearSession())
    try {
      await dispatch(logout())
    } finally {
      navigate(signInPath, { replace: true })
    }
  }, [dispatch, navigate, signInPath])

  useEffect(() => {
    if (!isAuthenticated) {
      ending.current = false
      return
    }

    lastActive.current = readLastActive()

    const touch = () => {
      // While the warning is up only the button counts, or someone walking past the
      // desk cancels it with a stray movement.
      if (!warning) markActive()
    }

    for (const event of ACTIVITY) {
      window.addEventListener(event, touch, { passive: true })
    }

    const tick = setInterval(() => {
      // Another tab may be in use, and its timestamp is the one that matters.
      const shared = readLastActive()
      const seenAt = Math.max(lastActive.current, shared)
      lastActive.current = seenAt

      const untilLogout = IDLE_LIMIT_MS - (Date.now() - seenAt)

      if (untilLogout <= 0) {
        endSession()
        return
      }

      if (untilLogout <= WARN_BEFORE_MS) {
        setWarning(true)
        setSecondsLeft(Math.max(0, Math.ceil(untilLogout / 1000)))
      } else if (warning) {
        setWarning(false)
      }
    }, TICK_MS)

    return () => {
      for (const event of ACTIVITY) window.removeEventListener(event, touch)
      clearInterval(tick)
    }
  }, [isAuthenticated, warning, endSession, markActive])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'token' && e.newValue === null && isAuthenticated) {
        dispatch(clearSession())
        navigate(signInPath, { replace: true })
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [isAuthenticated, navigate, dispatch, signInPath])

  if (!isAuthenticated) return null

  return (
    <ActionModal
      isOpen={warning}
      title="Still there?"
      description={`You have been idle for a while. To keep your account safe we will sign you out in ${secondsLeft} ${
        secondsLeft === 1 ? 'second' : 'seconds'
      }. Anything unsaved will be lost.`}
      confirmText="Stay signed in"
      cancelText="Sign out now"
      variant="warning"
      onConfirm={staySignedIn}
      // The cancel button genuinely signs out, because someone stepping away wants
      // that. Escape, the backdrop and the X do not: those are reflexes, and the
      // reflex must never be the destructive path. Doing nothing still ends it.
      onClose={endSession}
      onDismiss={staySignedIn}
    />
  )
}

export default IdleTimeout
