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

interface CompanyOption { id: string; name: string }

const AdminAnalytics: React.FC = () => {
  // Platform totals answer "is the business growing". They say nothing about whether
  // any individual customer is healthy, which is what you actually need before a
  // renewal call, so the scope is switchable.
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [companyStats, setCompanyStats] = useState<any>(null);
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
    api
      .get('/companies')
      .then(({ data }) => setCompanies((data?.companies ?? data ?? []).map((c: any) => ({ id: c.id, name: c.name }))))
      .catch(() => setCompanies([]));
  }, []);

  useEffect(() => {
    fetchStats();
  }, [companyId]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/companies/platform-stats', {
        params: companyId ? { companyId } : undefined,
      });
      if (data?.scope === 'company') {
        setCompanyStats(data);
      } else {
        setCompanyStats(null);
        setStats(data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
      toast.error(companyId ? 'Failed to load company statistics' : 'Failed to load platform statistics');
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
      textColor: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-900/30',
    },
    {
      name: 'Active Companies',
      value: stats.activeCompanies,
      icon: CheckCircleIcon,
      color: 'bg-green-500',
      textColor: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-900/30',
    },
    {
      name: 'On Trial',
      value: stats.companiesOnTrial,
      icon: ClockIcon,
      color: 'bg-yellow-500',
      textColor: 'text-yellow-600 dark:text-yellow-400',
      bgColor: 'bg-yellow-50 dark:bg-yellow-900/30',
    },
    {
      name: 'Suspended/Expired',
      value: stats.suspendedCompanies + stats.companiesExpired,
      icon: ExclamationTriangleIcon,
      color: 'bg-red-500',
      textColor: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-50 dark:bg-red-900/30',
    },
    {
      name: 'Total Users',
      value: stats.totalUsers,
      icon: UsersIcon,
      color: 'bg-purple-500',
      textColor: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-50 dark:bg-purple-900/30',
    },
    {
      name: 'Total Tasks',
      value: stats.totalTasks,
      icon: ChartBarIcon,
      color: 'bg-indigo-500',
      textColor: 'text-indigo-600 dark:text-indigo-400',
      bgColor: 'bg-indigo-50 dark:bg-indigo-900/30',
    },
    {
      name: 'AI Messages',
      value: stats.totalAIMessages,
      icon: CpuChipIcon,
      color: 'bg-pink-500',
      textColor: 'text-pink-600 dark:text-pink-400',
      bgColor: 'bg-pink-50 dark:bg-pink-900/30',
    },
  ];

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-6"></div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg h-32"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-subtitle">
            {companyStats
              ? `Activity inside ${companyStats.company?.name ?? 'this company'}.`
              : 'Totals across every company on the platform.'}
          </p>
        </div>

        <div>
          <label htmlFor="analytics-scope" className="form-label">Scope</label>
          <select
            id="analytics-scope"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            className="select-field min-w-[16rem]"
          >
            <option value="">All companies (platform)</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {companyStats ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { name: 'People', value: companyStats.totalUsers, sub: `${companyStats.activeUsers} active` },
            { name: 'Tasks', value: companyStats.totalTasks, sub: `${companyStats.completedTasks} completed` },
            { name: 'Completion rate', value: `${companyStats.completionRate}%`, sub: 'of all tasks' },
            { name: 'Overdue', value: companyStats.overdueTasks, sub: 'past their due date' },
            { name: 'Open tickets', value: companyStats.openTickets, sub: 'not yet resolved' },
            { name: 'AI messages', value: companyStats.totalAIMessages, sub: 'sent to Aura Assist' },
            { name: 'Plan', value: companyStats.company?.subscriptionPlan ?? 'Not set', sub: companyStats.company?.subscriptionStatus ?? '' },
            { name: 'Status', value: companyStats.company?.isActive ? 'Active' : 'Inactive', sub: 'account state' },
          ].map((stat) => (
            <div key={stat.name} className="surface p-5">
              <p className="eyebrow">{stat.name}</p>
              <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{stat.value}</p>
              {stat.sub && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{stat.sub}</p>}
            </div>
          ))}
        </div>
      ) : (
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {statCards.map((stat) => (
          <div
            key={stat.name}
            className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow"
          >
            <div className="p-5">
              <div className="flex items-center">
                <div className={`flex-shrink-0 ${stat.bgColor} rounded-md p-3`}>
                  <stat.icon className={`h-6 w-6 ${stat.textColor}`} aria-hidden="true" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">{stat.name}</dt>
                    <dd>
                      <div className="text-2xl font-semibold text-gray-900 dark:text-white">
                        {(stat.value || 0).toLocaleString()}
                      </div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      )}

      {!companyStats && (
      <div className="mt-8 bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Subscription Status Breakdown</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-4 h-4 bg-green-500 rounded-full mr-3"></div>
              <span className="text-sm text-gray-700 dark:text-gray-200">Active Subscriptions</span>
            </div>
            <span className="text-sm font-semibold text-gray-900 dark:text-white">{stats.activeCompanies || 0}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-4 h-4 bg-yellow-500 rounded-full mr-3"></div>
              <span className="text-sm text-gray-700 dark:text-gray-200">Trial Period</span>
            </div>
            <span className="text-sm font-semibold text-gray-900 dark:text-white">{stats.companiesOnTrial || 0}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-4 h-4 bg-red-500 rounded-full mr-3"></div>
              <span className="text-sm text-gray-700 dark:text-gray-200">Expired</span>
            </div>
            <span className="text-sm font-semibold text-gray-900 dark:text-white">{stats.companiesExpired || 0}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-4 h-4 bg-gray-500 rounded-full mr-3"></div>
              <span className="text-sm text-gray-700 dark:text-gray-200">Suspended</span>
            </div>
            <span className="text-sm font-semibold text-gray-900 dark:text-white">{stats.suspendedCompanies || 0}</span>
          </div>
        </div>
      </div>
      )}

      <div className="mt-6 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 rounded-lg p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <ChartBarIcon className="h-5 w-5 text-blue-400" aria-hidden="true" />
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800 dark:text-blue-300">Analytics Note</h3>
            <div className="mt-2 text-sm text-blue-700 dark:text-blue-300">
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

