import React from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { logout } from '../../store/slices/authSlice';
import {
  BuildingOfficeIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  ShieldCheckIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';

const AdminLayout: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { user } = useSelector((state: RootState) => state.auth);

  const adminNavigation = [
    { 
      name: 'Companies', 
      href: '/admin/companies', 
      icon: BuildingOfficeIcon,
      description: 'Manage all companies'
    },
    { 
      name: 'System Analytics', 
      href: '/admin/analytics', 
      icon: ChartBarIcon,
      description: 'Platform-wide statistics'
    },
    { 
      name: 'System Settings', 
      href: '/admin/settings', 
      icon: Cog6ToothIcon,
      description: 'Global configurations'
    },
    { 
      name: 'Profile', 
      href: '/profile', 
      icon: UserCircleIcon,
      description: 'Change password & settings'
    },
  ];

  const handleLogout = async () => {
    localStorage.removeItem('token');
    await dispatch(logout());
    navigate('/admin/login');
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Top Navigation Bar */}
      <nav className="bg-gradient-to-r from-indigo-900 to-purple-900 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <ShieldCheckIcon className="h-8 w-8 text-white" />
              <span className="ml-3 text-white text-xl font-bold">
                System Administrator
              </span>
            </div>

            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm font-medium text-white">{user?.name}</p>
                <p className="text-xs text-indigo-200">{user?.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-indigo-700 hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <ArrowRightOnRectangleIcon className="h-4 w-4 mr-2" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 bg-white shadow-lg min-h-[calc(100vh-4rem)]">
          <nav className="mt-5 px-2">
            <div className="space-y-1">
              {adminNavigation.map((item) => {
                const isActive = window.location.pathname === item.href;
                return (
                  <a
                    key={item.name}
                    href={item.href}
                    className={`${
                      isActive
                        ? 'bg-indigo-100 text-indigo-900 border-l-4 border-indigo-600'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    } group flex items-start px-3 py-3 text-sm font-medium rounded-md transition-colors`}
                  >
                    <item.icon
                      className={`${
                        isActive ? 'text-indigo-600' : 'text-gray-400 group-hover:text-gray-500'
                      } flex-shrink-0 h-6 w-6`}
                      aria-hidden="true"
                    />
                    <div className="ml-3">
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-gray-500">{item.description}</p>
                    </div>
                  </a>
                );
              })}
            </div>
          </nav>

          {/* System Info */}
          <div className="mt-8 px-4 py-4 bg-indigo-50 mx-2 rounded-lg">
            <h4 className="text-xs font-semibold text-indigo-900 uppercase tracking-wider">
              System Status
            </h4>
            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">Role</span>
                <span className="font-medium text-indigo-900">SUPER_ADMIN</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">Access Level</span>
                <span className="font-medium text-green-600">Full</span>
              </div>
            </div>
          </div>

          {/* Warning Banner */}
          <div className="mt-4 px-4">
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3">
              <div className="flex">
                <div className="flex-shrink-0">
                  <ShieldCheckIcon className="h-5 w-5 text-yellow-400" />
                </div>
                <div className="ml-3">
                  <p className="text-xs text-yellow-700">
                    You are in the System Administration portal. All actions are logged.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;

