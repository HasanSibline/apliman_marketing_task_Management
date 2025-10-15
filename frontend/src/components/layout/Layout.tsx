import React from 'react'
import { Outlet } from 'react-router-dom'
import { useAppSelector } from '@/hooks/redux'
import Header from './Header'
import Sidebar from './Sidebar'
import FloatingChatButton from '../chat/FloatingChatButton'

const Layout: React.FC = () => {
  const { sidebarOpen } = useAppSelector((state) => state.ui)

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <Sidebar />
      
      {/* Main content */}
      <div className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${
        sidebarOpen ? 'lg:ml-64' : 'lg:ml-16'
      }`}>
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