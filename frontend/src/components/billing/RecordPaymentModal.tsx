import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import FormDialog from '@/components/ui/FormDialog'
import { BanknotesIcon } from '@heroicons/react/24/outline'
import { billingApi, plansApi, type InvoiceRecord, type PlanRecord, type SubscriptionState } from '@/services/api'
import { PAYMENT_METHODS, formatDate, formatMoney, planLabel } from './subscription'

interface PayingCompany {
  id: string
  name: string
  plan: string
  monthlyPrice: number
  subscriptionEnd: string | null
}

interface Props {
  company: PayingCompany | null
  onClose: () => void
  onRecorded: (result: { invoice: InvoiceRecord; subscriptionEnd: string; state: SubscriptionState }) => void
}

function todayIso(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Records a payment received outside the app, which the server turns into a numbered
 * invoice record and an extension of the subscription.
 *
 * No money moves here. The super admin is writing down what already arrived by bank
 * transfer, cash or card, so the platform's record of who has paid is not a memory.
 */
export default function RecordPaymentModal({ company, onClose, onRecorded }: Props) {
  const [months, setMonths] = useState(1)
  const [amount, setAmount] = useState('')
  const [amountTouched, setAmountTouched] = useState(false)
  const [paidAt, setPaidAt] = useState(todayIso())
  const [method, setMethod] = useState<string>(PAYMENT_METHODS[0])
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [plans, setPlans] = useState<PlanRecord[]>([])
  const [plan, setPlan] = useState('')

  useEffect(() => {
    plansApi.list().then(setPlans).catch(() => setPlans([]))
  }, [])

  // A fresh form each time it opens, for whichever company it opens on.
  useEffect(() => {
    if (!company) return
    setMonths(1)
    // A trial that pays is converting, so the payment defaults to the first paid plan.
    setPlan(company.plan === 'FREE_TRIAL' ? 'PRO' : company.plan)
    setAmount(company.monthlyPrice ? String(company.monthlyPrice) : '')
    setAmountTouched(false)
    setPaidAt(todayIso())
    setMethod(PAYMENT_METHODS[0])
    setReference('')
    setNote('')
  }, [company?.id])

  // The price of the plan being paid for: the chosen plan's, or the company's own.
  const monthlyPrice =
    plan && company && plan !== company.plan
      ? plans.find((p) => p.name === plan)?.price ?? company.monthlyPrice
      : company?.monthlyPrice ?? 0

  // The amount follows price × months until someone types their own figure.
  useEffect(() => {
    if (!company || amountTouched) return
    const total = (monthlyPrice || 0) * months
    setAmount(total ? String(Math.round(total * 100) / 100) : '')
  }, [months, monthlyPrice, amountTouched])

  // Where the paid period will end, worked out the way the server does: from the
  // later of today and the current end date.
  const extendsTo = (() => {
    if (!company) return null
    const now = new Date()
    const currentEnd = company.subscriptionEnd ? new Date(company.subscriptionEnd) : null
    const from = currentEnd && currentEnd > now ? currentEnd : now
    // In UTC, as the server does it, so the preview never differs by a day.
    const end = new Date(from)
    const day = end.getUTCDate()
    end.setUTCMonth(end.getUTCMonth() + months)
    if (end.getUTCDate() !== day) end.setUTCDate(0)
    return end.toISOString()
  })()

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!company) return
    const value = Number(amount)
    if (!Number.isFinite(value) || value < 0) {
      toast.error('Enter the amount that was paid')
      return
    }
    if (!Number.isInteger(months) || months < 1 || months > 36) {
      toast.error('Months must be between 1 and 36')
      return
    }
    try {
      setSaving(true)
      const result = await billingApi.recordPayment(company.id, {
        amount: value,
        months,
        paidAt: paidAt ? new Date(`${paidAt}T12:00:00`).toISOString() : undefined,
        method: method || undefined,
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
        // Only a change the picker showed: if the plans failed to load, there was no picker.
        plan: plans.length > 0 && plan && plan !== company.plan ? plan : undefined,
      })
      toast.success(`Payment recorded as invoice ${result.invoice.number}`)
      onRecorded(result)
      onClose()
    } catch (err: any) {
      const message = err?.response?.data?.message
      toast.error(Array.isArray(message) ? message.join(', ') : message || 'Could not record that payment')
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormDialog
      isOpen={!!company}
      onClose={onClose}
      title="Record payment"
      description={company ? `${company.name}, ${planLabel(company.plan)} plan` : undefined}
      icon={<BanknotesIcon className="h-5 w-5" />}
      width="sm"
      busy={saving}
      onSubmit={submit}
      footer={
        <>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Record payment'}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary" disabled={saving}>
            Cancel
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {plans.length > 0 && (
          <div>
            <label htmlFor="pay-plan" className="form-label">Plan paid for</label>
            <select id="pay-plan" value={plan} onChange={(e) => setPlan(e.target.value)} className="input-field">
              {plans.map((p) => (
                <option key={p.id} value={p.name}>
                  {planLabel(p.name)}
                  {p.name === company?.plan ? ' (current)' : ''}
                </option>
              ))}
            </select>
            {company && plan && plan !== company.plan && (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                The company moves from {planLabel(company.plan)} to {planLabel(plan)} with this payment.
              </p>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="pay-months" className="form-label">Months paid</label>
            <input
              id="pay-months"
              type="number"
              min={1}
              max={36}
              value={months}
              onChange={(e) => setMonths(Math.max(1, Math.min(36, parseInt(e.target.value, 10) || 1)))}
              className="input-field"
            />
          </div>
          <div>
            <label htmlFor="pay-amount" className="form-label">Amount (USD)</label>
            <input
              id="pay-amount"
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => {
                setAmountTouched(true)
                setAmount(e.target.value)
              }}
              className="input-field"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="pay-date" className="form-label">Paid on</label>
            <input id="pay-date" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className="input-field" />
          </div>
          <div>
            <label htmlFor="pay-method" className="form-label">Method</label>
            <select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value)} className="input-field">
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="pay-ref" className="form-label">Reference <span className="font-normal text-gray-400">(optional)</span></label>
          <input
            id="pay-ref"
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Bank transfer ID, receipt number…"
            className="input-field"
          />
        </div>

        <div>
          <label htmlFor="pay-note" className="form-label">Note <span className="font-normal text-gray-400">(optional)</span></label>
          <textarea id="pay-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="input-field" />
        </div>

        {company && (
          <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-sm text-gray-600 dark:bg-gray-800/60 dark:text-gray-300">
            {formatMoney(Number(amount) || 0)} for {months} month{months === 1 ? '' : 's'}. The subscription
            will run until <span className="font-semibold text-gray-900 dark:text-white">{formatDate(extendsTo)}</span>.
          </div>
        )}
      </div>
    </FormDialog>
  )
}
