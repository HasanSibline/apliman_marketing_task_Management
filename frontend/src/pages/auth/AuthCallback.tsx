import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAppDispatch } from '@/hooks/redux'
import { updateUser } from '@/store/slices/authSlice'
import api from '@/services/api'
import toast from 'react-hot-toast'

/**
 * AuthCallback — handles Microsoft OAuth redirect.
 *
 * Lock strategy: sessionStorage keyed to the first 20 chars of the OAuth code.
 * - Survives component remounts caused by App.tsx checkAuth re-renders (unlike useRef)
 * - Unique per code value (unlike a generic boolean flag)
 * - Cleared automatically when the browser tab closes (unlike localStorage)
 *
 * If the code was already redeemed successfully (AADSTS54005), we treat that as
 * a success and navigate to the calendar — the first attempt worked.
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

        // Deduplicate: if this exact code was already exchanged in this tab session, skip
        const lockKey = `ms_sync_${code.substring(0, 20)}`
        if (sessionStorage.getItem(lockKey)) {
            navigate('/calendar')
            return
        }
        sessionStorage.setItem(lockKey, '1')

        // Safety timeout — prevents stuck screen if Render is cold-starting
        const timeout = setTimeout(() => {
            setTimedOut(true)
            toast.error('Microsoft sync timed out. Render may be cold-starting — please try again.')
            navigate('/calendar')
        }, 40000)

        const exchangeCode = async () => {
            setStatus('Synchronizing with Microsoft...')
            try {
                await api.post('/microsoft/sync', { code }, { timeout: 35000 })
                clearTimeout(timeout)
                dispatch(updateUser({ isMicrosoftSynced: true }))
                toast.success('Microsoft Calendar connected! Meetings will appear shortly.')
                navigate('/calendar')
            } catch (err: any) {
                clearTimeout(timeout)
                const msg = err.response?.data?.message || err.message || 'Unknown error'
                console.error('[MS Callback] Sync failed:', msg)

                // AADSTS54005 = code already redeemed = first attempt succeeded
                if (msg.includes('54005') || msg.toLowerCase().includes('already redeemed')) {
                    dispatch(updateUser({ isMicrosoftSynced: true }))
                    navigate('/calendar')
                    return
                }

                if (err.code === 'ECONNABORTED') {
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
                    <svg className="h-10 w-10" viewBox="0 0 23 23" fill="currentColor">
                        <path d="M0 0h11v11H0z" fill="#f25022"/>
                        <path d="M12 0h11v11H12z" fill="#7fba00"/>
                        <path d="M0 12h11v11H0z" fill="#00a4ef"/>
                        <path d="M12 12h11v11H12z" fill="#ffb900"/>
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
