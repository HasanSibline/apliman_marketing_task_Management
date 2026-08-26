import { useState, useEffect, useMemo } from 'react';
import { confirmDialog } from '@/components/ui/confirm'
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import api from '@/services/api';
import toast from 'react-hot-toast';
import Avatar from '../components/common/Avatar';
import Select from '@/components/ui/Select';
import FormDialog from '@/components/ui/FormDialog';
import {
  MagnifyingGlassIcon,
  EyeIcon,
  PencilSquareIcon,
  KeyIcon,
  TrashIcon,
  BuildingOffice2Icon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';

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
  createdAt: string;
  adminEmail?: string;
  adminName?: string;
  aiProviders?: {
    total: number;
    healthy: number;
    enabled: number;
    hasFallback: boolean;
  };
  /**
   * Where the per-company counts actually live.
   *
   * `GET /companies` builds this and then sets `_count: undefined` on the way out
   * (companies.service.findAll), so reading `_count` gave undefined at every site and
   * the optional chaining turned that into a confident zero. Every row of the table
   * showed 0 users and 0 tasks, and the Total Users tile summed zeroes.
   */
  stats?: {
    usersCount: number;
    tasksCount: number;
    workflowsCount: number;
    chatSessionsCount: number;
    departmentsCount: number;
    ticketsCount: number;
    aiMessagesCount: number;
    aiTokensUsed: number;
    aiCost: number;
  };
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
    <FormDialog
      isOpen
      onClose={onClose}
      title="Reset admin password"
      description={company.name}
      width="sm"
      busy={loading}
      footer={
        <>
          <button onClick={onClose} className="btn-secondary" disabled={loading}>Cancel</button>
          <button
            disabled={!email.trim() || loading}
            onClick={async () => { setLoading(true); await onConfirm(email); setLoading(false); }}
            className="btn-primary"
          >
            {loading ? 'Resetting…' : 'Reset password'}
          </button>
        </>
      }
    >
      <label htmlFor="reset-email" className="form-label">Admin email</label>
      <input
        id="reset-email"
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        className="input-field"
        placeholder="admin@company.com"
      />
      <p className="form-hint">Must match the COMPANY_ADMIN user's email</p>
    </FormDialog>
  );
}

