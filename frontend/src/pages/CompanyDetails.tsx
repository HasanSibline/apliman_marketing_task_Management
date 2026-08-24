import { useState, useEffect, useRef } from 'react';
import { confirmDialog } from '@/components/ui/confirm'
import { useParams, useNavigate } from 'react-router-dom';
import api from '@/services/api';
import toast from 'react-hot-toast';
import Avatar from '@/components/common/Avatar';

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
  
  /**
   * Reset password modal.
   *
   * It asks who, not what. The server generates the password itself and returns it
   * once (`resetAdminPassword` in companies.service.ts); there is no endpoint that
   * accepts a password of your choosing. This dialog used to collect one, validate
   * its length, discard it, and send `company.billingEmail` as the account to reset.
   * Billing email is the address invoices go to, not a login, so the call normally
   * 404'd, and when the two addresses happened to match it randomised the admin's
   * password and threw away the only copy. Either way the toast said
   * "Password reset successfully!".
   */
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [issuedCredentials, setIssuedCredentials] = useState<{ email: string; password: string } | null>(null);
  
  // Extend subscription modal
  const [showExtendSubscription, setShowExtendSubscription] = useState(false);
  const [extensionDays, setExtensionDays] = useState(30);

  useEffect(() => {
    if (id) {
      fetchCompany();
    }
  }, [id]);

  /**
   * Only the newest company's answer may write.
   *
   * This re-runs on `[id]` and is also called again by four mutation handlers, none of
   * which waited for the one before. Nothing tied a response to the id that asked for
   * it, so an earlier answer arriving last put one company's plan, limits and usage
   * under another company's heading, where the Suspend and Reset password buttons on
   * the same screen act on the id in the URL.
   */
  const requestId = useRef(0);

  const fetchCompany = async () => {
    const mine = ++requestId.current;
    try {
      setLoading(true);
      setError(null);
      const response = await api.get(`/companies/${id}`);
      if (mine !== requestId.current) return;
      setCompany(response.data);
    } catch (err: any) {
      if (mine !== requestId.current) return;
      console.error('Error fetching company:', err);
      setError(err.response?.data?.message || 'Failed to load company');
      toast.error(err.response?.data?.message || 'Failed to load company');
    } finally {
      if (mine === requestId.current) setLoading(false);
    }
  };

  const handleSuspend = async () => {
    if (!(await confirmDialog({
      title: 'Suspend this company?',
      description: 'Everyone here loses access until it is reactivated. Nothing is deleted.',
      confirmText: 'Suspend',
      variant: 'warning',
    }))) return;
    
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
    const email = adminEmail.trim();
    if (!email) {
      toast.error("Enter the company admin's email address");
      return;
    }

    try {
      setActionLoading(true);
      const { data } = await api.post(`/companies/${id}/reset-admin-password`, { adminEmail: email });
      setShowResetPassword(false);
      setAdminEmail('');
      // Shown, not swallowed. This is the only time the new password exists in
      // readable form, and the admin cannot sign in without being told it.
      setIssuedCredentials({ email: data?.email ?? email, password: data?.newPassword ?? '' });
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
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900/40 py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
            {error || 'Company not found'}
          </div>
          <button
            onClick={() => navigate('/admin/companies')}
            className="mt-4 text-blue-600 dark:text-blue-400 hover:text-blue-800"
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


  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900/40 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/admin/companies')}
            className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white mb-4 flex items-center"
          >
            ← Back to Companies
          </button>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Avatar 
                src={company.logo} 
                name={company.name}
                size="lg"
                rounded="full"
                className="h-16 w-16 mr-4 border-2 border-white shadow-sm"
              />
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{company.name}</h1>
                <p className="text-gray-600 dark:text-gray-300">{company.slug}</p>
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
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
              <div className="text-sm text-gray-600 dark:text-gray-300 mb-1">Total Users</div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white">{company.stats.totalUsers}</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
              <div className="text-sm text-gray-600 dark:text-gray-300 mb-1">Active Tasks</div>
              <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">{company.stats.activeTasks}</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
              <div className="text-sm text-gray-600 dark:text-gray-300 mb-1">Completed Tasks</div>
              <div className="text-3xl font-bold text-green-600 dark:text-green-400">{company.stats.completedTasks}</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
              <div className="text-sm text-gray-600 dark:text-gray-300 mb-1">AI Messages</div>
              <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">{company.stats.aiMessagesCount}</div>
            </div>
          </div>
        )}

        {/* Details Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Subscription Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Subscription Details</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300">Plan:</span>
                <span className="font-semibold text-gray-900 dark:text-white">{company.subscriptionPlan}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300">Status:</span>
                <span className={`font-semibold ${
                  company.subscriptionStatus === 'ACTIVE' ? 'text-green-600 dark:text-green-400' :
                  company.subscriptionStatus === 'TRIAL' ? 'text-blue-600 dark:text-blue-400' :
                  'text-red-600 dark:text-red-400'
                }`}>
                  {company.subscriptionStatus}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300">Started:</span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {new Date(company.subscriptionStart).toLocaleDateString()}
                </span>
              </div>
              {company.subscriptionEnd && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-300">Expires:</span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {new Date(company.subscriptionEnd).toLocaleDateString()}
                    </span>
                  </div>
                  {daysUntilExpiry !== null && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-300">Days Remaining:</span>
                      <span className={`font-semibold ${daysUntilExpiry < 7 ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>
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
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">AI Configuration</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300">AI Status:</span>
                <span className={`font-semibold ${company.aiEnabled ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>
                  {company.aiEnabled ? '✓ Enabled' : '✗ Disabled'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300">Provider:</span>
                <span className="font-semibold text-gray-900 dark:text-white">{company.aiProvider}</span>
              </div>
              {company.stats && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-300">Tokens Used:</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{(company.stats.aiTokensUsed || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-300">Total Cost:</span>
                    <span className="font-semibold text-gray-900 dark:text-white">${(company.stats.aiTotalCost || 0).toFixed(4)}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Resource Limits Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Resource Limits</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300">Max Users:</span>
                <span className="font-semibold text-gray-900 dark:text-white">{company.maxUsers}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300">Max Tasks:</span>
                <span className="font-semibold text-gray-900 dark:text-white">{company.maxTasks}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300">Max Storage:</span>
                <span className="font-semibold text-gray-900 dark:text-white">{company.maxStorage} GB</span>
              </div>
            </div>
          </div>

          {/* Admin Actions Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Admin Actions</h2>
            <div className="space-y-3">
              <button
                onClick={() => setShowResetPassword(true)}
                className="w-full px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
              >
                Reset Admin Password
              </button>
              {company.billingEmail && (
                <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                  <div className="text-sm text-gray-600 dark:text-gray-300">Billing Email:</div>
                  <div className="font-semibold text-gray-900 dark:text-white">{company.billingEmail}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Reset Password Modal */}
      {showResetPassword && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-8 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Reset Admin Password</h3>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              Which company admin? A new password is generated and shown to you once, so you
              can pass it on.
            </p>
            <input
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              placeholder="admin@company.com"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent mb-2"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              Must be the login address of a company admin on this account.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => {
                  setShowResetPassword(false);
                  setAdminEmail('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
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

      {/* The new password, shown once. There is no second chance to read it: the
          server stores only the hash. */}
      {issuedCredentials && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-8 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">New admin password</h3>
            <p className="text-sm text-amber-700 dark:text-amber-300 mb-4">
              Copy this now and share it securely. It is not stored anywhere you can read it again.
            </p>
            <div className="space-y-3">
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">Admin email</p>
                <p className="font-mono text-sm text-gray-900 dark:text-white break-all">{issuedCredentials.email}</p>
              </div>
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">New password</p>
                <p className="font-mono text-sm text-gray-900 dark:text-white break-all">{issuedCredentials.password}</p>
              </div>
            </div>
            <div className="mt-6 flex space-x-3">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${issuedCredentials.email} / ${issuedCredentials.password}`);
                  toast.success('Copied');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Copy
              </button>
              <button
                onClick={() => setIssuedCredentials(null)}
                className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extend Subscription Modal */}
      {showExtendSubscription && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-8 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Extend Subscription</h3>
            <p className="text-gray-600 dark:text-gray-300 mb-4">How many days would you like to extend the subscription?</p>
            <input
              type="number"
              value={extensionDays}
              onChange={(e) => {
                // Clearing the box gave NaN, which rendered as a blank-but-invalid
                // field and then serialised to null in the POST body, so the extend
                // either failed or extended by nothing while reporting success.
                const days = parseInt(e.target.value, 10)
                setExtensionDays(Number.isNaN(days) ? 1 : days)
              }}
              min={1}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent mb-4"
            />
            <div className="flex space-x-3">
              <button
                onClick={() => setShowExtendSubscription(false)}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
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

