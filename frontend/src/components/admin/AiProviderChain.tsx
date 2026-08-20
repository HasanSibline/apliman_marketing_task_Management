import React, { useEffect, useState } from 'react'
import {
  PlusIcon,
  TrashIcon,
  ArrowPathIcon,
  ShieldExclamationIcon,
  BoltIcon,
} from '@heroicons/react/24/outline'
import Select from '@/components/ui/Select'
import FormDialog from '@/components/ui/FormDialog'
import { confirmDialog } from '@/components/ui/confirm'
import { aiProvidersApi } from '@/services/api'
import toast from 'react-hot-toast'

/**
 * A company's AI providers, in the order they will be tried.
 *
 * The order is the feature. Everything else on this screen exists to make one question
 * answerable at a glance: if the first provider stops answering right now, what happens
 * next? So the chain is drawn as a list in the order the gateway walks it, each entry
 * showing whether it is available and why not, rather than as a form of unrelated
 * fields that happen to include a number called priority.
 *
 * No key is ever displayed, because none is ever sent here. The server returns whether
 * a key is set and nothing else, so there is nothing on this page to leak.
 */

interface ProviderRow {
  id: string
  provider: string
  model: string | null
  label: string | null
  priority: number
  enabled: boolean
  isEmergency: boolean
  monthlyBudget: number | null
  status: string
  cooldownUntil: string | null
  lastError: string | null
  lastSuccessAt: string | null
  failureCount: number
  spentThisMonth: number
}

const PROVIDERS = [
  { value: 'groq', label: 'Groq' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'anthropic', label: 'Anthropic Claude' },
  { value: 'openai', label: 'OpenAI' },
]

/** Status carries a word and a shape, never colour alone. */
const STATUS_STYLE: Record<string, string> = {
  HEALTHY: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  RATE_LIMITED: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  QUOTA_EXCEEDED: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  UNAVAILABLE: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  INVALID_KEY: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  DISABLED: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
}

const STATUS_LABEL: Record<string, string> = {
  HEALTHY: 'Healthy',
  RATE_LIMITED: 'Rate limited',
  QUOTA_EXCEEDED: 'Quota used up',
  UNAVAILABLE: 'Unavailable',
  INVALID_KEY: 'Key rejected',
  DISABLED: 'Off',
}

interface Props {
  companyId: string
  companyName?: string
}

