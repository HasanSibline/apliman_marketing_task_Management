import React from 'react';
import { Outlet, useNavigate, useLocation, NavLink } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { useAppDispatch } from '@/hooks/redux';
import { AuraMark } from '@/components/brand/AuraMark';
import { logout } from '../../store/slices/authSlice';
import {
  BuildingOfficeIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  ShieldCheckIcon,
  UserCircleIcon,
  CreditCardIcon,
} from '@heroicons/react/24/outline';
import { BRAND } from '@/config/brand';

const AdminLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const { user } = useSelector((state: RootState) => state.auth);

  const adminNavigation = [
    {
      group: 'Customers',
      items: [
        {
          name: 'Companies',
          href: '/admin/companies',
          icon: BuildingOfficeIcon,
          description: 'Create companies, set plans and limits',
        },
      ],
    },
    {
      group: 'Platform',
      items: [
        {
          name: 'Settings',
          href: '/admin/settings',
          icon: Cog6ToothIcon,
          description: 'Uploads, sessions, platform-wide',
        },
        {
          name: 'Plans',
          href: '/admin/plans',
          icon: CreditCardIcon,
          description: 'Pricing and per-tier limits',
        },
        {
          name: 'Analytics',
          href: '/admin/analytics',
          icon: ChartBarIcon,
          description: 'Usage across every company',
        },
      ],
    },
    {
      group: 'You',
      items: [
        {
          name: 'Profile',
          href: '/admin/profile',
          icon: UserCircleIcon,
          description: 'Your password and preferences',
        },
      ],
    },
  ];

  const handleLogout = async () => {
    localStorage.removeItem('token');
    await dispatch(logout());
    navigate('/admin/login');
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      {/* Top Navigation Bar */}
      <nav className="bg-gradient-to-r from-primary-800 to-primary-950 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <AuraMark className="h-8 w-8 text-white" monochrome />
              <span className="ml-3 text-xl font-semibold tracking-tight text-white">
                Aura <span className="font-normal text-white/70">Admin console</span>
              </span>
            </div>

            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm font-medium text-white">{user?.name}</p>
                <p className="text-xs text-primary-200">{user?.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-primary-700 hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
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
        <aside className="w-64 bg-white dark:bg-gray-800 shadow-lg min-h-[calc(100vh-4rem)]">
          <nav className="mt-5 px-2">
            <div className="space-y-6">
              {adminNavigation.map((section) => (
                <div key={section.group}>
                  <p className="px-3 pb-2 text-xs font-semibold tracking-wider text-gray-500 dark:text-gray-400">
                    {section.group}
                  </p>
                  <div className="space-y-1">
                    {section.items.map((item) => {
                      const isActive =
                        location.pathname === item.href || location.pathname.startsWith(item.href + '/');
                      return (
                        <NavLink
                          key={item.name}
                          to={item.href}
                          aria-current={isActive ? 'page' : undefined}
                          className={`${isActive
                              ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-900 dark:text-primary-200 border-l-4 border-primary-600'
                              : 'border-l-4 border-transparent text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 hover:text-gray-900 dark:hover:text-white'
                            } group flex items-start rounded-md px-3 py-2.5 text-sm transition-colors`}
                        >
                          <item.icon
                            className={`${isActive ? 'text-primary-600 dark:text-primary-400' : 'text-gray-500 group-hover:text-gray-700 dark:text-gray-400 dark:group-hover:text-gray-200'
                              } h-5 w-5 flex-shrink-0`}
                            aria-hidden="true"
                          />
                          <span className="ml-3 min-w-0">
                            <span className="block font-medium">{item.name}</span>
                            <span className="block text-xs text-gray-500 dark:text-gray-400">
                              {item.description}
                            </span>
                          </span>
                        </NavLink>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </nav>

          {/* System Info */}
          <div className="mt-8 px-4 py-4 bg-primary-50 dark:bg-primary-900/30 mx-2 rounded-lg">
            <h4 className="text-xs font-semibold text-primary-900 dark:text-primary-300 tracking-wider">
              System Status
            </h4>
            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600 dark:text-gray-300">Role</span>
                <span className="font-medium text-primary-900 dark:text-primary-300">SUPER_ADMIN</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600 dark:text-gray-300">Access Level</span>
                <span className="font-medium text-success-600 dark:text-success-400">Full</span>
              </div>
            </div>
          </div>

          {/* Warning Banner */}
          <div className="mt-4 px-4">
            <div className="bg-warning-50 dark:bg-warning-900/30 border-l-4 border-warning-400 p-3">
              <div className="flex">
                <div className="flex-shrink-0">
                  <ShieldCheckIcon className="h-5 w-5 text-warning-400" />
                </div>
                <div className="ml-3">
                  <p className="text-xs text-warning-700 dark:text-warning-300">
                    You are in the {BRAND.name} platform administration portal. All actions are logged.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="app-backdrop flex-1 p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;

