import React, { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import FormDialog from '@/components/ui/FormDialog'
import AuraBot from '@/components/chat/AuraBot'
import api from '@/services/api'

/**
 * The pause between deciding to ask and having asked.
 *
 * Raising a duplicate is cheap to prevent here and expensive everywhere else: once the
 * ticket exists there are two of them, two people working, and nobody notices until
 * one is wasted. Telling somebody afterwards is a notification; telling them now is a
 * decision they can still make.
 *
 * It never blocks. The confirm button is live from the first frame, so a person who
 * knows exactly what they are doing loses one click and no time. If the check itself
 * fails, it says so and lets them straight through, because a request nobody can file
 * because the advice service is down is a worse outcome than a possible duplicate.
 */

interface Match {
  ticketNumber: string
  title: string
  status: string
  createdAt: string
  requesterName: string
  mine: boolean
  open: boolean
  cancelled: boolean
  /** Written by whoever resolved it, at the moment they resolved it. */
  resolution: string | null
  /** Written by whoever cancelled it. A refusal is worth more warning than a fix. */
  cancelReason: string | null
}

interface Preflight {
  similar: Match[]
  note: string
  aiWritten: boolean
}

interface Props {
  isOpen: boolean
  /** The draft being checked. Sent as-is; nothing is created until confirm. */
  draft: { title: string; description?: string; receiverDeptId?: string; category?: string } | null
  /** Escape and the backdrop: back to the form, nothing sent, nothing lost. */
  onCancel: () => void
  /** Send it. */
  onConfirm: () => void
  /** Answered already, so nothing is raised and the form closes with it. */
  onResolved: () => void
  submitting?: boolean
}

const TYPE_MS = 16

const TicketPreflightDialog: React.FC<Props> = ({
  isOpen,
  draft,
  onCancel,
  onConfirm,
  onResolved,
  submitting,
}) => {
  const reduced = useReducedMotion()
  const [result, setResult] = useState<Preflight | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [typed, setTyped] = useState('')

  useEffect(() => {
    if (!isOpen || !draft) return
    let live = true

    setLoading(true)
    setFailed(false)
    setResult(null)
    setTyped('')

    api
      .post('/tickets/preflight', draft, { timeout: 20000 })
      .then(({ data }) => {
        if (live) setResult(data)
      })
      .catch(() => {
        if (live) setFailed(true)
      })
      .finally(() => {
        if (live) setLoading(false)
      })

    return () => {
      live = false
    }
    // draft is a fresh object each render; the dialog opening is the real trigger.
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  const note = result?.note ?? ''
  const typingDone = typed.length >= note.length

  useEffect(() => {
    if (!note) return
    if (reduced) {
      setTyped(note)
      return
    }
    let i = 0
    const id = setInterval(() => {
      i += 1
      setTyped(note.slice(0, i))
      if (i >= note.length) clearInterval(id)
    }, TYPE_MS)
    return () => clearInterval(id)
  }, [note, reduced])

  return (
    <FormDialog
      isOpen={isOpen}
      onClose={onCancel}
      width="lg"
      backdrop="heavy"
      bare
      title="Before you send this"
      description={draft?.title}
      icon={<AuraBot className="h-10 w-10" thinking={loading} />}
      footer={
        <>
          {/* Two ways out, and the quiet one is the one that raises nothing. Both are
              live from the first frame: somebody who knows what they are doing should
              lose a click, not a wait. */}
          <button
            type="button"
            onClick={onResolved}
            disabled={submitting}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-60"
          >
            All done, no request
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-500 disabled:opacity-60"
          >
            {submitting ? 'Sending…' : 'Initiate request'}
          </button>
        </>
      }
    >
      <div className="space-y-6">
        {loading && <p className="py-6 text-sm text-gray-400">Checking what has been asked before…</p>}

        {failed && (
          <p className="py-4 text-sm text-gray-200">
            The check could not run just now, so this has not been compared against earlier
            requests. You can still send it.
          </p>
        )}

        {/* Matches first: this is the part someone might act on, and it should not wait
            behind a sentence being typed. */}
        {result && result.similar.length > 0 && (
          <div className="space-y-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Asked before
            </p>
            {result.similar.map((m, i) => (
              <motion.div
                key={m.ticketNumber}
                initial={reduced ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: reduced ? 0 : Math.min(i * 0.05, 0.25) }}
                className="flex items-center gap-3 text-sm"
              >
                <span className="w-[5.5rem] flex-shrink-0 truncate text-xs tabular-nums text-gray-400">
                  {m.ticketNumber}
                </span>
                <span
                  className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                    m.open ? 'bg-amber-500' : m.cancelled ? 'bg-red-500' : 'bg-emerald-500'
                  }`}
                />
                <span className="min-w-0 flex-1 truncate text-gray-100">{m.title}</span>
                <span className="flex-shrink-0 text-xs text-gray-400">
                  {m.open ? 'Still open' : m.cancelled ? 'Cancelled' : 'Resolved'}
                  {m.mine ? ' · yours' : ` · ${m.requesterName}`}
                </span>
              </motion.div>
            ))}

            {/* What actually happened, quoted rather than paraphrased, under the row it
                belongs to and not typed out: this is the line that may save the request
                entirely, so it should not arrive last. */}
            {result.similar
              .filter((m) => m.resolution || m.cancelReason)
              .map((m) => (
                <div
                  key={`${m.ticketNumber}-outcome`}
                  className={`ml-[6.5rem] border-l-2 pl-3 ${
                    m.cancelled ? 'border-red-500/40' : 'border-emerald-500/40'
                  }`}
                >
                  <p className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
                    {m.cancelled
                      ? `Why ${m.ticketNumber} was cancelled`
                      : `How ${m.ticketNumber} was solved`}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-gray-300">
                    {m.cancelled ? m.cancelReason : m.resolution}
                  </p>
                </div>
              ))}
          </div>
        )}

        {result && (
          <div className="flex gap-3 border-t border-white/10 pt-5">
            <AuraBot
              className="mt-0.5 h-9 w-9 flex-shrink-0"
              alive={typingDone}
              thinking={!typingDone}
            />
            <div className="min-w-0 flex-1 space-y-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
                {result.aiWritten ? 'Checked by Aura' : 'Checked against your tickets'}
              </span>
              <p
                className="whitespace-pre-wrap text-sm leading-relaxed text-gray-200"
                onClick={() => setTyped(note)}
              >
                {typed}
                {!typingDone && (
                  <motion.span
                    className="ml-0.5 inline-block h-4 w-px translate-y-0.5 bg-gray-300"
                    animate={{ opacity: [1, 0, 1] }}
                    transition={{ duration: 0.9, repeat: Infinity }}
                  />
                )}
              </p>
            </div>
          </div>
        )}
      </div>
    </FormDialog>
  )
}

export default TicketPreflightDialog
