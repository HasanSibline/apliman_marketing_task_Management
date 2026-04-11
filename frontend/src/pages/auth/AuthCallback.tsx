import React, { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAppDispatch } from '@/hooks/redux'
import { updateUser } from '@/store/slices/authSlice'
import api from '@/services/api'
import toast from 'react-hot-toast'

const AuthCallback: React.FC = () => {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const dispatch = useAppDispatch()
    const hasFetched = useRef(false)

    useEffect(() => {
        if (hasFetched.current) return
        hasFetched.current = true

        const handleCallback = async () => {
            const code = searchParams.get('code')
            if (!code) {
                toast.error('Authentication failed: No code provided')
                navigate('/calendar')
                return
            }

            try {
                // In a typical flow, we'd send the code to our backend to exchange for tokens
                await api.post('/microsoft/sync', { code })
                
                // Update local user state
                dispatch(updateUser({ isMicrosoftSynced: true }))
                
                toast.success('Successfully synced with Microsoft Calendar!')
                navigate('/calendar')
            } catch (error: any) {
                console.error('Microsoft Sync Error:', error)
                toast.error(error.response?.data?.message || 'Failed to sync with Microsoft')
                navigate('/calendar')
            }
        }

        handleCallback()
    }, [searchParams, navigate, dispatch])

    return (
        <div className="h-screen flex items-center justify-center bg-gray-50">
            <div className="flex flex-col items-center">
                <div className="h-12 w-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                <h2 className="mt-6 text-xl font-bold text-gray-900">Synchronizing with Microsoft...</h2>
                <p className="mt-2 text-gray-500">Please wait while we set up your calendar connection.</p>
            </div>
        </div>
    )
}

export default AuthCallback
