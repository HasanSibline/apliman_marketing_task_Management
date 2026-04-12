import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAppDispatch } from '@/hooks/redux'
import { updateUser } from '@/store/slices/authSlice'
import api from '@/services/api'
import toast from 'react-hot-toast'

/**
 * AuthCallback — handles Microsoft OAuth redirect.
 * Uses a ref-based lock (not module-level) to survive Strict Mode double-fire.
 * Has a 40-second timeout so it never stays stuck indefinitely.
 */
const AuthCallback: React.FC = () => {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const dispatch = useAppDispatch()
    const [status, setStatus] = useState('Connecting to Microsoft...')
    const [timedOut, setTimedOut] = useState(false)
    const hasRun = useRef(false)

    useEffect(() => {
        // Prevent double-fire in React 18 Strict Mode
        if (hasRun.current) return
        hasRun.current = true

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

        // Safety timeout — if the request hangs for 40s, tell the user and redirect
        const timeout = setTimeout(() => {
            setTimedOut(true)
            toast.error('Microsoft sync timed out. Render may be starting up — please try again in 1 minute.')
            navigate('/calendar')
        }, 40000)

        const exchangeCode = async () => {
            setStatus('Synchronizing with Microsoft...')
            try {
                await api.post('/microsoft/sync', { code }, { timeout: 35000 })
                dispatch(updateUser({ isMicrosoftSynced: true }))
                clearTimeout(timeout)
                toast.success('Microsoft Calendar connected! Meetings will appear shortly.')
                navigate('/calendar')
            } catch (err: any) {
                clearTimeout(timeout)
                const msg = err.response?.data?.message || err.message || 'Unknown error'
                console.error('[MS Callback] Sync failed:', msg)
                if (msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('invalid')) {
                    toast.error('Auth code expired or invalid. Please try syncing again.')
                } else if (err.code === 'ECONNABORTED') {
                    toast.error('Microsoft sync timed out. Please wait a moment and try again.')
                } else {
                    toast.error(`Microsoft Sync Error: ${msg}`)
                }
                navigate('/calendar')
            }
        }

        exchangeCode()

        return () => clearTimeout(timeout)
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="h-screen flex flex-col items-center justify-center bg-white">
            <div className="relative mb-10 scale-125">
                <div className="h-24 w-24 border-[12px] border-indigo-50 rounded-full" />
                {!timedOut && (
                    <div className="absolute top-0 h-24 w-24 border-[12px] border-indigo-600 rounded-full border-t-transparent animate-spin" />
                )}
                <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="h-10 w-10 text-indigo-600" viewBox="0 0 23 23" fill="currentColor">
                        <path d="M0 0h11v11H0z" fill="#f25022"/><path d="M12 0h11v11H12z" fill="#7fba00"/>
                        <path d="M0 12h11v11H0z" fill="#00a4ef"/><path d="M12 12h11v11H12z" fill="#ffb900"/>
                    </svg>
                </div>
            </div>
            <div className="text-center">
                <h2 className="text-3xl font-black text-gray-900 tracking-tight">{status}</h2>
                <p className="mt-3 text-gray-400 font-bold uppercase tracking-[0.3em] text-[10px] animate-pulse">
                    {timedOut ? 'Redirecting...' : 'Azure Active Directory Handshake'}
                </p>
            </div>
        </div>
    )
}

export default AuthCallback
