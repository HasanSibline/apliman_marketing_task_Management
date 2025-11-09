import React, { useEffect, useState } from 'react';
import { 
  ChartBarIcon, 
  UsersIcon, 
  BuildingOfficeIcon, 
  CpuChipIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ClockIcon
} from '@heroicons/react/24/outline';
import api from '@/services/api';
import toast from 'react-hot-toast';

interface PlatformStats {
  totalCompanies: number;
  activeCompanies: number;
  suspendedCompanies: number;
  totalUsers: number;
  totalTasks: number;
  totalAIMessages: number;
  companiesOnTrial: number;
  companiesExpired: number;
}

const AdminAnalytics: React.FC = () => {
  const [stats, setStats] = useState<PlatformStats>({
    totalCompanies: 0,
    activeCompanies: 0,
    suspendedCompanies: 0,
    totalUsers: 0,
    totalTasks: 0,
    totalAIMessages: 0,
    companiesOnTrial: 0,
    companiesExpired: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPlatformStats();
  }, []);

  const fetchPlatformStats = async () => {
    try {
      const response = await api.get('/companies/platform-stats');
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching platform stats:', error);
      toast.error('Failed to load platform statistics');
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      name: 'Total Companies',
      value: stats.totalCompanies,
      icon: BuildingOfficeIcon,
      color: 'bg-blue-500',
      textColor: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      name: 'Active Companies',
      value: stats.activeCompanies,
      icon: CheckCircleIcon,
      color: 'bg-green-500',
      textColor: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      name: 'On Trial',
      value: stats.companiesOnTrial,
      icon: ClockIcon,
      color: 'bg-yellow-500',
      textColor: 'text-yellow-600',
      bgColor: 'bg-yellow-50',
    },
    {
      name: 'Suspended/Expired',
      value: stats.suspendedCompanies + stats.companiesExpired,
      icon: ExclamationTriangleIcon,
      color: 'bg-red-500',
      textColor: 'text-red-600',
      bgColor: 'bg-red-50',
    },
    {
      name: 'Total Users',
      value: stats.totalUsers,
      icon: UsersIcon,
      color: 'bg-purple-500',
      textColor: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
    {
      name: 'Total Tasks',
      value: stats.totalTasks,
      icon: ChartBarIcon,
      color: 'bg-indigo-500',
      textColor: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
    },
    {
      name: 'AI Messages',
      value: stats.totalAIMessages,
      icon: CpuChipIcon,
      color: 'bg-pink-500',
      textColor: 'text-pink-600',
      bgColor: 'bg-pink-50',
    },
  ];

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white overflow-hidden shadow rounded-lg h-32"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Platform Analytics</h1>
        <p className="mt-2 text-sm text-gray-600">
          Overview of all companies and platform-wide statistics
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {statCards.map((stat) => (
          <div
            key={stat.name}
            className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow"
          >
            <div className="p-5">
              <div className="flex items-center">
                <div className={`flex-shrink-0 ${stat.bgColor} rounded-md p-3`}>
                  <stat.icon className={`h-6 w-6 ${stat.textColor}`} aria-hidden="true" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">{stat.name}</dt>
                    <dd>
                      <div className="text-2xl font-semibold text-gray-900">
                        {stat.value.toLocaleString()}
                      </div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Subscription Status Breakdown</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-4 h-4 bg-green-500 rounded-full mr-3"></div>
              <span className="text-sm text-gray-700">Active Subscriptions</span>
            </div>
            <span className="text-sm font-semibold text-gray-900">{stats.activeCompanies}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-4 h-4 bg-yellow-500 rounded-full mr-3"></div>
              <span className="text-sm text-gray-700">Trial Period</span>
            </div>
            <span className="text-sm font-semibold text-gray-900">{stats.companiesOnTrial}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-4 h-4 bg-red-500 rounded-full mr-3"></div>
              <span className="text-sm text-gray-700">Expired</span>
            </div>
            <span className="text-sm font-semibold text-gray-900">{stats.companiesExpired}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-4 h-4 bg-gray-500 rounded-full mr-3"></div>
              <span className="text-sm text-gray-700">Suspended</span>
            </div>
            <span className="text-sm font-semibold text-gray-900">{stats.suspendedCompanies}</span>
          </div>
        </div>
      </div>

      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <ChartBarIcon className="h-5 w-5 text-blue-400" aria-hidden="true" />
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">Analytics Note</h3>
            <div className="mt-2 text-sm text-blue-700">
              <p>
                These statistics are calculated in real-time across all companies. 
                For detailed company-specific analytics, visit individual company pages.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminAnalytics;

