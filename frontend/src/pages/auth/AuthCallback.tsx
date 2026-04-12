import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAppDispatch } from '@/hooks/redux'
import { updateUser } from '@/store/slices/authSlice'
import api from '@/services/api'
import toast from 'react-hot-toast'

/**
 * AuthCallback - Enhanced to prevent the "Code Expired" error.
 * Uses a strict module-level lock to ensure only one code exchange occurs.
 */
let isProcessingSync = false;

const AuthCallback: React.FC = () => {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const dispatch = useAppDispatch()
    const [status, setStatus] = useState('Connecting to Microsoft...')

    useEffect(() => {
        const code = searchParams.get('code')
        const error = searchParams.get('error')

        if (error) {
            toast.error(`Authentication Error: ${error}`)
            navigate('/calendar')
            return
        }

        if (!code) {
            // No code, maybe just arriving here by mistake
            return
        }

        // Strict lock to prevent React 18 Strict Mode double-fire (which causes Code Expired)
        if (isProcessingSync) return
        isProcessingSync = true

        const exchangeCode = async () => {
            setStatus('Synchronizing Workspace...')
            try {
                // Exchange the single-use code for access/refresh tokens
                await api.post('/microsoft/sync', { code })
                
                // Update local auth state so UI reflects sync status
                dispatch(updateUser({ isMicrosoftSynced: true }))
                
                toast.success('Microsoft Integration Active!')
                navigate('/calendar')
            } catch (err: any) {
                const msg = err.response?.data?.message || err.message
                if (msg.includes('expired')) {
                    // This happens if the user refreshes the page or the code was double-sent
                    toast.error('Sync link expired. Please go back and try again.')
                } else {
                    toast.error(`Microsoft Sync Error: ${msg}`)
                }
                navigate('/calendar')
            } finally {
                isProcessingSync = false
            }
        }

        exchangeCode()
    }, [searchParams, navigate, dispatch])

    return (
        <div className="h-screen flex flex-col items-center justify-center bg-white">
            <div className="relative mb-10 scale-125">
                <div className="h-24 w-24 border-[12px] border-indigo-50 rounded-full" />
                <div className="absolute top-0 h-24 w-24 border-[12px] border-indigo-600 rounded-full border-t-transparent animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="h-10 w-10 text-indigo-600" viewBox="0 0 23 23" fill="currentColor">
                        <path d="M0 0h11v11H0z" fill="#f25022"/><path d="M12 0h11v11H12z" fill="#7fba00"/><path d="M0 12h11v11H0z" fill="#00a4ef"/><path d="M12 12h11v11H12z" fill="#ffb900"/>
                    </svg>
                </div>
            </div>
            <div className="text-center">
                <h2 className="text-3xl font-black text-gray-900 tracking-tight">{status}</h2>
                <p className="mt-3 text-gray-400 font-bold uppercase tracking-[0.3em] text-[10px] animate-pulse">Azure Active Directory Handshake</p>
            </div>
        </div>
    )
}

export default AuthCallback
