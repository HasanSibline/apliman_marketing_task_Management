import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  HomeIcon,
  ClipboardDocumentListIcon,
  UsersIcon,
  ChartBarIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline'
import { useAppSelector } from '@/hooks/redux'

const Sidebar: React.FC = () => {
  const { sidebarOpen } = useAppSelector((state) => state.ui)
  const { user } = useAppSelector((state) => state.auth)
  const location = useLocation()

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
    { name: 'Tasks', href: '/tasks', icon: ClipboardDocumentListIcon },
    { name: 'Users', href: '/users', icon: UsersIcon, adminOnly: true },
    { name: 'Analytics', href: '/analytics', icon: ChartBarIcon },
    { name: 'Profile', href: '/profile', icon: UserCircleIcon },
  ]

  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN'

  const filteredNavigation = navigation.filter(item => 
    !item.adminOnly || isAdmin
  )

  return (
    <motion.div
      initial={false}
      animate={{
        width: sidebarOpen ? 256 : 64,
      }}
      transition={{ duration: 0.3 }}
      className="fixed inset-y-0 left-0 z-50 bg-white shadow-lg border-r border-gray-200"
    >
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-center h-16 px-4 border-b border-gray-200">
          {sidebarOpen ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="flex items-center space-x-2"
            >
              <span className="text-lg font-bold text-gray-900">TaskFlow</span>
            </motion.div>
          ) : (
            <span className="text-lg font-bold text-gray-900">TF</span>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-4 space-y-1">
          {filteredNavigation.map((item) => {
            const isActive = location.pathname === item.href || 
              (item.href !== '/dashboard' && location.pathname.startsWith(item.href))
            
            return (
              <NavLink
                key={item.name}
                to={item.href}
                className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors duration-200 ${
                  isActive
                    ? 'bg-primary-50 text-primary-700 border-r-2 border-primary-500'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <item.icon
                  className={`flex-shrink-0 h-5 w-5 ${
                    isActive ? 'text-primary-500' : 'text-gray-400 group-hover:text-gray-500'
                  }`}
                />
                {sidebarOpen && (
                  <motion.span
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 }}
                    className="ml-3"
                  >
                    {item.name}
                  </motion.span>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* User info */}
        <div className="border-t border-gray-200 p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="h-8 w-8 rounded-full bg-primary-600 flex items-center justify-center">
                <span className="text-sm font-medium text-white">
                  {user?.name?.charAt(0).toUpperCase()}
                </span>
              </div>
            </div>
            {sidebarOpen && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                className="ml-3"
              >
                <p className="text-sm font-medium text-gray-700">{user?.name}</p>
                <p className="text-xs text-gray-500 capitalize">
                  {user?.role?.replace('_', ' ').toLowerCase()}
                </p>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default Sidebar