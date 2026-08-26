import { useState, useEffect, useRef } from 'react';
import { confirmDialog } from '@/components/ui/confirm'
import { useParams, useNavigate } from 'react-router-dom';
import api from '@/services/api';
import toast from 'react-hot-toast';
import Avatar from '@/components/common/Avatar';
import FormDialog from '@/components/ui/FormDialog';
import AiProviderChain from '@/components/admin/AiProviderChain';
import {
  ArrowLeftIcon,
  PencilSquareIcon,
  KeyIcon,
  CalendarDaysIcon,
  NoSymbolIcon,
  CheckCircleIcon,
  TrashIcon,
  ClipboardDocumentIcon,
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
  subscriptionStart: string;
  subscriptionEnd?: string;
  monthlyPrice: number;
  maxUsers: number;
  maxTasks: number;
  maxStorage: number;
  billingEmail?: string;
  createdAt: string;
  aiKeySet?: boolean;
  aiProviders?: {
    total: number;
    healthy: number;
    enabled: number;
    hasFallback: boolean;
  };
  stats?: {
    totalUsers: number;
    activeTasks: number;
    completedTasks: number;
    workflowsCount: number;
    chatSessionsCount: number;
    departmentsCount: number;
    ticketsCount: number;
    aiMessagesCount: number;
    aiTokensUsed: number;
    aiTotalCost: number;
  };
}

const PLAN_BADGE: Record<string, string> = {
  FREE_TRIAL: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200',
  PRO: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  ENTERPRISE: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
};
const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  TRIAL: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  EXPIRED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  SUSPENDED: 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
};