const AiProviderChain: React.FC<Props> = ({ companyId, companyName }) => {
  const [rows, setRows] = useState<ProviderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)

  const [draft, setDraft] = useState({
    provider: 'groq',
    model: '',
    apiKey: '',
    label: '',
    isEmergency: false,
    monthlyBudget: '',
  })

  const load = async () => {
    if (!companyId) return
    setLoading(true)
    try {
      setRows(await aiProvidersApi.list(companyId))
    } catch {
      toast.error('Could not load the provider list')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [companyId])

  const ordinary = rows.filter((r) => !r.isEmergency)
  const emergency = rows.filter((r) => r.isEmergency)

  const add = async () => {
    if (!draft.apiKey.trim()) {
      toast.error('Paste the API key for this provider')
      return
    }
    if (draft.isEmergency && !draft.monthlyBudget) {
      toast.error('A paid fallback needs a monthly budget')
      return
    }

    setSaving(true)
    try {
      await aiProvidersApi.create({
        companyId,
        provider: draft.provider,
        model: draft.model.trim() || undefined,
        apiKey: draft.apiKey.trim(),
        label: draft.label.trim() || undefined,
        // Appended to the end of its tier, which is almost always what somebody adding
        // a fallback means. Reordering afterwards is one click.
        priority: (draft.isEmergency ? emergency.length : ordinary.length) + 1,
        isEmergency: draft.isEmergency,
        monthlyBudget: draft.monthlyBudget ? Number(draft.monthlyBudget) : null,
      })
      toast.success('Provider added')
      setAdding(false)
      setDraft({ provider: 'groq', model: '', apiKey: '', label: '', isEmergency: false, monthlyBudget: '' })
      load()
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Could not add that provider')
    } finally {
      setSaving(false)
    }
  }

  const patch = async (id: string, data: Record<string, any>) => {
    try {
      await aiProvidersApi.update(id, data)
      load()
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Could not save that change')
    }
  }

  /** Swap with the neighbour above or below, inside the same tier. */
  const move = async (row: ProviderRow, direction: -1 | 1) => {
    const tier = row.isEmergency ? emergency : ordinary
    const index = tier.findIndex((r) => r.id === row.id)
    const swapWith = tier[index + direction]
    if (!swapWith) return

    await Promise.all([
      aiProvidersApi.update(row.id, { priority: swapWith.priority }),
      aiProvidersApi.update(swapWith.id, { priority: row.priority }),
    ])
    load()
  }

  const remove = async (row: ProviderRow) => {
    const ok = await confirmDialog({
      title: `Remove ${row.label || providerName(row.provider)}?`,
      description:
        'Its key is deleted with it. Anything currently relying on it falls through to the next provider in the chain.',
      confirmText: 'Remove',
      variant: 'danger',
    })
    if (!ok) return

    try {
      await aiProvidersApi.remove(row.id)
      toast.success('Removed')
      load()
    } catch {
      toast.error('Could not remove that provider')
    }
  }

  const providerName = (value: string) => PROVIDERS.find((p) => p.value === value)?.label ?? value

  const availability = (row: ProviderRow): string | null => {
    if (!row.enabled) return 'Switched off'
    if (row.status === 'INVALID_KEY') return 'The provider rejected this key. Replace it to use this entry again.'
    if (row.cooldownUntil && new Date(row.cooldownUntil) > new Date()) {
      const seconds = Math.ceil((new Date(row.cooldownUntil).getTime() - Date.now()) / 1000)
      return seconds > 90
        ? `Resting for another ${Math.ceil(seconds / 60)} min`
        : `Resting for another ${seconds}s`
    }
    if (row.isEmergency && row.monthlyBudget && row.spentThisMonth >= row.monthlyBudget) {
      return 'Monthly budget spent'
    }
    return null
  }

  const renderRow = (row: ProviderRow, index: number, tier: ProviderRow[]) => {
    const blocked = availability(row)
    return (
      <div
        key={row.id}
        className="flex flex-wrap items-center gap-3 border-t border-gray-100 px-4 py-3 dark:border-gray-700"
      >
        <span className="w-6 shrink-0 text-center text-xs tabular-nums text-gray-400">
          {index + 1}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
            {row.label || providerName(row.provider)}
            {row.model && <span className="font-normal text-gray-500"> · {row.model}</span>}
          </p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {providerName(row.provider)}
            {blocked ? ` · ${blocked}` : ''}
            {row.isEmergency && row.monthlyBudget
              ? ` · $${row.spentThisMonth.toFixed(2)} of $${row.monthlyBudget.toFixed(2)} this month`
              : ''}
          </p>
        </div>

        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
            STATUS_STYLE[row.enabled ? row.status : 'DISABLED'] ?? STATUS_STYLE.DISABLED
          }`}
        >
          {STATUS_LABEL[row.enabled ? row.status : 'DISABLED'] ?? row.status}
        </span>

        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => move(row, -1)}
            disabled={index === 0}
            aria-label="Try this one earlier"
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 dark:hover:bg-gray-700"
          >
            ↑
          </button>
          <button
            onClick={() => move(row, 1)}
            disabled={index === tier.length - 1}
            aria-label="Try this one later"
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 dark:hover:bg-gray-700"
          >
            ↓
          </button>

          <button
            onClick={async () => {
              const result = await aiProvidersApi.test(row.id)
              result.ok ? toast.success(result.message) : toast.error(result.message)
              load()
            }}
            title="Send one test prompt through this key"
            aria-label="Test this key"
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-primary-600 dark:hover:bg-gray-700"
          >
            <BoltIcon className="h-4 w-4" />
          </button>

          {(row.cooldownUntil || row.status !== 'HEALTHY') && (
            <button
              onClick={() => aiProvidersApi.reset(row.id).then(load)}
              title="Put back in service now"
              aria-label="Put back in service now"
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-primary-600 dark:hover:bg-gray-700"
            >
              <ArrowPathIcon className="h-4 w-4" />
            </button>
          )}

          <label className="ml-1 flex cursor-pointer items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <input
              type="checkbox"
              checked={row.enabled}
              onChange={(e) => patch(row.id, { enabled: e.target.checked })}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600"
            />
            On
          </label>

          <button
            onClick={() => remove(row)}
            aria-label={`Remove ${row.label || providerName(row.provider)}`}
            className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="surface">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            AI providers{companyName ? ` for ${companyName}` : ''}
          </h2>
          <p className="mt-1 max-w-xl text-sm text-gray-500 dark:text-gray-400">
            Tried in this order. When one is rate limited or out of quota the next is used
            automatically, so nobody sees the assistant stop working.
          </p>
        </div>
        <button onClick={() => setAdding(true)} className="btn-primary">
          <PlusIcon className="h-4 w-4" />
          Add provider
        </button>
      </div>

      {loading ? (
        <div className="border-t border-gray-100 px-4 py-10 text-center text-sm text-gray-500 dark:border-gray-700">
          Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="border-t border-gray-100 px-4 py-10 text-center dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No providers yet, so AI is off for this company.
          </p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            Add at least two, from different providers, so one running out does not stop the
            assistant.
          </p>
        </div>
      ) : (
        <>
          {ordinary.map((row, i) => renderRow(row, i, ordinary))}

          {emergency.length > 0 && (
            <div className="border-t border-gray-100 bg-amber-50/50 px-4 py-2 dark:border-gray-700 dark:bg-amber-900/10">
              <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-amber-700 dark:text-amber-400">
                <ShieldExclamationIcon className="h-3.5 w-3.5" />
                Paid fallback, used only when everything above is exhausted
              </p>
            </div>
          )}
          {emergency.map((row, i) => renderRow(row, i, emergency))}
        </>
      )}

      {ordinary.length === 1 && (
        <p className="border-t border-gray-100 px-4 py-3 text-xs text-amber-700 dark:border-gray-700 dark:text-amber-400">
          Only one provider is configured, so there is nothing to fall back to when it hits
          its limit. Adding a second from a different provider is what stops that.
        </p>
      )}

      <FormDialog
        isOpen={adding}
        onClose={() => setAdding(false)}
        title="Add an AI provider"
        description="Its key is encrypted immediately and is never shown again, here or anywhere else."
        width="md"
        busy={saving}
        footer={
          <>
            <button type="button" onClick={() => setAdding(false)} className="btn-secondary" disabled={saving}>
              Cancel
            </button>
            <button type="button" onClick={add} className="btn-primary" disabled={saving}>
              {saving ? 'Adding…' : 'Add provider'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="ai-provider" className="form-label">Provider</label>
            <Select
              id="ai-provider"
              value={draft.provider}
              onChange={(e) => setDraft({ ...draft, provider: e.target.value })}
              className="select-field"
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </Select>
          </div>

          <div>
            <label htmlFor="ai-key" className="form-label">API key</label>
            <input
              id="ai-key"
              type="password"
              value={draft.apiKey}
              onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
              className="input-field"
              placeholder="Paste the key"
              autoComplete="off"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="ai-model" className="form-label">Model</label>
              <input
                id="ai-model"
                value={draft.model}
                onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                className="input-field"
                placeholder="Leave blank for the default"
              />
            </div>
            <div>
              <label htmlFor="ai-label" className="form-label">Label</label>
              <input
                id="ai-label"
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                className="input-field"
                placeholder="e.g. Groq, second key"
              />
              <p className="form-hint">How you will tell this apart from another key on the same provider.</p>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={draft.isEmergency}
                onChange={(e) => setDraft({ ...draft, isEmergency: e.target.checked })}
                className="mt-0.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600"
              />
              <span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  This is a paid fallback
                </span>
                <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                  Kept in reserve and only used once every free provider is exhausted. It sits
                  last in the chain whatever else you add.
                </span>
              </span>
            </label>

            {draft.isEmergency && (
              <div className="mt-3">
                <label htmlFor="ai-budget" className="form-label">Monthly budget</label>
                <input
                  id="ai-budget"
                  type="number"
                  min="0"
                  step="0.5"
                  value={draft.monthlyBudget}
                  onChange={(e) => setDraft({ ...draft, monthlyBudget: e.target.value })}
                  className="input-field"
                  placeholder="e.g. 10"
                />
                <p className="form-hint">
                  It stops being used for the rest of the month once it reaches this. Required,
                  because a paid key without a ceiling is how a bill arrives unannounced.
                </p>
              </div>
            )}
          </div>
        </div>
      </FormDialog>
    </div>
  )
}

export default AiProviderChain
