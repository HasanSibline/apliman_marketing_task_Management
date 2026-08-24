import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAppDispatch } from '@/hooks/redux'
import { updateUser } from '@/store/slices/authSlice'
import api from '@/services/api'
import toast from 'react-hot-toast'

/**
 * AuthCallback, handles Microsoft OAuth redirect.
 *
 * Lock strategy: sessionStorage keyed to the first 20 chars of the OAuth code.
 * - Survives component remounts caused by App.tsx checkAuth re-renders (unlike useRef)
 * - Unique per code value (unlike a generic boolean flag)
 * - Cleared automatically when the browser tab closes (unlike localStorage)
 *
 * If the code was already redeemed successfully (AADSTS54005), we treat that as
 * a success and navigate to the calendar, the first attempt worked.
 */
const AuthCallback: React.FC = () => {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const dispatch = useAppDispatch()
    const [status, setStatus] = useState('Connecting to Microsoft...')
    const [timedOut, setTimedOut] = useState(false)

    useEffect(() => {
        const code = searchParams.get('code')
        const error = searchParams.get('error')

        if (error) {
            toast.error(`Microsoft Auth Error: ${error}`)
            navigate('/calendar')
            return
        }

        if (!code) {
            toast.error('No authorization code received from Microsoft.')
            navigate('/calendar')
            return
        }

        /**
         * Deduplicate: if this exact code was already exchanged in this tab session, skip.
         *
         * The lock is released again when the exchange fails. It used to be written
         * here and never removed on any path, so a code that failed stayed marked as
         * done: pressing back, or reloading the callback URL, took the branch above
         * and went straight to the calendar as though the connection had been made.
         * A failure that renders as a success is the one outcome this screen must not
         * produce, because the user then has no reason to try again and no idea that
         * anything went wrong.
         */
        const lockKey = `ms_sync_${code.substring(0, 20)}`
        if (sessionStorage.getItem(lockKey)) {
            navigate('/calendar')
            return
        }
        sessionStorage.setItem(lockKey, '1')

        /**
         * Nothing may write state or navigate once this page is gone.
         *
         * Under StrictMode the effect runs twice: the first run takes the lock and
         * fires the request, the second sees the lock and navigates away immediately.
         * The first request then resolved into an unmounted component and fired its
         * own `navigate('/calendar')`, pulling the user off whatever page they had
         * reached in the meantime.
         */
        let live = true

        // Safety timeout, prevents stuck screen if Render is cold-starting.
        // The lock goes too: a timeout is not a connection.
        const timeout = setTimeout(() => {
            sessionStorage.removeItem(lockKey)
            if (!live) return
            setTimedOut(true)
            toast.error('Microsoft sync timed out. Render may be cold-starting, please try again.')
            navigate('/calendar')
        }, 40000)

        const exchangeCode = async () => {
            setStatus('Synchronizing with Microsoft...')
            try {
                await api.post('/microsoft/sync', { code }, { timeout: 35000 })
                clearTimeout(timeout)
                if (!live) return
                dispatch(updateUser({ isMicrosoftSynced: true }))
                toast.success('Microsoft Calendar connected! Meetings will appear shortly.')
                navigate('/calendar')
            } catch (err: any) {
                clearTimeout(timeout)
                const msg = err.response?.data?.message || err.message || 'Unknown error'
                console.error('[MS Callback] Sync failed:', msg)

                // AADSTS54005 = code already redeemed = first attempt succeeded
                if (msg.includes('54005') || msg.toLowerCase().includes('already redeemed')) {
                    if (!live) return
                    dispatch(updateUser({ isMicrosoftSynced: true }))
                    navigate('/calendar')
                    return
                }

                // Released, so that retrying this URL genuinely retries rather than
                // short-circuiting to a calendar that was never connected.
                sessionStorage.removeItem(lockKey)

                if (!live) return

                if (err.code === 'ECONNABORTED') {
                    toast.error('Microsoft sync timed out. Please wait a moment and try again.')
                } else {
                    toast.error(`Microsoft Sync Error: ${msg}`)
                }
                navigate('/calendar')
            }
        }

        exchangeCode()

        return () => {
            live = false
            clearTimeout(timeout)
        }
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="h-screen flex flex-col items-center justify-center bg-white dark:bg-gray-800">
            <div className="relative mb-10 scale-125">
                <div className="h-24 w-24 border-[12px] border-indigo-50 dark:border-indigo-900/40 rounded-full" />
                {!timedOut && (
                    <div className="absolute top-0 h-24 w-24 border-[12px] border-indigo-600 rounded-full border-t-transparent animate-spin" />
                )}
                <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="h-10 w-10" viewBox="0 0 23 23" fill="currentColor">
                        <path d="M0 0h11v11H0z" fill="#f25022"/>
                        <path d="M12 0h11v11H12z" fill="#7fba00"/>
                        <path d="M0 12h11v11H0z" fill="#00a4ef"/>
                        <path d="M12 12h11v11H12z" fill="#ffb900"/>
                    </svg>
                </div>
            </div>
            <div className="text-center">
                <h2 className="text-3xl font-semibold text-gray-900 dark:text-white tracking-tight">{status}</h2>
                <p className="mt-3 text-gray-500 dark:text-gray-400 font-bold uppercase tracking-[0.3em] text-xs animate-pulse">
                    {timedOut ? 'Redirecting...' : 'Azure Active Directory Handshake'}
                </p>
            </div>
        </div>
    )
}

export default AuthCallback
