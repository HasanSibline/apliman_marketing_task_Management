import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useAnimationControls, useReducedMotion } from 'framer-motion'
import { XMarkIcon } from '@heroicons/react/24/outline'
import api from '@/services/api'
import AuraAssist from './AuraAssist'
import AuraBot from './AuraBot'

/**
 * The launcher: where Aura lives when it is not being talked to.
 *
 * Two things happen here without being asked. It occasionally slips off the right
 * edge and peeks back, and it occasionally has something true to say. Both are rare
 * on purpose. A corner that always moves is a corner people stop looking at, which
 * costs exactly the attention the behaviour was meant to buy.
 *
 * Every bit of it yields to being touched. Hover during the peek and it yelps and
 * goes straight back to where it belongs, because the one thing worse than a mascot
 * that moves is a mascot that will not get out of the way.
 */

/** Long enough after arriving that it is not competing with the page loading. */
const FIRST_NUDGE_MS = 12_000
const NUDGE_INTERVAL_MS = 3 * 60_000
const NUDGE_VISIBLE_MS = 11_000
/** Matches the wave's own duration in AuraBot, so the bubble lands as the arm drops. */
const WAVE_MS = 1_500

/**
 * The sneak, roughly every half minute.
 *
 * Jittered rather than exact. On a fixed interval the eye learns the beat and stops
 * seeing it, which costs precisely the attention the behaviour exists to earn, and
 * anything landing on a metronome reads as a machine rather than as something with a
 * mind of its own. It also never begins while the chat is open or the tab is hidden,
 * so it cannot animate at nobody.
 */
