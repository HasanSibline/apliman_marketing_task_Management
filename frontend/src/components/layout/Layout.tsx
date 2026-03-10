import React from 'react'
import { Outlet } from 'react-router-dom'
import { useAppSelector } from '@/hooks/redux'
import Header from './Header'
import Sidebar from './Sidebar'
import FloatingChatButton from '../chat/FloatingChatButton'

const Layout: React.FC = () => {
  const { sidebarOpen } = useAppSelector((state) => state.ui)
  const { user } = useAppSelector((state) => state.auth)

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content */}
      <div className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${sidebarOpen ? 'lg:ml-64' : 'lg:ml-16'
        }`}>
        {/* Demo Ribbon for FREE_TRIAL */}
        {user?.subscriptionPlan === 'FREE_TRIAL' && (
          <div className="fixed top-0 right-0 z-[9999] overflow-hidden w-24 h-24 pointer-events-none">
            <div className="absolute top-[26px] right-[-21px] w-[140%] py-1 bg-gradient-to-r from-orange-500 to-amber-600 text-white text-center text-xs font-bold uppercase tracking-widest shadow-md rotate-45 transform">
              Demo
            </div>
          </div>
        )}

        {/* Header */}
        <Header />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-6">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Floating ApliChat button */}
      <FloatingChatButton />
    </div>
  )
}

export default Layout