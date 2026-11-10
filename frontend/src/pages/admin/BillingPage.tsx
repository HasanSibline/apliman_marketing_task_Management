import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  ArrowPathIcon,
  BanknotesIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  UserMinusIcon,
} from '@heroicons/react/24/outline'
import Avatar from '@/components/common/Avatar'
import { confirmDialog } from '@/components/ui/confirm'
import RecordPaymentModal from '@/components/billing/RecordPaymentModal'
import InvoiceView from '@/components/billing/InvoiceView'
import {
  STATE_BADGE,
  STATE_LABEL,
  describeDaysLeft,
  formatDate,
  formatLimit,
  formatMoney,
  formatPlanPrice,
  planLabel,
} from '@/components/billing/subscription'
import { billingApi, type BillingCompany, type BillingSummary, type InvoiceRecord } from '@/services/api'

type Filter = 'ALL' | 'ATTENTION' | 'DUE_SOON' | 'GRACE' | 'EXPIRED' | 'TRIAL' | 'OVER_LIMIT' | 'SUSPENDED'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'ATTENTION', label: 'Needs attention' },
  { key: 'DUE_SOON', label: 'Due soon' },
  { key: 'GRACE', label: 'Grace' },
  { key: 'EXPIRED', label: 'Expired' },
  { key: 'TRIAL', label: 'Trial' },
  { key: 'OVER_LIMIT', label: 'Over limit' },
  { key: 'SUSPENDED', label: 'Suspended' },
]

/** The same rule the server counts `needsAttention` by, so the tile and the filter agree. */
function needsAttention(c: BillingCompany): boolean {
  return (
    c.state === 'DUE_SOON' || c.state === 'GRACE' || c.state === 'EXPIRED' || c.state === 'TRIAL' || c.overLimitBy > 0
  )
}

function matches(c: BillingCompany, filter: Filter): boolean {
  switch (filter) {
    case 'ALL':
      return true
    case 'ATTENTION':
      return needsAttention(c)
    case 'OVER_LIMIT':
      return c.overLimitBy > 0
    default:
      return c.state === filter
  }
}

/** Most urgent first: blocked, then grace, then due, then the rest by renewal date. */
const URGENCY: Record<string, number> = { EXPIRED: 0, GRACE: 1, DUE_SOON: 2, TRIAL: 3, SUSPENDED: 4, ACTIVE: 5 }

