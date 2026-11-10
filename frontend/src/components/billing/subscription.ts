import type { SubscriptionState } from '@/services/api'

/**
 * How each subscription state reads, everywhere it is shown.
 *
 * The state itself is always the server's, computed from the company's dates. Nothing
 * here decides whether a company is due or blocked; it only says so consistently.
 *
 * Colours follow the app's rule that `blue-*` is semantic status: a trial is blue, as
 * the TRIAL plan is elsewhere. Amber warns, red means access is ending or gone.
 */
export const STATE_LABEL: Record<SubscriptionState, string> = {
  ACTIVE: 'Active',
  TRIAL: 'Trial',
  DUE_SOON: 'Due soon',
  GRACE: 'Grace period',
  EXPIRED: 'Expired, blocked',
  SUSPENDED: 'Suspended',
}

export const STATE_BADGE: Record<SubscriptionState, string> = {
  ACTIVE: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  TRIAL: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  DUE_SOON: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  GRACE: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  EXPIRED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  SUSPENDED: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
}

export const PAYMENT_METHODS = ['Bank transfer', 'Cash', 'Card', 'Other'] as const

export function formatDate(value: string | null | undefined): string {
  if (!value) return 'No end date'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 'No end date'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatMoney(amount: number | null | undefined, currency = 'USD'): string {
  const n = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n)
  } catch {
    return `$${n.toFixed(2)}`
  }
}

/** A plan's price as people say it: "Free" at zero, otherwise per month. */
export function formatPlanPrice(price: number | null | undefined): string {
  if (!price) return 'Free'
  return `${formatMoney(price)}/mo`
}

/** -1 is how the platform stores "no limit". */
export function formatLimit(value: number | null | undefined): string {
  if (value === -1) return 'Unlimited'
  if (value === null || value === undefined) return 'Not set'
  return value.toLocaleString()
}

/** "in 5 days", "today", "3 days ago": how far the renewal date is, in words. */
export function describeDaysLeft(daysLeft: number | null | undefined): string {
  if (daysLeft === null || daysLeft === undefined) return ''
  if (daysLeft === 0) return 'today'
  if (daysLeft === 1) return 'tomorrow'
  if (daysLeft === -1) return '1 day ago'
  return daysLeft > 0 ? `in ${daysLeft} days` : `${Math.abs(daysLeft)} days ago`
}

/** Plan names are stored as FREE_TRIAL and the like; this is how they are said. */
export function planLabel(name: string | null | undefined): string {
  if (!name) return 'Unknown plan'
  if (name === 'FREE_TRIAL') return 'Free trial'
  if (name === 'PRO') return 'Pro'
  if (name === 'ENTERPRISE') return 'Enterprise'
  return name
}