// ── Credentials Modal (shown after password reset) ─────────────────────────────
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
    <FormDialog
      isOpen
      onClose={onClose}
      title={title}
      description="Save these credentials, the password won't be shown again"
      width="sm"
      footer={
        <>
          <button
            onClick={() => {
              const all = data.filter(d => d.copyable).map(d => `${d.label}: ${d.value}`).join('\n');
              navigator.clipboard.writeText(all);
              toast.success('All credentials copied!');
            }}
            className="btn-secondary"
          >
            Copy all
          </button>
          <button onClick={onClose} className="btn-primary">I've saved it: close</button>
        </>
      }
    >
      <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-900/20">
        <span className="mt-0.5 text-amber-500">⚠️</span>
        <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
          This password is shown only once. Copy and share it with the company admin securely.
        </p>
      </div>
      <div className="space-y-3">
        {data.map(({ label, value, copyable }) => (
          <div key={label} className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/40">
            <div className="min-w-0 flex-1">
              <p className="mb-0.5 text-xs text-gray-500 dark:text-gray-400">{label}</p>
              <p className="truncate font-mono text-sm font-semibold text-gray-900 dark:text-white">{value}</p>
            </div>
            {copyable && (
              <button
                onClick={() => copy(value, label)}
                className={`ml-3 shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition
                  ${copied === label
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                    : 'bg-primary-100 text-primary-700 hover:bg-primary-200 dark:bg-primary-900/30 dark:text-primary-300'}`}
              >
                {copied === label ? '✓ Copied' : 'Copy'}
              </button>
            )}
          </div>
        ))}
      </div>
    </FormDialog>
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
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  useEffect(() => {
    if (user?.role !== 'SUPER_ADMIN') navigate('/dashboard');
  }, [user, navigate]);

  useEffect(() => { fetchCompanies(); }, []);

  const fetchCompanies = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/companies');
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
      const res = await api.post(`/companies/${resetTarget.id}/reset-admin-password`, { adminEmail: email });
      setResetTarget(null);
      const { newPassword } = res.data;
      const loginUrl = `${window.location.origin}/${resetTarget.slug}/login`;
      setCredentials({
        title: 'New admin credentials',
        data: [
          { label: 'Company', value: resetTarget.name },
          { label: 'Admin email', value: email, copyable: true },
          { label: 'New password', value: newPassword, copyable: true },
          { label: 'Login URL', value: loginUrl, copyable: true },
        ],
      });
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to reset password');
    }
  };

  const handleDeleteCompany = async (companyId: string, companyName: string) => {
    if (!(await confirmDialog({
      title: `Delete ${companyName}?`,
      description:
        'Every user, task, workflow and conversation belonging to this company is deleted permanently. There is no undo and no backup.',
      confirmText: 'Delete company',
      variant: 'danger',
    }))) return;
    try {
      await api.delete(`/companies/${companyId}`);
      toast.success(`Company "${companyName}" deleted`);
      fetchCompanies();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete company');
    }
  };

  const planBadge: Record<string, string> = {
    FREE: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200',
    FREE_TRIAL: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200',
    PRO: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
    ENTERPRISE: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300',
  };
  const statusBadge: Record<string, string> = {
    ACTIVE: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    TRIAL: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    EXPIRED: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
    SUSPENDED: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300',
  };

  /**
   * A real read of the provider chain, not `Company.aiEnabled`.
   *
   * That field is the legacy single key and stays false for a tenant configured
   * through the chain, which is what made every company on this table look like AI
   * was off for it. This reads the same rows the gateway walks.
   */
  const aiBadge = (company: Company) => {
    const p = company.aiProviders ?? { total: 0, healthy: 0, enabled: 0, hasFallback: false };
    if (p.total === 0) return { label: 'Not configured', cls: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400' };
    if (p.healthy > 0) return { label: p.hasFallback ? 'Healthy' : 'Healthy, no fallback', cls: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' };
    return { label: 'Degraded', cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' };
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return companies.filter((c) => {
      if (statusFilter !== 'ALL' && c.subscriptionStatus !== statusFilter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q) ||
        (c.adminEmail ?? '').toLowerCase().includes(q) ||
        (c.adminName ?? '').toLowerCase().includes(q)
      );
    });
  }, [companies, query, statusFilter]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="spinner h-12 w-12" />
    </div>
  );

  return (
    <div>
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

      {/* Header */}
      <div className="mb-6 flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="page-title">Companies</h1>
          <p className="mt-1 text-gray-500 dark:text-gray-400">Every tenant on the platform, in one place</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => navigate('/admin/plans')} className="btn-secondary">
            <Cog6ToothIcon className="h-5 w-5" />
            Plan Settings
          </button>
          <button onClick={() => navigate('/admin/companies/create')} className="btn-primary">
            + Create Company
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-error-700 dark:border-error-900/40 dark:bg-error-900/20 dark:text-error-300">
          <span>{error}</span>
          <button onClick={fetchCompanies} className="rounded-lg border border-error-300 px-3 py-1.5 text-sm font-semibold hover:bg-error-100 dark:border-error-800 dark:hover:bg-error-900/40">
            Try again
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        {[
          { label: 'Companies', value: companies.length, color: 'text-gray-900 dark:text-white' },
          { label: 'Active', value: companies.filter(c => c.subscriptionStatus === 'ACTIVE').length, color: 'text-green-600 dark:text-green-400' },
          { label: 'Trial', value: companies.filter(c => c.subscriptionStatus === 'TRIAL').length, color: 'text-blue-600 dark:text-blue-400' },
          { label: 'Suspended', value: companies.filter(c => !c.isActive || c.subscriptionStatus === 'SUSPENDED').length, color: 'text-red-600 dark:text-red-400' },
          { label: 'Total Users', value: companies.reduce((a, c) => a + (c.stats?.usersCount || 0), 0), color: 'text-indigo-600 dark:text-indigo-400' },
          { label: 'AI Healthy', value: companies.filter(c => (c.aiProviders?.healthy ?? 0) > 0).length, color: 'text-emerald-600 dark:text-emerald-400' },
        ].map(s => (
          <div key={s.label} className="surface p-5">
            <p className="text-sm text-gray-500 dark:text-gray-400">{s.label}</p>
            <p className={`text-3xl font-bold mt-1 tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Search / filter */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by company, slug or admin…"
            className="input-field pl-9"
          />
        </div>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="select-field w-auto">
          <option value="ALL">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="TRIAL">Trial</option>
          <option value="EXPIRED">Expired</option>
          <option value="SUSPENDED">Suspended</option>
        </Select>
      </div>

      {/* Table */}
      <div className="surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/40">
              <tr>
                {['Company', 'Admin', 'Plan', 'Status', 'Users', 'Tasks', 'AI', 'Actions'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {filtered.map(company => {
                const ai = aiBadge(company);
                return (
                  <tr
                    key={company.id}
                    onClick={() => navigate(`/admin/companies/${company.id}`)}
                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    {/* Company */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <Avatar src={company.logo} name={company.name} size="sm" rounded="lg" className="h-9 w-9" />
                        <div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">{company.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">/{company.slug}</p>
                        </div>
                      </div>
                    </td>

                    {/* Admin */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      {/* The server returns null here for a company with no COMPANY_ADMIN,
                          and this rendered a bare ", " in the column where a person's name
                          and login address belong: the remains of a placeholder character
                          that a find and replace removed. Say what is actually the case,
                          because "this company has nobody administering it" is exactly the
                          thing a super admin is scanning this table for. */}
                      {company.adminName ? (
                        <>
                          <p className="text-sm text-gray-800 dark:text-gray-100">{company.adminName}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{company.adminEmail}</p>
                        </>
                      ) : (
                        <p className="text-sm italic text-gray-400 dark:text-gray-500">No admin assigned</p>
                      )}
                    </td>

                    {/* Plan */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span className={`status-badge ${planBadge[company.subscriptionPlan] ?? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
                        {company.subscriptionPlan}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span className={`status-badge ${statusBadge[company.subscriptionStatus] ?? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
                        {company.subscriptionStatus}
                      </span>
                      {!company.isActive && (
                        <span className="ml-1.5 status-badge bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                          Suspended
                        </span>
                      )}
                    </td>

                    {/* Users */}
                    <td className="px-5 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-200 tabular-nums">
                      {company.stats?.usersCount ?? 0}
                    </td>

                    {/* Tasks */}
                    <td className="px-5 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-200 tabular-nums">
                      {company.stats?.tasksCount ?? 0}
                    </td>

                    {/* AI, read from the provider chain, not the legacy toggle */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span className={`status-badge ${ai.cls}`} title={`${company.aiProviders?.total ?? 0} provider(s) configured`}>
                        {ai.label}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        <ActionBtn title="View Details" color="text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                          onClick={() => navigate(`/admin/companies/${company.id}`)}>
                          <EyeIcon className="h-4 w-4" />
                        </ActionBtn>

                        <ActionBtn title="Edit Company" color="text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
                          onClick={() => navigate(`/admin/companies/${company.id}/edit`)}>
                          <PencilSquareIcon className="h-4 w-4" />
                        </ActionBtn>

                        <ActionBtn title="Reset Admin Password" color="text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/30"
                          onClick={() => setResetTarget(company)}>
                          <KeyIcon className="h-4 w-4" />
                        </ActionBtn>

                        <ActionBtn title="Delete Company" color="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
                          onClick={() => handleDeleteCompany(company.id, company.name)}>
                          <TrashIcon className="h-4 w-4" />
                        </ActionBtn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {companies.length === 0 && !loading && !error && (
          <div className="text-center py-16">
            <BuildingOffice2Icon className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
            <p className="mt-3 text-gray-500 dark:text-gray-400 font-medium mb-4">No companies yet</p>
            <button onClick={() => navigate('/admin/companies/create')} className="btn-primary">
              Create First Company
            </button>
          </div>
        )}

        {companies.length > 0 && filtered.length === 0 && (
          <div className="text-center py-16">
            <p className="text-gray-500 dark:text-gray-400">No company matches that search.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Small action button helper ────────────────────────────────────────────────
function ActionBtn({ title, color, onClick, children }: {
  title: string; color: string; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} title={title} aria-label={title}
      className={`p-1.5 rounded-lg transition ${color}`}>
      {children}
    </button>
  );
}
