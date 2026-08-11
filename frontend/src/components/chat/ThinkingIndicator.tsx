import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CpuChipIcon } from '@heroicons/react/24/outline'

/**
 * What Aura says while it is thinking.
 *
 * Three bouncing dots say "something is happening" for about four seconds and
 * "nothing is happening" after that. A reply can genuinely take most of a minute
 * when the AI service has to wake up or a provider is busy and the request is being
 * retried, and through all of it the old indicator looked identical to a hang. People
 * gave up and sent the message again, which made it slower.
 *
 * So the wording moves with the wait. Early on it describes the work. Later it
 * admits the wait exists, because pretending otherwise past twenty seconds is how you
 * lose someone's trust rather than keep their patience. Nothing here is a progress
 * bar: there is no progress to report, and a bar that fills at a made-up rate is a
 * lie told slowly.
 */

/**
 * Each phrase, and the second it starts being true.
 *
 * Kept short deliberately. The panel is 340px wide, and a phrase that needs more room
 * than that either wraps to two lines and makes the indicator jump, or forces the row
 * wider than the panel it sits in.
 */
const PHRASES: { at: number; text: string }[] = [
  { at: 0, text: 'Reading your message' },
  { at: 3, text: 'Thinking it through' },
  { at: 8, text: 'Checking what it knows' },
  { at: 14, text: 'Preparing your answer' },
  { at: 22, text: 'Still going, one moment' },
  { at: 34, text: 'Waking the service up' },
  { at: 50, text: 'Finalising your answer' },
]

const ThinkingIndicator: React.FC = () => {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    const started = Date.now()
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(id)
  }, [])

  // The last phrase whose moment has come.
  const phrase = PHRASES.reduce((current, next) => (seconds >= next.at ? next : current), PHRASES[0])

  return (
    // Nothing here may set a minimum width. A flex child defaults to min-width:auto,
    // so it refuses to shrink below its own content: one long phrase pushed this row
    // wider than the 340px panel holding it rather than fitting inside.
    <div className="flex max-w-full items-start gap-3">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border border-gray-100 bg-white text-secondary-600 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-secondary-400">
        <CpuChipIcon className="h-5 w-5" />
      </div>

      <div className="flex h-8 min-w-0 items-center gap-2.5 overflow-hidden rounded-full border border-gray-100 bg-white px-4 dark:border-gray-700 dark:bg-gray-800">
        <span className="flex flex-shrink-0 gap-1" aria-hidden="true">
          <span className="h-1 w-1 animate-bounce rounded-full bg-primary-600" />
          <span className="h-1 w-1 animate-bounce rounded-full bg-primary-500 delay-75" />
          <span className="h-1 w-1 animate-bounce rounded-full bg-primary-400 delay-150" />
        </span>

        {/* One line at a time, crossfading, so the change is noticed without the
            message jumping about. Truncates rather than wraps, since the pill is a
            fixed height and a second line would be clipped anyway. */}
        <span className="relative block min-w-0 flex-1 text-xs text-gray-600 dark:text-gray-300">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={phrase.text}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22 }}
              className="block truncate"
            >
              {phrase.text}
            </motion.span>
          </AnimatePresence>
        </span>
      </div>

      <span className="sr-only" role="status" aria-live="polite">
        {phrase.text}
      </span>
    </div>
  )
}

export default ThinkingIndicator