function StatTile({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="surface px-4 py-3.5">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${accent ?? 'text-gray-900 dark:text-white'}`}>
        {value}
      </p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-sm font-semibold text-gray-900 dark:text-white text-right">{value}</span>
    </div>
  );
}

export default function CompanyDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [showResetPassword, setShowResetPassword] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [issuedCredentials, setIssuedCredentials] = useState<{ email: string; password: string } | null>(null);

  const [showExtendSubscription, setShowExtendSubscription] = useState(false);
  const [extensionDays, setExtensionDays] = useState(30);

  useEffect(() => {
    if (id) fetchCompany();
  }, [id]);

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
      toast.success('Company suspended');
      await fetchCompany();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to suspend company');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReactivate = async () => {
    try {
      setActionLoading(true);
      await api.post(`/companies/${id}/reactivate`);
      toast.success('Company reactivated');
      await fetchCompany();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to reactivate company');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!company) return;
    if (!(await confirmDialog({
      title: `Delete ${company.name}?`,
      description:
        'Every user, task, workflow and conversation belonging to this company is deleted permanently. There is no undo and no backup.',
      confirmText: 'Delete company',
      variant: 'danger',
    }))) return;
    try {
      setActionLoading(true);
      await api.delete(`/companies/${id}`);
      toast.success(`Company "${company.name}" deleted`);
      navigate('/admin/companies');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete company');
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
      setIssuedCredentials({ email: data?.email ?? email, password: data?.newPassword ?? '' });
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to reset password');
    } finally {
      setActionLoading(false);
    }
  };

  const handleExtendSubscription = async () => {
    try {
      setActionLoading(true);
      await api.post(`/companies/${id}/extend-subscription`, { days: extensionDays });
      setShowExtendSubscription(false);
      toast.success('Subscription extended');
      await fetchCompany();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to extend subscription');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="spinner h-10 w-10" />
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-error-700 dark:border-error-900/40 dark:bg-error-900/20 dark:text-error-300">
          {error || 'Company not found'}
        </div>
        <button
          onClick={() => navigate('/admin/companies')}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-800 dark:text-primary-400"
        >
          <ArrowLeftIcon className="h-4 w-4" /> Back to companies
        </button>
      </div>
    );
  }

  const daysUntilExpiry = company.subscriptionEnd
    ? Math.ceil((new Date(company.subscriptionEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  const aiSummary = company.aiProviders ?? { total: 0, healthy: 0, enabled: 0, hasFallback: false };
  const aiHealthLabel =
    aiSummary.total === 0
      ? 'Not configured'
      : aiSummary.healthy > 0
        ? `${aiSummary.healthy} of ${aiSummary.total} healthy`
        : 'Configured, none healthy';
  const aiHealthClass =
    aiSummary.total === 0
      ? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
      : aiSummary.healthy > 0
        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';

  return (
    <div className="mx-auto max-w-6xl">
      {/* Back */}
      <button
        onClick={() => navigate('/admin/companies')}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white"
      >
        <ArrowLeftIcon className="h-4 w-4" /> Back to companies
      </button>

      {/* Header */}
      <div className="surface mb-6 flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="flex items-center gap-4">
          <Avatar src={company.logo} name={company.name} size="lg" rounded="xl" className="h-16 w-16" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{company.name}</h1>
              <span className={`status-badge ${PLAN_BADGE[company.subscriptionPlan] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}>
                {company.subscriptionPlan}
              </span>
              <span className={`status-badge ${STATUS_BADGE[company.subscriptionStatus] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}>
                {company.subscriptionStatus}
              </span>
              {!company.isActive && (
                <span className="status-badge bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                  Suspended
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              /{company.slug} · Created {new Date(company.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={() => navigate(`/admin/companies/${id}/edit`)} className="btn-secondary">
            <PencilSquareIcon className="h-4 w-4" /> Edit
          </button>
          {company.isActive ? (
            <button onClick={handleSuspend} disabled={actionLoading} className="btn-secondary text-red-600 dark:text-red-400">
              <NoSymbolIcon className="h-4 w-4" /> Suspend
            </button>
          ) : (
            <button onClick={handleReactivate} disabled={actionLoading} className="btn-primary">
              <CheckCircleIcon className="h-4 w-4" /> Reactivate
            </button>
          )}
        </div>
      </div>

      {/* Operational stats */}
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Users" value={company.stats?.totalUsers ?? 0} />
        <StatTile label="Departments" value={company.stats?.departmentsCount ?? 0} />
        <StatTile label="Workflows" value={company.stats?.workflowsCount ?? 0} />
        <StatTile label="Active tasks" value={company.stats?.activeTasks ?? 0} accent="text-blue-600 dark:text-blue-400" />
        <StatTile label="Completed tasks" value={company.stats?.completedTasks ?? 0} accent="text-green-600 dark:text-green-400" />
        <StatTile label="Tickets" value={company.stats?.ticketsCount ?? 0} />
      </div>

      {/* AI usage stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="AI messages" value={(company.stats?.aiMessagesCount ?? 0).toLocaleString()} accent="text-purple-600 dark:text-purple-400" />
        <StatTile label="Tokens used" value={(company.stats?.aiTokensUsed ?? 0).toLocaleString()} accent="text-purple-600 dark:text-purple-400" />
        <StatTile label="AI cost" value={`$${(company.stats?.aiTotalCost ?? 0).toFixed(2)}`} accent="text-purple-600 dark:text-purple-400" />
        <StatTile label="Chat sessions" value={company.stats?.chatSessionsCount ?? 0} accent="text-purple-600 dark:text-purple-400" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-6 lg:col-span-2">
          <AiProviderChain companyId={company.id} companyName={company.name} />

          <div className="surface p-5">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Subscription</h2>
            <div className="mt-3 divide-y divide-gray-100 dark:divide-gray-700">
              <InfoRow label="Plan" value={company.subscriptionPlan} />
              <InfoRow label="Status" value={company.subscriptionStatus} />
              <InfoRow label="Started" value={new Date(company.subscriptionStart).toLocaleDateString()} />
              {company.subscriptionEnd && (
                <InfoRow
                  label="Expires"
                  value={
                    <span className={daysUntilExpiry !== null && daysUntilExpiry < 7 ? 'text-red-600 dark:text-red-400' : ''}>
                      {new Date(company.subscriptionEnd).toLocaleDateString()}
                      {daysUntilExpiry !== null ? ` (${daysUntilExpiry}d)` : ''}
                    </span>
                  }
                />
              )}
              {company.billingEmail && <InfoRow label="Billing email" value={company.billingEmail} />}
            </div>
            <button
              onClick={() => setShowExtendSubscription(true)}
              className="btn-secondary mt-4 w-full justify-center"
            >
              <CalendarDaysIcon className="h-4 w-4" /> Extend subscription
            </button>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="surface p-5">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">AI status</h2>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400">Provider chain</span>
              <span className={`status-badge ${aiHealthClass}`}>{aiHealthLabel}</span>
            </div>
            {aiSummary.total > 0 && !aiSummary.hasFallback && (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                Only one provider is configured. If it hits a rate limit or runs out of
                quota, this company's assistant goes down with nothing to fall back to.
              </p>
            )}
            {aiSummary.total === 0 && (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                No providers configured yet. Add one below to switch AI on for this company.
              </p>
            )}
          </div>

          <div className="surface p-5">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Resource limits</h2>
            <div className="mt-3 divide-y divide-gray-100 dark:divide-gray-700">
              <InfoRow label="Max users" value={company.maxUsers === -1 ? 'Unlimited' : company.maxUsers} />
              <InfoRow label="Max tasks" value={company.maxTasks === -1 ? 'Unlimited' : company.maxTasks} />
              <InfoRow label="Max storage" value={company.maxStorage === -1 ? 'Unlimited' : `${company.maxStorage} GB`} />
            </div>
          </div>

          <div className="surface p-5">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Admin access</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Issue a new password for this company's admin account.
            </p>
            <button onClick={() => setShowResetPassword(true)} className="btn-secondary mt-3 w-full justify-center">
              <KeyIcon className="h-4 w-4" /> Reset admin password
            </button>
          </div>

          <div className="rounded-xl border border-red-200 bg-red-50/60 p-5 dark:border-red-900/40 dark:bg-red-900/10">
            <h2 className="text-base font-semibold text-red-800 dark:text-red-300">Danger zone</h2>
            <p className="mt-1 text-xs text-red-700/80 dark:text-red-300/80">
              Deletes every user, task, workflow and conversation for this company. This
              cannot be undone.
            </p>
            <button
              onClick={handleDelete}
              disabled={actionLoading}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:bg-transparent dark:text-red-400 dark:hover:bg-red-900/20"
            >
              <TrashIcon className="h-4 w-4" /> Delete company
            </button>
          </div>
        </div>
      </div>

      {/* Reset password */}
      <FormDialog
        isOpen={showResetPassword}
        onClose={() => setShowResetPassword(false)}
        title="Reset admin password"
        description="A new password is generated and shown to you once, so you can pass it on."
        width="sm"
        busy={actionLoading}
        footer={
          <>
            <button type="button" onClick={() => setShowResetPassword(false)} className="btn-secondary" disabled={actionLoading}>
              Cancel
            </button>
            <button type="button" onClick={handleResetPassword} className="btn-primary" disabled={actionLoading}>
              {actionLoading ? 'Resetting…' : 'Reset password'}
            </button>
          </>
        }
      >
        <label htmlFor="reset-admin-email" className="form-label">Admin email</label>
        <input
          id="reset-admin-email"
          type="email"
          value={adminEmail}
          onChange={(e) => setAdminEmail(e.target.value)}
          placeholder="admin@company.com"
          className="input-field"
        />
        <p className="form-hint">Must be the login address of a company admin on this account.</p>
      </FormDialog>

      {/* Issued credentials */}
      <FormDialog
        isOpen={!!issuedCredentials}
        onClose={() => setIssuedCredentials(null)}
        title="New admin password"
        description="Copy this now and share it securely. It is not stored anywhere you can read it again."
        width="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                if (!issuedCredentials) return;
                navigator.clipboard.writeText(`${issuedCredentials.email} / ${issuedCredentials.password}`);
                toast.success('Copied');
              }}
              className="btn-secondary"
            >
              <ClipboardDocumentIcon className="h-4 w-4" /> Copy
            </button>
            <button type="button" onClick={() => setIssuedCredentials(null)} className="btn-primary">
              Done
            </button>
          </>
        }
      >
        {issuedCredentials && (
          <div className="space-y-3">
            <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400">Admin email</p>
              <p className="break-all font-mono text-sm text-gray-900 dark:text-white">{issuedCredentials.email}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400">New password</p>
              <p className="break-all font-mono text-sm text-gray-900 dark:text-white">{issuedCredentials.password}</p>
            </div>
          </div>
        )}
      </FormDialog>

      {/* Extend subscription */}
      <FormDialog
        isOpen={showExtendSubscription}
        onClose={() => setShowExtendSubscription(false)}
        title="Extend subscription"
        description="How many days should be added to the current end date?"
        width="sm"
        busy={actionLoading}
        footer={
          <>
            <button type="button" onClick={() => setShowExtendSubscription(false)} className="btn-secondary" disabled={actionLoading}>
              Cancel
            </button>
            <button type="button" onClick={handleExtendSubscription} className="btn-primary" disabled={actionLoading}>
              {actionLoading ? 'Extending…' : 'Extend'}
            </button>
          </>
        }
      >
        <label htmlFor="extend-days" className="form-label">Days</label>
        <input
          id="extend-days"
          type="number"
          min={1}
          value={extensionDays}
          onChange={(e) => {
            const days = parseInt(e.target.value, 10);
            setExtensionDays(Number.isNaN(days) ? 1 : days);
          }}
          className="input-field"
        />
      </FormDialog>
    </div>
  );
}
