import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { XMarkIcon } from '@heroicons/react/24/outline'
import api from '@/services/api'
import AuraAssist from './AuraAssist'
import AuraBot from './AuraBot'

/**
 * The launcher, and the one thing Aura says without being asked.
 *
 * The button used to pulse forever with an `animate-ping` ring. Permanent motion in
 * the corner of every screen is not an invitation, it is something to learn to
 * ignore, and it moves while people are trying to read. It moves once on arrival now
 * and then holds still.
 *
 * The nudge is the only thing that interrupts, and it earns it by being specific:
 * counted from this person's own tasks and tickets, never generated, so it costs
 * nothing and stays right even while the AI service is down. Dismissing one silences
 * nudges for the rest of the session, because a thing you closed should stay closed.
 */

/** Long enough after arriving that it is not competing with the page loading. */
const FIRST_NUDGE_MS = 25_000
/** And rarely enough afterwards that it stays worth reading. */
const NUDGE_INTERVAL_MS = 12 * 60_000
/** On screen just long enough for a glance. */
const NUDGE_VISIBLE_MS = 11_000

interface Nudge {
  text: string
  tone: 'urgent' | 'info' | 'praise'
}

const TONE: Record<Nudge['tone'], string> = {
  urgent: 'border-amber-300 dark:border-amber-800',
  info: 'border-gray-200 dark:border-gray-700',
  praise: 'border-emerald-300 dark:border-emerald-800',
}

export default function FloatingChatButton() {
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [nudge, setNudge] = useState<Nudge | null>(null)
  const [silenced, setSilenced] = useState(false)

  const hideTimer = useRef<ReturnType<typeof setTimeout>>()

  const fetchNudge = useCallback(async () => {
    // Never over the top of an open conversation, and never after it was dismissed.
    if (silenced || isChatOpen || document.hidden) return
    try {
      const { data } = await api.get('/chat/nudge', { timeout: 8000 })
      if (!data?.text) return
      setNudge(data)
      clearTimeout(hideTimer.current)
      hideTimer.current = setTimeout(() => setNudge(null), NUDGE_VISIBLE_MS)
    } catch {
      // A greeting is not worth reporting a failure over.
    }
  }, [silenced, isChatOpen])

  useEffect(() => {
    const first = setTimeout(fetchNudge, FIRST_NUDGE_MS)
    const repeat = setInterval(fetchNudge, NUDGE_INTERVAL_MS)
    return () => {
      clearTimeout(first)
      clearInterval(repeat)
      clearTimeout(hideTimer.current)
    }
  }, [fetchNudge])

  useEffect(() => {
    if (isChatOpen) setNudge(null)
  }, [isChatOpen])

  const dismiss = () => {
    setNudge(null)
    setSilenced(true)
  }

  return (
    <>
      {!isChatOpen && (
        <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3">
          <AnimatePresence>
            {nudge && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ duration: 0.2 }}
                className={`flex max-w-[15rem] items-start gap-2 rounded-2xl rounded-br-sm border bg-white px-3.5 py-2.5 shadow-lg dark:bg-gray-800 ${TONE[nudge.tone]}`}
                role="status"
              >
                <button
                  onClick={() => setIsChatOpen(true)}
                  className="text-left text-xs leading-relaxed text-gray-700 dark:text-gray-200"
                >
                  {nudge.text}
                </button>
                <button
                  onClick={dismiss}
                  aria-label="Dismiss"
                  className="-mr-1 -mt-0.5 shrink-0 rounded p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <XMarkIcon className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button
            onClick={() => setIsChatOpen(true)}
            // One arrival, then still. Anything that moves forever gets tuned out.
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.96 }}
            aria-label="Open Aura Assist"
            title="Ask Aura Assist"
            className="rounded-full shadow-lg shadow-primary-600/25 ring-1 ring-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
          >
            <AuraBot className="h-14 w-14" />
          </motion.button>
        </div>
      )}

      <AuraAssist isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
    </>
  )
}
