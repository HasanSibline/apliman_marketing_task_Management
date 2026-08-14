import React, { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
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
  /** The left column: a clock time for a meeting, a reference for everything else. */
  meta: string
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

/**
 * A dot, not an icon tile.
 *
 * Every row was a bordered card with an icon in a coloured square, which turned a
 * six-line list into six boxes and made the reading harder rather than easier. The
 * dot carries the same state in a tenth of the space, and the row reads as a line of
 * text, which is what it is.
 */
const DOT: Record<BriefItem['tone'], string> = {
  urgent: 'bg-red-500',
  info: 'bg-primary-500',
  praise: 'bg-emerald-500',
}

/** Rows are grouped under these, in this order. Meetings first: a ten o'clock cannot move. */
const GROUPS: { kinds: string[]; label: string }[] = [
  { kinds: ['meeting'], label: 'Today' },
  { kinds: ['task', 'subtask'], label: 'Your work' },
  { kinds: ['ticket'], label: 'Tickets' },
  { kinds: ['done'], label: 'Behind you' },
]

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

  return (
    <FormDialog
      isOpen={isOpen}
      onClose={onClose}
      // Wide enough that a task title and its status sit on one line. At md the two
      // competed for the same row and every title truncated mid-word.
      width="lg"
      // The page behind is competition here, not context: everything in this dialog is
      // meant to be read, so the room goes properly out of focus and the panel drops
      // away entirely, leaving the words on the blur.
      backdrop="heavy"
      bare
      title="Your day"
      description={brief ? `${brief.greeting}. Here is everything waiting on you.` : 'Gathering what is waiting on you.'}
      // The robot heads the dialog rather than a sparkle in a tile: it is the thing
      // that read your day, and it is the face this answer arrives in everywhere else
      // in the app.
      icon={<AuraBot className="h-10 w-10" thinking={loading} />}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          Got it
        </button>
      }
    >
      <div className="space-y-6">
        {loading && <p className="py-6 text-sm text-gray-400">Reading your day…</p>}

        {failed && (
          <p className="py-4 text-sm text-gray-200">
            Your day could not be read just now. Nothing has changed on your board, and the
            tasks and tickets pages have it in full.
          </p>
        )}

        {/* ── The list ──────────────────────────────────────────────────────
            Plain rows under a small heading, no card per item: a fixed left column
            for the time or reference, a dot for state, then the line itself. The
            left column is tabular so the times and the references stack into a
            true column rather than drifting with the width of each string. */}
        {brief &&
          GROUPS.map(({ kinds, label }) => {
            const rows = brief.items.filter((i) => kinds.includes(i.kind))
            if (rows.length === 0) return null
            // The column is only reserved when something fills it. An older server
            // sends no meta at all, and a fixed-width empty column indents every row
            // for nothing.
            const hasMeta = rows.some((r) => r.meta)
            return (
              <div key={label} className="space-y-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  {label}
                </p>
                {rows.map((item, i) => (
                  <motion.div
                    key={`${item.kind}-${item.label}-${i}`}
                    initial={reduced ? false : { opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: reduced ? 0 : Math.min(i * 0.04, 0.3) }}
                    className="flex items-center gap-3 text-sm"
                  >
                    {hasMeta && (
                      <span className="w-[4.5rem] flex-shrink-0 truncate text-xs tabular-nums text-gray-400">
                        {item.meta}
                      </span>
                    )}
                    <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${DOT[item.tone]}`} />
                    <span className="min-w-0 flex-1 truncate text-gray-100">{item.label}</span>
                    <span className="flex-shrink-0 text-xs text-gray-400">{item.detail}</span>
                  </motion.div>
                ))}
              </div>
            )
          })}

        {brief && brief.items.length === 0 && (
          <p className="py-6 text-center text-sm text-gray-400">
            Nothing is waiting on you today. Enjoy it.
          </p>
        )}

        {/* ── The brief ──────────────────────────────────────────────────────
            The robot beside its own answer, the way it appears beside every other
            reply it gives. A hairline above rather than a box around: the answer
            needs separating from the list, which a rule does, and does without
            drawing a container nothing needed. Clicking anywhere finishes typing. */}
        {brief && (
          <div className="flex gap-3 border-t border-white/10 pt-5" onClick={finishTyping}>
            <AuraBot className="mt-0.5 h-9 w-9 flex-shrink-0" alive={typingDone} thinking={!typingDone} />

            <div className="min-w-0 flex-1 space-y-1.5">
              {/* No icon. The robot is already sitting next to this line saying the
                  same thing, and a sparkle beside it is the second mark for one idea. */}
              <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
                {brief.aiWritten ? 'Summarised by Aura' : 'Summarised from your board'}
              </span>

              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-200">
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

export default DayBriefDialog