const FIRST_PEEK_MS = 30_000
const PEEK_EVERY_MS = 30_000
const PEEK_JITTER_MS = 12_000

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

  const [peeking, setPeeking] = useState(false)
  const [ouch, setOuch] = useState(false)
  const [waving, setWaving] = useState(false)

  const controls = useAnimationControls()
  const reduced = useReducedMotion()

  const hideTimer = useRef<ReturnType<typeof setTimeout>>()
  const ouchTimer = useRef<ReturnType<typeof setTimeout>>()
  const waveTimer = useRef<ReturnType<typeof setTimeout>>()
  /** Settles the wave's promise when the timer is cleared instead of allowed to run. */
  const waveEnd = useRef<(() => void) | null>(null)
  /** Bumped to abandon a sequence in flight, so an interrupted peek cannot resume. */
  const run = useRef(0)

  /**
   * The state fetchNudge reads part-way through, mirrored into refs.
   *
   * Not dependencies. fetchNudge drives the interval that schedules it, so naming
   * peeking or ouch as a dependency rebuilds that interval every time the robot
   * peeks, which is more often than the interval itself: the three-minute timer
   * would be torn down and restarted every thirty seconds and never once fire.
   *
   * They also have to be read after the await rather than before, since a wave takes
   * a second and a half and the chat can be opened inside it. A captured value would
   * be the one from before the fetch, which is by definition the state that let the
   * nudge start.
   */
  const live = useRef({ isChatOpen, peeking, ouch, reduced })
  live.current = { isChatOpen, peeking, ouch, reduced }

  // ── Nudges ────────────────────────────────────────────────────────────────
  const fetchNudge = useCallback(async () => {
    if (silenced || live.current.isChatOpen || document.hidden) return
    try {
      const { data } = await api.get('/chat/nudge', { timeout: 8000 })
      if (!data?.text) return

      // Wave first, speak second.
      //
      // A bubble appearing beside a motionless robot is a notification that happens
      // to be shaped like a character. The wave is what makes it the character
      // speaking: it catches the eye where the words will be, and by the time they
      // arrive you are already looking at the right corner of the screen.
      //
      // Skipped mid-peek, because the arm is behind the window edge and would be
      // waving at nobody, and skipped under reduced motion, where the bubble simply
      // arrives.
      const { peeking: away, ouch: hurt, reduced: still } = live.current
      if (!still && !away && !hurt) {
        setWaving(true)
        clearTimeout(waveTimer.current)
        // Resolves either when the wave finishes or when the component tears the
        // timer down. Settling on teardown matters: a promise that is only resolved
        // by the timer leaves this function suspended forever if the timer is
        // cleared, and waving never returns to false.
        await new Promise<void>((resolve) => {
          waveTimer.current = setTimeout(resolve, WAVE_MS)
          waveEnd.current = resolve
        })
        waveEnd.current = null
        setWaving(false)
      }

      // Read again, not captured: the chat may have been opened during the wave.
      if (live.current.isChatOpen || document.hidden) return

      setNudge(data)
      clearTimeout(hideTimer.current)
      hideTimer.current = setTimeout(() => setNudge(null), NUDGE_VISIBLE_MS)
    } catch {
      // A greeting is not worth reporting a failure over.
    }
  }, [silenced])

  useEffect(() => {
    const first = setTimeout(fetchNudge, FIRST_NUDGE_MS)
    const repeat = setInterval(fetchNudge, NUDGE_INTERVAL_MS)
    return () => {
      clearTimeout(first)
      clearInterval(repeat)
      clearTimeout(hideTimer.current)
      clearTimeout(waveTimer.current)
      waveEnd.current?.()
      waveEnd.current = null
    }
  }, [fetchNudge])

  useEffect(() => {
    if (isChatOpen) {
      setNudge(null)
      setWaving(false)
    }
  }, [isChatOpen])

  // ── Coming home ───────────────────────────────────────────────────────────
  const comeBack = useCallback(
    async (startled: boolean) => {
      run.current += 1
      clearTimeout(ouchTimer.current)
      setPeeking(false)

      if (startled) {
        setOuch(true)
        ouchTimer.current = setTimeout(() => setOuch(false), 1400)
        // Caught: one hop and straight back, no strolling.
        await controls.start({
          x: 0,
          y: [0, -7, 0],
          rotate: 0,
          transition: { duration: 0.42, ease: 'easeOut' },
        })
        return
      }

      // Walking: the body rocks side to side and rises on each step. Four steps over
      // the distance is what keeps it a walk rather than a slide with a wobble on it.
      await controls.start({
        x: 0,
        y: [0, -3, 0, -3, 0, -3, 0, -3, 0],
        rotate: [0, -4, 0, 4, 0, -4, 0, 4, 0],
        transition: { duration: 1.5, ease: 'linear' },
      })
      await controls.start({ y: 0, rotate: 0, transition: { duration: 0.2 } })
    },
    [controls],
  )

  // ── The peek ──────────────────────────────────────────────────────────────
  const peek = useCallback(async () => {
    if (reduced || isChatOpen || document.hidden || peeking || ouch) return

    const token = ++run.current
    const alive = () => run.current === token

    setPeeking(true)

    // Off to the right, behind the edge of the window. The clipping frame below is
    // what hides it, so nothing is ever drawn outside the page.
    await controls.start({ x: 74, rotate: 6, transition: { duration: 0.55, ease: 'easeIn' } })
    if (!alive()) return

    // Back out just far enough that the head and one hand clear the edge.
    await controls.start({
      x: 40,
      rotate: -6,
      transition: { type: 'spring', stiffness: 200, damping: 16 },
    })
    if (!alive()) return

    // Caught looking. Three blinks, then it walks back as if nothing happened.
    await new Promise((r) => setTimeout(r, 2600))
    if (!alive()) return

    setPeeking(false)
    await comeBack(false)
  }, [controls, comeBack, isChatOpen, peeking, ouch, reduced])

  useEffect(() => {
    if (reduced) return
    let timer: ReturnType<typeof setTimeout>

    const schedule = (delay: number) => {
      timer = setTimeout(() => {
        peek()
        schedule(PEEK_EVERY_MS + Math.random() * PEEK_JITTER_MS)
      }, delay)
    }

    schedule(FIRST_PEEK_MS + Math.random() * PEEK_JITTER_MS)
    return () => clearTimeout(timer)
  }, [peek, reduced])

  useEffect(() => {
    // Opening the chat ends whatever it was doing, immediately.
    if (isChatOpen) {
      run.current += 1
      setPeeking(false)
      controls.start({ x: 0, y: 0, rotate: 0, transition: { duration: 0.2 } })
    }
  }, [isChatOpen, controls])

  useEffect(() => () => clearTimeout(ouchTimer.current), [])

  const startled = () => {
    // Only a yelp if it was actually up to something. Hovering a robot standing
    // quietly in its corner has hurt nobody.
    if (!peeking || ouch) return
    comeBack(true)
  }

  const dismiss = () => {
    setNudge(null)
    setSilenced(true)
  }

  return (
    <>
      {!isChatOpen && (
        <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
          <AnimatePresence>
            {ouch && (
              <motion.div
                key="ouch"
                initial={{ opacity: 0, y: 6, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-800 shadow-md dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                role="status"
              >
                Ouch!
              </motion.div>
            )}

            {nudge && !ouch && (
              <motion.div
                key="nudge"
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

          {/* The frame it hides behind. Overflow is clipped here rather than by the
              window, so sliding right never extends the page or raises a scrollbar.
              Padded at the top so the walk's bounce is not cropped. */}
          <div className="relative h-[86px] w-[76px] overflow-hidden pt-4">
            <motion.button
              onClick={() => setIsChatOpen(true)}
              onHoverStart={startled}
              animate={controls}
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.96 }}
              aria-label="Open Aura Assist"
              title="Ask Aura Assist"
              className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
            >
              <motion.span
                className="block"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 18 }}
              >
                <AuraBot
                  // No drop-shadow. It was tuned for a white robot on a dark panel,
                  // where it read as depth; behind the slate one it renders as a grey
                  // rectangle of blur around the figure, which is the plate this
                  // character was drawn without on purpose.
                  className="h-16 w-16"
                  eyes={peeking ? 'burst' : 'auto'}
                  waving={waving}
                />
              </motion.span>
            </motion.button>
          </div>
        </div>
      )}

      <AuraAssist isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
    </>
  )
}
