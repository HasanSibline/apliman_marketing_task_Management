import React, { useEffect, useState, Fragment } from 'react'
import { Link } from 'react-router-dom'
import {
  Bars3Icon,
  UserCircleIcon,
  ArrowRightOnRectangleIcon,
} from '@heroicons/react/24/outline'
import NotificationBell from '../notifications/NotificationBell'
import { Menu, Transition } from '@headlessui/react'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { toggleSidebar } from '@/store/slices/uiSlice'
import { logout } from '@/store/slices/authSlice'
import { usersApi } from '@/services/api'
import Avatar from '@/components/common/Avatar'

const Header: React.FC = () => {
  const dispatch = useAppDispatch()
  const { user } = useAppSelector((state) => state.auth)
  const [onlineCount, setOnlineCount] = useState(0)

  // Fetch online users count
  useEffect(() => {
    const fetchOnlineUsers = async () => {
      try {
        const users = await usersApi.getAll({ status: 'ACTIVE' })
        
        // Consider users online if they were active in the last 5 minutes
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
        const onlineUsers = users.filter((u: any) => {
          if (!u.lastActiveAt) return false
          const lastActive = new Date(u.lastActiveAt)
          return lastActive > fiveMinutesAgo
        })
        
        setOnlineCount(onlineUsers.length)
      } catch (error) {
        console.error('Failed to fetch online users:', error)
      }
    }

    fetchOnlineUsers()
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchOnlineUsers, 30000)
    
    return () => clearInterval(interval)
  }, [])

  const handleLogout = () => {
    dispatch(logout())
  }

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
      <div className="flex items-center justify-between h-16 px-6">
        {/* Left side */}
        <div className="flex items-center space-x-4">
          {/* Sidebar toggle */}
          <button
            onClick={() => dispatch(toggleSidebar())}
            className="p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors duration-200"
          >
            <Bars3Icon className="h-5 w-5" />
          </button>
        </div>

        {/* Right side */}
        <div className="flex items-center space-x-4">
          {/* Team presence indicator */}
          <div className="hidden lg:flex items-center space-x-2 text-sm text-gray-600">
            <div className="flex items-center space-x-1">
              <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
              <span>{onlineCount} online</span>
            </div>
          </div>

          {/* Notifications */}
          <NotificationBell />

          {/* User menu */}
          <Menu as="div" className="relative">
            <Menu.Button className="flex items-center space-x-3 p-2 rounded-md hover:bg-gray-100 transition-colors duration-200 group">
              <Avatar
                src={user?.avatar}
                name={user?.name}
                className="h-9 w-9 border-2 border-white shadow-md group-hover:shadow-lg transition-all"
                size="sm"
                rounded="xl"
              />
              <div className="hidden md:block text-left">
                <p className="text-sm font-black text-gray-900 tracking-tight leading-none">{user?.name}</p>
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-1.5 opacity-80">{user?.position || user?.role?.replace('_', ' ')}</p>
              </div>
            </Menu.Button>

            <Transition
              as={Fragment}
              enter="transition ease-out duration-100"
              enterFrom="transform opacity-0 scale-95"
              enterTo="transform opacity-100 scale-100"
              leave="transition ease-in duration-75"
              leaveFrom="transform opacity-100 scale-100"
              leaveTo="transform opacity-0 scale-95"
            >
              <Menu.Items className="absolute right-0 mt-3 w-64 bg-white rounded-[2rem] shadow-2xl ring-1 ring-black ring-opacity-5 focus:outline-none z-50 overflow-hidden border border-gray-100 p-2">
                <div className="px-4 py-3 border-b border-gray-50 mb-1">
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Signed in as</p>
                   <p className="text-sm font-black text-gray-900 truncate">{user?.email}</p>
                </div>
                <Menu.Item>
                  {({ active }) => (
                    <Link
                      to="/profile"
                      className={`${
                        active ? 'bg-primary-50 text-primary-600' : 'text-gray-700'
                      } flex items-center px-4 py-3 text-xs font-black uppercase tracking-widest rounded-2xl transition-all`}
                    >
                      <UserCircleIcon className="h-5 w-5 mr-3 opacity-60" />
                      User Profile
                    </Link>
                  )}
                </Menu.Item>
                <Menu.Item>
                  {({ active }) => (
                    <button
                      onClick={handleLogout}
                      className={`${
                        active ? 'bg-red-50 text-red-600' : 'text-gray-700'
                      } flex items-center w-full px-4 py-3 text-xs font-black uppercase tracking-widest rounded-2xl transition-all`}
                    >
                      <ArrowRightOnRectangleIcon className="h-5 w-5 mr-3 opacity-60" />
                      Logout
                    </button>
                  )}
                </Menu.Item>
              </Menu.Items>
            </Transition>
          </Menu>
        </div>
      </div>
    </header>
  )
}

export default Header