function Tile({
  label,
  value,
  tone,
  onClick,
  active,
}: {
  label: string
  value: string | number
  tone?: string
  onClick?: () => void
  active?: boolean
}) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={`surface px-4 py-3.5 text-left transition-colors ${
        onClick ? 'hover:ring-2 hover:ring-primary-200 dark:hover:ring-primary-900/50 focus:outline-none focus:ring-2 focus:ring-primary-500' : ''
      } ${active ? 'ring-2 ring-primary-500' : ''}`}
    >
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tone ?? 'text-gray-900 dark:text-white'}`}>{value}</p>
    </Comp>
  )
}

/**
 * Who has paid, who is due, and who is about to lose access.
 *
 * The super admin's one place for money. Every state shown is the server's, worked
 * out from each company's dates, so this page never decides that a company is due or
 * blocked; it reports it, and gives the two actions that change it: record a payment
 * (which extends the subscription and files an invoice record) and bring an
 * over-limit company back within its plan.
 */
export default function BillingPage() {
  const [tab, setTab] = useState<'companies' | 'invoices'>('companies')
  const [filter, setFilter] = useState<Filter>('ATTENTION')
  const [summary, setSummary] = useState<BillingSummary | null>(null)
  const [companies, setCompanies] = useState<BillingCompany[]>([])
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [invoicesLoading, setInvoicesLoading] = useState(false)
  const [invoicesLoaded, setInvoicesLoaded] = useState(false)
  const [paying, setPaying] = useState<BillingCompany | null>(null)
  const [viewing, setViewing] = useState<InvoiceRecord | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const request = useRef(0)

  const load = async () => {
    const mine = ++request.current
    try {
      setLoading(true)
      setLoadError(null)
      const data = await billingApi.overview({ quiet: true })
      if (mine !== request.current) return
      setSummary(data.summary)
      setCompanies(Array.isArray(data.companies) ? data.companies : [])
    } catch (err: any) {
      if (mine !== request.current) return
      setLoadError(err?.response?.data?.message || 'The billing overview could not be loaded.')
    } finally {
      if (mine === request.current) setLoading(false)
    }
  }

  const loadInvoices = async () => {
    try {
      setInvoicesLoading(true)
      setInvoices(await billingApi.invoices())
      setInvoicesLoaded(true)
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Invoices could not be loaded')
    } finally {
      setInvoicesLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (tab === 'invoices' && !invoicesLoaded) loadInvoices()
  }, [tab])

  // When nothing needs attention, opening on an empty "Needs attention" list reads
  // as broken. Show everyone instead.
  useEffect(() => {
    if (!loading && filter === 'ATTENTION' && companies.length > 0 && !companies.some(needsAttention)) {
      setFilter('ALL')
    }
  }, [loading])

  const visible = useMemo(
    () =>
      companies
        .filter((c) => matches(c, filter))
        .sort((a, b) => {
          const u = (URGENCY[a.state] ?? 9) - (URGENCY[b.state] ?? 9)
          if (u !== 0) return u
          return (a.daysLeft ?? Number.MAX_SAFE_INTEGER) - (b.daysLeft ?? Number.MAX_SAFE_INTEGER)
        }),
    [companies, filter],
  )

  const billingEmailFor = (companyId: string) => companies.find((c) => c.id === companyId)?.billingEmail ?? null

  const applyLimit = async (c: BillingCompany) => {
    const ok = await confirmDialog({
      title: `Bring ${c.name} within its user limit?`,
      description: `${c.name} has ${c.activeUsers} active users and its plan allows ${formatLimit(c.maxUsers)}. Up to ${c.overLimitBy} user${c.overLimitBy === 1 ? '' : 's'} will be deactivated, newest first. Company admins are never deactivated. Deactivated users can be reactivated later.`,
      confirmText: 'Deactivate users',
      variant: 'danger',
    })
    if (!ok) return
    try {
      setBusyId(c.id)
      const result = await billingApi.applyUserLimit(c.id)
      const names = result.retired.map((u) => u.name || u.email).join(', ')
      if (result.retired.length > 0) {
        toast.success(
          `${result.retired.length} user${result.retired.length === 1 ? '' : 's'} deactivated: ${names}`,
          { duration: 8000 },
        )
      } else {
        toast('Nobody could be deactivated: the users over the limit are all company admins.', { duration: 8000 })
      }
      await load()
    } catch (err: any) {
      const message = err?.response?.data?.message
      toast.error(Array.isArray(message) ? message.join(', ') : message || 'Could not apply the limit')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Billing</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Renewals, payments and plan limits for every company. A subscription that ends gets a 7-day grace
            period, then the company&apos;s users are blocked until a payment is recorded.
          </p>
        </div>
        <button type="button" onClick={() => (tab === 'invoices' ? loadInvoices() : load())} className="btn-secondary">
          <ArrowPathIcon className="h-4 w-4" /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b border-gray-200 dark:border-gray-700" role="tablist">
        {(
          [
            { key: 'companies', label: 'Companies' },
            { key: 'invoices', label: 'Invoices' },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? 'border-primary-600 text-primary-700 dark:text-primary-300'
                : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'companies' && (
        <>
          {loadError && (
            <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
              {loadError}{' '}
              <button type="button" onClick={load} className="font-semibold underline">Try again</button>
            </div>
          )}

          {/* Summary */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            <Tile label="Needs attention" value={summary?.needsAttention ?? '–'} tone={summary?.needsAttention ? 'text-amber-600 dark:text-amber-400' : undefined} onClick={() => setFilter('ATTENTION')} active={filter === 'ATTENTION'} />
            <Tile label="Due within 7 days" value={summary?.dueSoon ?? '–'} onClick={() => setFilter('DUE_SOON')} active={filter === 'DUE_SOON'} />
            <Tile label="In grace period" value={summary?.grace ?? '–'} tone={summary?.grace ? 'text-orange-600 dark:text-orange-400' : undefined} onClick={() => setFilter('GRACE')} active={filter === 'GRACE'} />
            <Tile label="Expired (blocked)" value={summary?.expired ?? '–'} tone={summary?.expired ? 'text-red-600 dark:text-red-400' : undefined} onClick={() => setFilter('EXPIRED')} active={filter === 'EXPIRED'} />
            <Tile label="On trial" value={summary?.trial ?? '–'} tone="text-blue-600 dark:text-blue-400" onClick={() => setFilter('TRIAL')} active={filter === 'TRIAL'} />
            <Tile label="Over user limit" value={summary?.overLimit ?? '–'} tone={summary?.overLimit ? 'text-red-600 dark:text-red-400' : undefined} onClick={() => setFilter('OVER_LIMIT')} active={filter === 'OVER_LIMIT'} />
            <Tile label="Collected this month" value={summary ? formatMoney(summary.collectedThisMonth) : '–'} tone="text-green-600 dark:text-green-400" />
          </div>

          {/* Filters */}
          <div className="mb-4 flex flex-wrap gap-2">
            {FILTERS.map((f) => {
              const count = companies.filter((c) => matches(c, f.key)).length
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    filter === f.key
                      ? 'bg-primary-600 text-white'
                      : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700 dark:hover:bg-gray-700'
                  }`}
                >
                  {f.label} <span className="opacity-70">{count}</span>
                </button>
              )
            })}
          </div>

          {/* Table */}
          <div className="surface overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800/60">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Renewal</th>
                  <th className="px-4 py-3">Users</th>
                  <th className="px-4 py-3">Last payment</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {loading && companies.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-500 dark:text-gray-400">Loading…</td>
                  </tr>
                )}
                {!loading && visible.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-500 dark:text-gray-400">
                      {companies.length === 0 ? 'No companies yet.' : 'No company matches this filter.'}
                    </td>
                  </tr>
                )}
                {visible.map((c) => {
                  const overdue = c.daysLeft !== null && c.daysLeft < 0
                  return (
                    <tr key={c.id} className="align-top">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar src={c.logo ?? undefined} name={c.name} size="sm" rounded="lg" />
                          <div className="min-w-0">
                            <Link to={`/admin/companies/${c.id}`} className="font-semibold text-gray-900 hover:text-primary-700 dark:text-white dark:hover:text-primary-300">
                              {c.name}
                            </Link>
                            <p className="truncate text-xs text-gray-500 dark:text-gray-400">{c.billingEmail || `/${c.slug}`}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 dark:text-white">{planLabel(c.plan)}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{formatPlanPrice(c.monthlyPrice)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`status-badge ${STATE_BADGE[c.state] ?? ''}`}>{STATE_LABEL[c.state] ?? c.state}</span>
                        {c.state === 'GRACE' && c.graceEndsAt && (
                          <p className="mt-1 text-xs text-orange-700 dark:text-orange-300">Blocks on {formatDate(c.graceEndsAt)}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-gray-900 dark:text-white">{formatDate(c.subscriptionEnd)}</p>
                        {c.daysLeft !== null && (
                          <p className={`text-xs ${overdue ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                            {overdue ? `Overdue, ended ${describeDaysLeft(c.daysLeft)}` : `Ends ${describeDaysLeft(c.daysLeft)}`}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className={`tabular-nums ${c.overLimitBy > 0 ? 'font-semibold text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                          {c.activeUsers} / {formatLimit(c.maxUsers)}
                        </p>
                        {c.overLimitBy > 0 && (
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                            <ExclamationTriangleIcon className="h-3.5 w-3.5" /> {c.overLimitBy} over the limit
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {c.lastInvoice ? (
                          <>
                            <p className="text-gray-900 dark:text-white">{formatMoney(c.lastInvoice.amount)}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {c.lastInvoice.number}, {formatDate(c.lastInvoice.paidAt)}
                            </p>
                          </>
                        ) : (
                          <span className="text-xs text-gray-400">None recorded</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-2">
                          <button type="button" onClick={() => setPaying(c)} className="btn-primary px-3 py-1.5 text-xs">
                            <BanknotesIcon className="h-4 w-4" /> Record payment
                          </button>
                          {c.overLimitBy > 0 && (
                            <button
                              type="button"
                              onClick={() => applyLimit(c)}
                              disabled={busyId === c.id}
                              className="btn-secondary px-3 py-1.5 text-xs text-red-600 dark:text-red-400"
                            >
                              <UserMinusIcon className="h-4 w-4" /> {busyId === c.id ? 'Applying…' : 'Apply limit'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'invoices' && (
        <div className="surface overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800/60">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Paid</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
              {invoicesLoading && invoices.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-500 dark:text-gray-400">Loading…</td>
                </tr>
              )}
              {!invoicesLoading && invoices.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-500 dark:text-gray-400">
                    No payments recorded yet. Use "Record payment" on the Companies tab.
                  </td>
                </tr>
              )}
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-900 dark:text-white">{inv.number}</td>
                  <td className="px-4 py-3">
                    <Link to={`/admin/companies/${inv.companyId}`} className="text-gray-900 hover:text-primary-700 dark:text-white dark:hover:text-primary-300">
                      {inv.companyName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{planLabel(inv.plan)}</td>
                  <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
                    {formatDate(inv.periodStart)} to {formatDate(inv.periodEnd)}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
                    {formatDate(inv.paidAt)}
                    {inv.method ? `, ${inv.method}` : ''}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900 dark:text-white">
                    {formatMoney(inv.amount, inv.currency)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => setViewing(inv)} className="btn-secondary px-3 py-1.5 text-xs">
                      <DocumentTextIcon className="h-4 w-4" /> View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RecordPaymentModal
        company={paying}
        onClose={() => setPaying(null)}
        onRecorded={() => {
          load()
          if (invoicesLoaded) loadInvoices()
          window.dispatchEvent(new CustomEvent('billing:changed'))
        }}
      />
      <InvoiceView invoice={viewing} billingEmail={viewing ? billingEmailFor(viewing.companyId) : null} onClose={() => setViewing(null)} />
    </div>
  )
}
