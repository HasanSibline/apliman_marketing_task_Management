import React, { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAppDispatch } from '@/hooks/redux'
import { updateUser } from '@/store/slices/authSlice'
import api from '@/services/api'
import toast from 'react-hot-toast'

/**
 * AuthCallback - Rebuilt from scratch to ensure robust token exchange.
 * Handled with a ref to prevent double-fetching in React 18 Strict Mode.
 */
const AuthCallback: React.FC = () => {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const dispatch = useAppDispatch()
    const hasFetched = useRef(false)

    useEffect(() => {
        const handleCallback = async () => {
            if (hasFetched.current) return
            
            const code = searchParams.get('code')
            if (!code) {
                toast.error('Sync failed: No authorization code returned.')
                navigate('/calendar')
                return
            }

            hasFetched.current = true

            try {
                // Exchange the authorization code for tokens on the backend
                await api.post('/microsoft/sync', { code })
                
                // Update the Redux store so the UI reacts immediately
                dispatch(updateUser({ isMicrosoftSynced: true }))
                
                toast.success('Microsoft Workspace Synced Successfully!')
                navigate('/calendar')
            } catch (error: any) {
                console.error('MS Authentication Error:', error)
                toast.error(error.response?.data?.message || 'Failed to authenticate with Microsoft')
                navigate('/calendar')
            }
        }

        handleCallback()
    }, [searchParams, navigate, dispatch])

    return (
        <div className="h-screen flex items-center justify-center bg-white">
            <div className="flex flex-col items-center space-y-6">
                <div className="relative">
                    <div className="h-20 w-20 border-8 border-indigo-50 rounded-full" />
                    <div className="absolute top-0 h-20 w-20 border-8 border-indigo-600 rounded-full border-t-transparent animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <svg className="h-8 w-8 text-indigo-600" viewBox="0 0 23 23" fill="currentColor">
                           <path d="M0 0h11v11H0z" fill="#f25022"/><path d="M12 0h11v11H12z" fill="#7fba00"/><path d="M0 12h11v11H0z" fill="#00a4ef"/><path d="M12 12h11v11H12z" fill="#ffb900"/>
                        </svg>
                    </div>
                </div>
                <div className="text-center">
                    <h2 className="text-2xl font-black text-gray-900 tracking-tight">Finalizing Sync</h2>
                    <p className="mt-2 text-gray-400 font-bold uppercase tracking-widest text-[10px]">Exchanging tokens with Azure AD...</p>
                </div>
            </div>
        </div>
    )
}

export default AuthCallback
