import toast from 'react-hot-toast'
import FormDialog from '@/components/ui/FormDialog'
import { PrinterIcon } from '@heroicons/react/24/outline'
import { BRAND } from '@/config/brand'
import type { InvoiceRecord } from '@/services/api'
import { formatDate, formatMoney, planLabel } from './subscription'

interface Props {
  invoice: InvoiceRecord | null
  billingEmail?: string | null
  onClose: () => void
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/**
 * Prints the invoice from a window of its own.
 *
 * Printing the page itself and hiding everything else does not work here: the dialog
 * panel is transformed and clips its overflow, so a sheet inside it prints cut off or
 * misplaced. A separate document with its own plain stylesheet prints the same in every
 * browser, and "Save as PDF" from there gives just the invoice.
 */
function printInvoice(invoice: InvoiceRecord, billingEmail?: string | null) {
  const w = window.open('', '_blank', 'width=800,height=900')
  if (!w) return false
  const e = (v: string | null | undefined) => escapeHtml(v ?? '')
  const amount = formatMoney(invoice.amount, invoice.currency)
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${e(invoice.number)}</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #111; margin: 48px; }
  .row { display: flex; justify-content: space-between; gap: 24px; }
  .muted { color: #6b7280; font-size: 12px; }
  .label { color: #6b7280; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; margin: 0 0 4px; }
  h1 { font-size: 20px; margin: 0; } .num { font-family: ui-monospace, Consolas, monospace; font-size: 16px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-top: 32px; font-size: 14px; }
  th { text-align: left; color: #6b7280; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; border-bottom: 1px solid #d1d5db; padding: 8px 0; }
  td { padding: 12px 0; border-bottom: 1px solid #f3f4f6; } .r { text-align: right; }
  tfoot td { border: 0; font-weight: 700; } p { margin: 2px 0; }
</style></head><body>
  <div class="row">
    <div><h1>${e(BRAND.name)}</h1><p class="muted">Payment record</p></div>
    <div style="text-align:right"><p class="label">Invoice</p><p class="num">${e(invoice.number)}</p><p class="muted">Paid ${e(formatDate(invoice.paidAt))}</p></div>
  </div>
  <div class="row" style="margin-top:32px">
    <div><p class="label">Billed to</p><p><strong>${e(invoice.companyName)}</strong></p>${billingEmail ? `<p>${e(billingEmail)}</p>` : ''}</div>
    <div style="text-align:right"><p class="label">Payment</p><p>${e(invoice.method || 'Not recorded')}</p>${invoice.reference ? `<p>Ref. ${e(invoice.reference)}</p>` : ''}</div>
  </div>
  <table>
    <thead><tr><th>Description</th><th class="r">Amount</th></tr></thead>
    <tbody><tr><td><strong>${e(planLabel(invoice.plan))} plan subscription</strong><br><span class="muted">${e(formatDate(invoice.periodStart))} to ${e(formatDate(invoice.periodEnd))}</span></td><td class="r">${e(amount)}</td></tr></tbody>
    <tfoot><tr><td class="r">Total paid</td><td class="r">${e(amount)}</td></tr></tfoot>
  </table>
  ${invoice.note ? `<p style="margin-top:24px"><strong>Note:</strong> ${e(invoice.note)}</p>` : ''}
  <p class="muted" style="margin-top:40px">Recorded by ${e(invoice.recordedByName || 'the platform administrator')} on ${e(formatDate(invoice.createdAt))}. This is a record of a payment received. It is not a tax invoice.</p>
</body></html>`)
  w.document.close()
  w.focus()
  // Let the new document lay out before the print dialog takes a snapshot of it.
  setTimeout(() => w.print(), 250)
  return true
}

/**
 * One invoice record, with a print view.
 *
 * It is a record of a payment already received, not a tax invoice, and it says so
 * rather than inventing tax numbers the platform does not have.
 */
export default function InvoiceView({ invoice, billingEmail, onClose }: Props) {
  return (
    <FormDialog
      isOpen={!!invoice}
      onClose={onClose}
      title={invoice ? `Invoice ${invoice.number}` : 'Invoice'}
      width="md"
      footer={
        <>
          <button
            type="button"
            onClick={() => {
              if (invoice && !printInvoice(invoice, billingEmail)) {
                toast.error('Allow pop-ups for this site to print the invoice')
              }
            }}
            className="btn-primary"
          >
            <PrinterIcon className="h-4 w-4" /> Print or save as PDF
          </button>
          <button type="button" onClick={onClose} className="btn-secondary">
            Close
          </button>
        </>
      }
    >
      {invoice && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-lg font-bold">{BRAND.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Payment record</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Invoice</p>
              <p className="font-mono text-base font-semibold">{invoice.number}</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Paid {formatDate(invoice.paidAt)}</p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Billed to</p>
              <p className="mt-1 font-semibold">{invoice.companyName}</p>
              {billingEmail && <p className="text-gray-600 dark:text-gray-300">{billingEmail}</p>}
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Payment</p>
              <p className="mt-1">{invoice.method || 'Not recorded'}</p>
              {invoice.reference && <p className="text-gray-600 dark:text-gray-300">Ref. {invoice.reference}</p>}
            </div>
          </div>

          <table className="mt-6 w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
                <th className="py-2 font-medium">Description</th>
                <th className="py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <td className="py-3">
                  <p className="font-medium">{planLabel(invoice.plan)} plan subscription</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatDate(invoice.periodStart)} to {formatDate(invoice.periodEnd)}
                  </p>
                </td>
                <td className="py-3 text-right tabular-nums">{formatMoney(invoice.amount, invoice.currency)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td className="pt-3 text-right font-semibold">Total paid</td>
                <td className="pt-3 text-right text-base font-bold tabular-nums">{formatMoney(invoice.amount, invoice.currency)}</td>
              </tr>
            </tfoot>
          </table>

          {invoice.note && (
            <p className="mt-6 text-sm text-gray-600 dark:text-gray-300">
              <span className="font-medium">Note:</span> {invoice.note}
            </p>
          )}

          <p className="mt-8 text-xs text-gray-500 dark:text-gray-400">
            Recorded by {invoice.recordedByName || 'the platform administrator'} on {formatDate(invoice.createdAt)}.
            This is a record of a payment received. It is not a tax invoice.
          </p>
        </div>
      )}
    </FormDialog>
  )
}
