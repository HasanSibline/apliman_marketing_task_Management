import { useEffect, useState } from 'react'
import { XMarkIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import api, { type CompanySubscription } from '@/services/api'
import { useAppSelector } from '@/hooks/redux'
import { formatDate } from './subscription'

const ROLES_THAT_SEE_IT = new Set(['COMPANY_ADMIN', 'ADMIN'])

function dismissKey(sub: CompanySubscription): string {
  return `subscription-banner:${sub.state}:${sub.subscriptionEnd ?? ''}`
}

/**
 * Tells a company's admins that their subscription needs attention, while there is
 * still time to act.
 *
 * Only admins see it: they are the ones who can renew, and an employee told that
 * access is about to end can do nothing but worry. Dismissing it lasts for the browser
 * session and for that state only, so moving from "due soon" into the grace period
 * brings it back, which is the point at which it matters most.
 *
 * A failed fetch shows nothing. The banner is advice, and the server enforces the
 * rule on its own whatever this component manages to show.
 */
export default function SubscriptionBanner() {
  const { user } = useAppSelector((state) => state.auth)
  const [sub, setSub] = useState<CompanySubscription | null>(null)
  const [dismissed, setDismissed] = useState(false)

  const eligible = !!user && ROLES_THAT_SEE_IT.has(String(user.role))

  useEffect(() => {
    if (!eligible) return
    let cancelled = false
    api
      .get('/companies/my-company', { quiet: true })
      .then(({ data }) => {
        if (cancelled) return
        const next: CompanySubscription | undefined = data?.subscription
        if (!next) return
        setSub(next)
        try {
          setDismissed(sessionStorage.getItem(dismissKey(next)) === '1')
        } catch {
          setDismissed(false)
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [eligible, user?.companyId])

  if (!eligible || !sub || dismissed) return null

  let message: string | null = null
  if (sub.state === 'TRIAL') message = `Your free trial ends on ${formatDate(sub.subscriptionEnd)}.`
  else if (sub.state === 'DUE_SOON') message = `Your subscription renews on ${formatDate(sub.subscriptionEnd)}. Contact us to renew.`
  else if (sub.state === 'GRACE')
    message = `Your subscription ended on ${formatDate(sub.subscriptionEnd)}. Access will be blocked on ${formatDate(sub.graceEndsAt)} unless it is renewed.`
  if (!message) return null

  const urgent = sub.state === 'GRACE'
  const dismiss = () => {
    try {
      sessionStorage.setItem(dismissKey(sub), '1')
    } catch {
      // Private mode or blocked storage: it simply comes back on the next page load.
    }
    setDismissed(true)
  }

  return (
    <div
      role={urgent ? 'alert' : 'status'}
      className={`flex items-start gap-3 border-b px-4 py-2.5 text-sm sm:px-6 ${
        urgent
          ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200'
          : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200'
      }`}
    >
      <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 flex-shrink-0" aria-hidden="true" />
      <p className="flex-1">{message}</p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="rounded p-0.5 opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
      >
        <XMarkIcon className="h-4 w-4" />
      </button>
    </div>
  )
}
