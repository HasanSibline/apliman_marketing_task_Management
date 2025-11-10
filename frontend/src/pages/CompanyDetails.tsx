import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '@/services/api';
import toast from 'react-hot-toast';

interface Company {
  id: string;
  name: string;
  slug: string;
  logo?: string;
  primaryColor: string;
  isActive: boolean;
  subscriptionPlan: string;
  subscriptionStatus: string;
  subscriptionStart: string;
  subscriptionEnd?: string;
  monthlyPrice: number;
  aiEnabled: boolean;
  aiProvider: string;
  maxUsers: number;
  maxTasks: number;
  maxStorage: number;
  billingEmail?: string;
  createdAt: string;
  stats?: {
    totalUsers: number;
    activeTasks: number;
    completedTasks: number;
    aiMessagesCount: number;
    aiTokensUsed: number;
    aiTotalCost: number;
  };
}

export default function CompanyDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  
  // Reset password modal
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  
  // Extend subscription modal
  const [showExtendSubscription, setShowExtendSubscription] = useState(false);
  const [extensionDays, setExtensionDays] = useState(30);

  useEffect(() => {
    if (id) {
      fetchCompany();
    }
  }, [id]);

  const fetchCompany = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get(`/companies/${id}`);
      setCompany(response.data);
    } catch (err: any) {
      console.error('Error fetching company:', err);
      setError(err.response?.data?.message || 'Failed to load company');
      toast.error(err.response?.data?.message || 'Failed to load company');
    } finally {
      setLoading(false);
    }
  };

  const handleSuspend = async () => {
    if (!confirm('Are you sure you want to suspend this company?')) return;
    
    try {
      setActionLoading(true);
      await api.post(`/companies/${id}/suspend`, { reason: 'Suspended by admin' });
      toast.success('Company suspended successfully');
      await fetchCompany();
    } catch (err: any) {
      const message = err.response?.data?.message || 'Failed to suspend company';
      toast.error(message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReactivate = async () => {
    try {
      setActionLoading(true);
      await api.post(`/companies/${id}/reactivate`);
      toast.success('Company reactivated successfully');
      await fetchCompany();
    } catch (err: any) {
      const message = err.response?.data?.message || 'Failed to reactivate company';
      toast.error(message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    
    try {
      setActionLoading(true);
      await api.post(`/companies/${id}/reset-admin-password`, { adminEmail: company?.billingEmail });
      setShowResetPassword(false);
      setNewPassword('');
      toast.success('Password reset successfully!');
    } catch (err: any) {
      const message = err.response?.data?.message || 'Failed to reset password';
      toast.error(message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleExtendSubscription = async () => {
    try {
      setActionLoading(true);
      await api.post(`/companies/${id}/extend-subscription`, { days: extensionDays });
      setShowExtendSubscription(false);
      toast.success('Subscription extended successfully!');
      await fetchCompany();
    } catch (err: any) {
      const message = err.response?.data?.message || 'Failed to extend subscription';
      toast.error(message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error || 'Company not found'}
          </div>
          <button
            onClick={() => navigate('/admin/companies')}
            className="mt-4 text-blue-600 hover:text-blue-800"
          >
            ← Back to Companies
          </button>
        </div>
      </div>
    );
  }

  const daysUntilExpiry = company.subscriptionEnd 
    ? Math.ceil((new Date(company.subscriptionEnd).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // Convert relative logo URL to absolute URL if needed
  const logoUrl = company.logo 
    ? (company.logo.startsWith('http') 
        ? company.logo 
        : `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}${company.logo}`)
    : null;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/admin/companies')}
            className="text-gray-600 hover:text-gray-900 mb-4 flex items-center"
          >
            ← Back to Companies
          </button>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              {logoUrl ? (
                <img src={logoUrl} alt={company.name} className="h-16 w-16 rounded-full object-cover mr-4" />
              ) : (
                <div
                  className="h-16 w-16 rounded-full mr-4 flex items-center justify-center text-white font-bold text-2xl"
                  style={{ backgroundColor: company.primaryColor }}
                >
                  {company.name.charAt(0)}
                </div>
              )}
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{company.name}</h1>
                <p className="text-gray-600">{company.slug}</p>
              </div>
            </div>
            
            <div className="flex space-x-3">
              <button
                onClick={() => navigate(`/admin/companies/${id}/edit`)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Edit Company
              </button>
              {company.isActive ? (
                <button
                  onClick={handleSuspend}
                  disabled={actionLoading}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  Suspend
                </button>
              ) : (
                <button
                  onClick={handleReactivate}
                  disabled={actionLoading}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  Reactivate
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Statistics Grid */}
        {company.stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="text-sm text-gray-600 mb-1">Total Users</div>
              <div className="text-3xl font-bold text-gray-900">{company.stats.totalUsers}</div>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="text-sm text-gray-600 mb-1">Active Tasks</div>
              <div className="text-3xl font-bold text-blue-600">{company.stats.activeTasks}</div>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="text-sm text-gray-600 mb-1">Completed Tasks</div>
              <div className="text-3xl font-bold text-green-600">{company.stats.completedTasks}</div>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="text-sm text-gray-600 mb-1">AI Messages</div>
              <div className="text-3xl font-bold text-purple-600">{company.stats.aiMessagesCount}</div>
            </div>
          </div>
        )}

        {/* Details Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Subscription Card */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Subscription Details</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Plan:</span>
                <span className="font-semibold text-gray-900">{company.subscriptionPlan}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Status:</span>
                <span className={`font-semibold ${
                  company.subscriptionStatus === 'ACTIVE' ? 'text-green-600' :
                  company.subscriptionStatus === 'TRIAL' ? 'text-blue-600' :
                  'text-red-600'
                }`}>
                  {company.subscriptionStatus}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Started:</span>
                <span className="font-semibold text-gray-900">
                  {new Date(company.subscriptionStart).toLocaleDateString()}
                </span>
              </div>
              {company.subscriptionEnd && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Expires:</span>
                    <span className="font-semibold text-gray-900">
                      {new Date(company.subscriptionEnd).toLocaleDateString()}
                    </span>
                  </div>
                  {daysUntilExpiry !== null && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Days Remaining:</span>
                      <span className={`font-semibold ${daysUntilExpiry < 7 ? 'text-red-600' : 'text-gray-900'}`}>
                        {daysUntilExpiry} days
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
            <button
              onClick={() => setShowExtendSubscription(true)}
              className="w-full mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Extend Subscription
            </button>
          </div>

          {/* AI Configuration Card */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">AI Configuration</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">AI Status:</span>
                <span className={`font-semibold ${company.aiEnabled ? 'text-green-600' : 'text-gray-400'}`}>
                  {company.aiEnabled ? '✓ Enabled' : '✗ Disabled'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Provider:</span>
                <span className="font-semibold text-gray-900">{company.aiProvider}</span>
              </div>
              {company.stats && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Tokens Used:</span>
                    <span className="font-semibold text-gray-900">{(company.stats.aiTokensUsed || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Cost:</span>
                    <span className="font-semibold text-gray-900">${(company.stats.aiTotalCost || 0).toFixed(4)}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Resource Limits Card */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Resource Limits</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Max Users:</span>
                <span className="font-semibold text-gray-900">{company.maxUsers}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Max Tasks:</span>
                <span className="font-semibold text-gray-900">{company.maxTasks}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Max Storage:</span>
                <span className="font-semibold text-gray-900">{company.maxStorage} GB</span>
              </div>
            </div>
          </div>

          {/* Admin Actions Card */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Admin Actions</h2>
            <div className="space-y-3">
              <button
                onClick={() => setShowResetPassword(true)}
                className="w-full px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
              >
                Reset Admin Password
              </button>
              {company.billingEmail && (
                <div className="pt-3 border-t border-gray-200">
                  <div className="text-sm text-gray-600">Billing Email:</div>
                  <div className="font-semibold text-gray-900">{company.billingEmail}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Reset Password Modal */}
      {showResetPassword && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">Reset Admin Password</h3>
            <p className="text-gray-600 mb-4">Enter a new password for the company admin account.</p>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password (min 8 characters)"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-4"
            />
            <div className="flex space-x-3">
              <button
                onClick={() => {
                  setShowResetPassword(false);
                  setNewPassword('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleResetPassword}
                disabled={actionLoading}
                className="flex-1 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors disabled:opacity-50"
              >
                {actionLoading ? 'Resetting...' : 'Reset Password'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extend Subscription Modal */}
      {showExtendSubscription && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">Extend Subscription</h3>
            <p className="text-gray-600 mb-4">How many days would you like to extend the subscription?</p>
            <input
              type="number"
              value={extensionDays}
              onChange={(e) => setExtensionDays(parseInt(e.target.value))}
              min={1}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-4"
            />
            <div className="flex space-x-3">
              <button
                onClick={() => setShowExtendSubscription(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleExtendSubscription}
                disabled={actionLoading}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {actionLoading ? 'Extending...' : 'Extend'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

