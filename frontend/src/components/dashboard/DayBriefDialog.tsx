import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { SparklesIcon, ExclamationTriangleIcon, TicketIcon, CheckCircleIcon, ClipboardDocumentListIcon } from '@heroicons/react/24/outline'
import FormDialog from '@/components/ui/FormDialog'
import AuraBot from '@/components/chat/AuraBot'
import api from '@/services/api'

/**
 * The day, read back to you.
 *
 * Two halves, deliberately unlike each other. The list is exact and arrives all at
 * once, because it is what you might act on and nobody should wait for a sentence to
 * finish before they can see a deadline. The brief above it is typed, because it is
 * prose and because the typing is the honest signal that something wrote it just now.
 *
 * The typing is not a loading state and must never be mistaken for one: the text is
 * already here when it starts. If the request is still in flight the dialog says so
 * separately, so nobody reads a half-typed sentence as a half-finished answer.
 */

interface BriefItem {
  kind: string
  label: string
  detail: string
  tone: 'urgent' | 'info' | 'praise'
}

interface Brief {
  greeting: string
  items: BriefItem[]
  summary: string
  aiWritten: boolean
}

interface Props {
  isOpen: boolean
  onClose: () => void
}

const TONE: Record<BriefItem['tone'], { chip: string; Icon: React.ComponentType<{ className?: string }> }> = {
  urgent: { chip: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', Icon: ExclamationTriangleIcon },
  info: { chip: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200', Icon: ClipboardDocumentListIcon },
  praise: { chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300', Icon: CheckCircleIcon },
}

const ICON_BY_KIND: Record<string, React.ComponentType<{ className?: string }>> = {
  ticket: TicketIcon,
  done: CheckCircleIcon,
}

/** Characters per tick. Fast enough not to test anyone's patience on a long brief. */
const TYPE_MS = 18

const DayBriefDialog: React.FC<Props> = ({ isOpen, onClose }) => {
  const reduced = useReducedMotion()
  const [brief, setBrief] = useState<Brief | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [typed, setTyped] = useState('')

  // Fetched each time it opens rather than cached. A brief about today that is an hour
  // stale is worse than no brief, because it reads as current.
  useEffect(() => {
    if (!isOpen) return
    let live = true

    setLoading(true)
    setFailed(false)
    setBrief(null)
    setTyped('')

    api
      .get('/chat/day-brief', { timeout: 25000 })
      .then(({ data }) => {
        if (live) setBrief(data)
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
  }, [isOpen])

  // Typed out a character at a time. Reduced motion gets the finished sentence: the
  // objection is to the movement, and a slower reveal is still movement.
  const summary = brief?.summary ?? ''
  const typingDone = typed.length >= summary.length

  useEffect(() => {
    if (!summary) return
    if (reduced) {
      setTyped(summary)
      return
    }

    let i = 0
    const id = setInterval(() => {
      i += 1
      setTyped(summary.slice(0, i))
      if (i >= summary.length) clearInterval(id)
    }, TYPE_MS)
    return () => clearInterval(id)
  }, [summary, reduced])

  // Skip to the end on click, for anyone who reads faster than the animation.
  const finishTyping = () => setTyped(summary)

  const listRef = useRef<HTMLDivElement>(null)

  return (
    <FormDialog
      isOpen={isOpen}
      onClose={onClose}
      width="md"
      title="Your day"
      description={brief ? `${brief.greeting}. Here is everything waiting on you.` : 'Gathering what is waiting on you.'}
      icon={
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 dark:bg-primary-900/30">
          <SparklesIcon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
        </div>
      }
      footer={
        <button type="button" onClick={onClose} className="btn-primary">
          Got it
        </button>
      }
    >
      <div className="space-y-5">
        {/* ── The brief ─────────────────────────────────────────────────── */}
        <div
          onClick={finishTyping}
          className="flex gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40"
        >
          <AuraBot className="mt-0.5 h-8 w-8 flex-shrink-0" thinking={loading} />

          <div className="min-w-0 flex-1">
            {loading && (
              <p className="text-sm text-gray-500 dark:text-gray-400">Reading your board…</p>
            )}

            {failed && (
              <p className="text-sm text-gray-700 dark:text-gray-200">
                Your day could not be read just now. Everything below is still on your board,
                and the tasks and tickets pages have it in full.
              </p>
            )}

            {brief && (
              <>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800 dark:text-gray-100">
                  {typed}
                  {!typingDone && (
                    <motion.span
                      className="ml-0.5 inline-block h-4 w-px translate-y-0.5 bg-gray-500 dark:bg-gray-300"
                      animate={{ opacity: [1, 0, 1] }}
                      transition={{ duration: 0.9, repeat: Infinity }}
                    />
                  )}
                </p>
                {typingDone && (
                  <p className="form-hint">
                    {brief.aiWritten ? 'Summarised by Aura' : 'Summarised from your board'}
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── The list ──────────────────────────────────────────────────────
            Arrives whole, not typed. These are the things worth acting on, and
            making someone wait for a sentence before they can see a deadline
            would be animation charged to the reader. */}
        <div ref={listRef} className="space-y-2">
          <AnimatePresence>
            {brief?.items.map((item, i) => {
              const tone = TONE[item.tone]
              const Icon = ICON_BY_KIND[item.kind] ?? tone.Icon
              return (
                <motion.div
                  key={`${item.kind}-${item.label}-${i}`}
                  initial={reduced ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, delay: reduced ? 0 : Math.min(i * 0.045, 0.4) }}
                  className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                >
                  <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ${tone.chip}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{item.label}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{item.detail}</p>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>

          {brief && brief.items.length === 0 && (
            <div className="rounded-lg border border-dashed border-gray-300 py-8 text-center dark:border-gray-600">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Nothing is waiting on you. Enjoy it.
              </p>
            </div>
          )}
        </div>
      </div>
    </FormDialog>
  )
}

export default DayBriefDialog
