import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import axios from 'axios';
import toast from 'react-hot-toast';
import { formatAssetUrl } from '../services/api';

const API_URL = (import.meta as any).env.VITE_API_URL || 'http://localhost:3001/api';

interface Company {
  id: string;
  name: string;
  slug: string;
  logo?: string;
  primaryColor: string;
  isActive: boolean;
  subscriptionPlan: string;
  subscriptionStatus: string;
  subscriptionEnd?: string;
  aiEnabled: boolean;
  createdAt: string;
  adminEmail?: string;
  adminName?: string;
  _count?: { users: number; tasks: number };
}


// ── Reset Password Modal ──────────────────────────────────────────────────────
function ResetPasswordModal({
  company,
  onClose,
  onConfirm,
}: {
  company: Company;
  onClose: () => void;
  onConfirm: (email: string) => void;
}) {
  const [email, setEmail] = useState(company.adminEmail ?? '');
  const [loading, setLoading] = useState(false);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600 text-xl">🔑</div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Reset Admin Password</h2>
            <p className="text-sm text-gray-500">{company.name}</p>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Admin Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-300 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder="admin@company.com"
          />
          <p className="text-xs text-gray-500 mt-1">Must match the COMPANY_ADMIN user's email</p>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition">
            Cancel
          </button>
          <button
            disabled={!email.trim() || loading}
            onClick={async () => { setLoading(true); await onConfirm(email); setLoading(false); }}
            className="flex-1 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-semibold transition disabled:opacity-50">
            {loading ? 'Resetting…' : 'Reset Password'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Credentials Modal (shown after company creation OR password reset) ────────
function CredentialsModal({
  title,
  data,
  onClose,
}: {
  title: string;
  data: { label: string; value: string; copyable?: boolean }[];
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-500 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white text-xl">🔐</div>
            <div>
              <h2 className="text-lg font-bold text-white">{title}</h2>
              <p className="text-sm text-indigo-200">Save these credentials — password won't be shown again</p>
            </div>
          </div>
        </div>

        {/* Warning */}
        <div className="mx-6 mt-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
          <span className="text-amber-500 mt-0.5">⚠️</span>
          <p className="text-xs text-amber-700 font-medium">
            This password is shown only once. Copy and share it with the company admin securely before closing.
          </p>
        </div>

        {/* Credential rows */}
        <div className="px-6 py-4 space-y-3">
          {data.map(({ label, value, copyable }) => (
            <div key={label} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-200">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 mb-0.5">{label}</p>
                <p className="text-sm font-mono font-semibold text-gray-900 truncate">{value}</p>
              </div>
              {copyable && (
                <button
                  onClick={() => copy(value, label)}
                  className={`ml-3 px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 transition
                    ${copied === label
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'}`}
                >
                  {copied === label ? '✓ Copied' : 'Copy'}
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Copy all */}
        <div className="px-6 pb-4 flex gap-3">
          <button
            onClick={() => {
              const all = data.filter(d => d.copyable).map(d => `${d.label}: ${d.value}`).join('\n');
              navigator.clipboard.writeText(all);
              toast.success('All credentials copied!');
            }}
            className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition"
          >
            📋 Copy All
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition"
          >
            I've saved it — Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function SuperAdminDashboard() {
  const navigate = useNavigate();
  const { user } = useSelector((state: RootState) => state.auth);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<Company | null>(null);
  const [credentials, setCredentials] = useState<{ title: string; data: { label: string; value: string; copyable?: boolean }[] } | null>(null);

  useEffect(() => {
    if (user?.role !== 'SUPER_ADMIN') navigate('/dashboard');
  }, [user, navigate]);

  useEffect(() => { fetchCompanies(); }, []);

  const fetchCompanies = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/companies`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCompanies(res.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load companies');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (email: string) => {
    if (!resetTarget) return;
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${API_URL}/companies/${resetTarget.id}/reset-admin-password`,
        { adminEmail: email },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setResetTarget(null);
      const { newPassword } = res.data;
      const loginUrl = `${window.location.origin}/${resetTarget.slug}/login`;
      setCredentials({
        title: 'New Admin Credentials',
        data: [
          { label: 'Company', value: resetTarget.name },
          { label: 'Admin Email', value: email, copyable: true },
          { label: 'New Password', value: newPassword, copyable: true },
          { label: 'Login URL', value: loginUrl, copyable: true },
        ],
      });
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to reset password');
    }
  };

  const handleToggleAI = async (companyId: string, currentStatus: boolean) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${API_URL}/companies/${companyId}/toggle-ai`,
        { enabled: !currentStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(`AI ${!currentStatus ? 'enabled' : 'disabled'} successfully`);
      fetchCompanies();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to toggle AI');
    }
  };

  const handleDeleteCompany = async (companyId: string, companyName: string) => {
    if (!confirm(`Are you sure you want to delete "${companyName}"?\n\nThis will permanently delete all users, tasks, workflows and AI history.\n\nThis action CANNOT be undone!`)) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_URL}/companies/${companyId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success(`Company "${companyName}" deleted`);
      fetchCompanies();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete company');
    }
  };

  const planBadge: Record<string, string> = {
    FREE: 'bg-gray-100 text-gray-700',
    PRO: 'bg-purple-100 text-purple-700',
    ENTERPRISE: 'bg-indigo-100 text-indigo-700',
  };
  const statusBadge: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-700',
    TRIAL: 'bg-blue-100 text-blue-700',
    EXPIRED: 'bg-red-100 text-red-700',
    SUSPENDED: 'bg-gray-100 text-gray-600',
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      {/* Modals */}
      {resetTarget && (
        <ResetPasswordModal
          company={resetTarget}
          onClose={() => setResetTarget(null)}
          onConfirm={handleResetPassword}
        />
      )}
      {credentials && (
        <CredentialsModal
          title={credentials.title}
          data={credentials.data}
          onClose={() => setCredentials(null)}
        />
      )}

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Companies Management</h1>
            <p className="mt-1 text-gray-500">Manage all companies in the system</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/admin/plans')}
              className="px-6 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition font-semibold shadow-sm flex items-center gap-2"
            >
              <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Plan Settings
            </button>
            <button
              onClick={() => navigate('/admin/companies/create')}
              className="px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition font-semibold shadow-sm"
            >
              + Create Company
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">{error}</div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total', value: companies.length, color: 'text-gray-900' },
            { label: 'Active', value: companies.filter(c => c.subscriptionStatus === 'ACTIVE').length, color: 'text-green-600' },
            { label: 'Trial', value: companies.filter(c => c.subscriptionStatus === 'TRIAL').length, color: 'text-blue-600' },
            { label: 'Suspended', value: companies.filter(c => !c.isActive || c.subscriptionStatus === 'SUSPENDED').length, color: 'text-red-600' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
              <p className="text-sm text-gray-500">{s.label}</p>
              <p className={`text-3xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  {['Company', 'Admin', 'Plan', 'Status', 'Users', 'Tasks', 'AI', 'Actions'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {companies.map(company => {
                  const logoUrl = company.logo ? formatAssetUrl(company.logo) : null;
                  return (
                    <tr key={company.id} className="hover:bg-gray-50 transition-colors">
                      {/* Company */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          {logoUrl ? (
                            <img 
                              src={logoUrl} 
                              alt={company.name} 
                              className="h-9 w-9 rounded-lg object-cover" 
                              onError={(e) => {
                                const target = e.currentTarget;
                                const fallback = document.createElement('div');
                                fallback.className = 'h-9 w-9 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0';
                                fallback.style.backgroundColor = company.primaryColor || '#6366f1';
                                fallback.innerText = company.name?.charAt(0) || 'C';
                                target.replaceWith(fallback);
                              }}
                            />
                          ) : (
                            <div className="h-9 w-9 rounded-lg flex items-center justify-center text-white text-sm font-bold"
                              style={{ backgroundColor: company.primaryColor }}>
                              {company.name.charAt(0)}
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{company.name}</p>
                            <p className="text-xs text-gray-400">/{company.slug}</p>
                          </div>
                        </div>
                      </td>

                      {/* Admin */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <p className="text-sm text-gray-800">{company.adminName ?? '—'}</p>
                        <p className="text-xs text-gray-400 font-mono">{company.adminEmail ?? '—'}</p>
                      </td>

                      {/* Plan */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className={`px-2 py-0.5 inline-flex text-xs font-semibold rounded-full ${planBadge[company.subscriptionPlan] ?? 'bg-gray-100 text-gray-600'}`}>
                          {company.subscriptionPlan}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className={`px-2 py-0.5 inline-flex text-xs font-semibold rounded-full ${statusBadge[company.subscriptionStatus] ?? 'bg-gray-100 text-gray-600'}`}>
                          {company.subscriptionStatus}
                        </span>
                      </td>

                      {/* Users */}
                      <td className="px-5 py-4 whitespace-nowrap text-sm text-gray-700">
                        {company._count?.users ?? 0}
                      </td>

                      {/* Tasks */}
                      <td className="px-5 py-4 whitespace-nowrap text-sm text-gray-700">
                        {company._count?.tasks ?? 0}
                      </td>

                      {/* AI */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <button
                          onClick={() => handleToggleAI(company.id, company.aiEnabled)}
                          title={company.aiEnabled ? 'Disable AI' : 'Enable AI'}
                          className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg transition
                            ${company.aiEnabled ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                          </svg>
                          {company.aiEnabled ? 'On' : 'Off'}
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {/* View */}
                          <ActionBtn title="View Details" color="text-blue-600 hover:bg-blue-50"
                            onClick={() => navigate(`/admin/companies/${company.id}`)}>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </ActionBtn>

                          {/* Edit */}
                          <ActionBtn title="Edit Company" color="text-indigo-600 hover:bg-indigo-50"
                            onClick={() => navigate(`/admin/companies/${company.id}/edit`)}>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </ActionBtn>

                          {/* Reset password */}
                          <ActionBtn title="Reset Admin Password" color="text-orange-500 hover:bg-orange-50"
                            onClick={() => setResetTarget(company)}>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                          </ActionBtn>

                          {/* Delete */}
                          <ActionBtn title="Delete Company" color="text-red-500 hover:bg-red-50"
                            onClick={() => handleDeleteCompany(company.id, company.name)}>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </ActionBtn>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {companies.length === 0 && !loading && (
            <div className="text-center py-16">
              <p className="text-4xl mb-3">🏢</p>
              <p className="text-gray-500 font-medium mb-4">No companies yet</p>
              <button onClick={() => navigate('/admin/companies/create')}
                className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition font-semibold">
                Create First Company
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Small action button helper ────────────────────────────────────────────────
function ActionBtn({ title, color, onClick, children }: {
  title: string; color: string; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} title={title}
      className={`p-1.5 rounded-lg transition ${color}`}>
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {children}
      </svg>
    </button>
  );
}
