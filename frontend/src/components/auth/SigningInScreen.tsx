import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { CheckIcon } from '@heroicons/react/24/solid'
import { AuraLogo } from '@/components/brand/AuraMark'
import AuraBot from '@/components/chat/AuraBot'
import api from '@/services/api'

/**
 * The moment between signing in and arriving.
 *
 * A spinner here would be honest and forgettable. This is the one screen every person
 * sees on every visit, and the workspace behind it genuinely needs a few seconds to
 * fetch, so the wait exists either way: the only question is whether it says anything.
 * This one shows the product doing the three things the product is for, on the same
 * dark ground and built from the same surfaces as the sign-in page it follows, so the
 * two read as one continuous room rather than a page and then a loading screen.
 *
 * A pointer moves and acts rather than things simply appearing. Motion that has a
 * cause reads as somebody working; the same cards fading in on a timer read as a
 * slideshow. It is deliberately unhurried, because a cursor that snaps between targets
 * looks like a script and one that eases into them looks like a hand.
 *
 * What it shows is this person's own work. The token is stored and set on the client
 * before this mounts, so the screen fetches the ticket and task actually waiting for
 * them and puts those on the cards: their reference numbers, their titles, their
 * counts. A rehearsal with invented content is a screenshot with a cursor drawn on
 * it, and it reads as one the second time you see the same fictional TCK-1042.
 *
 * The fetch cannot hold anything up. It is fire-and-forget with a short timeout, the
 * cards render placeholder text until it lands, and every request failing leaves the
 * screen exactly as it was. The requests are ones the workspace behind is making
 * anyway, so they warm the cache rather than competing with it.
 *
 * It can always be skipped, and it never blocks: if the app is ready first it still
 * plays out, and if it finishes first the app is already waiting. Under
 * prefers-reduced-motion the choreography is dropped entirely and the finished
 * workspace is shown still, briefly.
 */

interface Props {
  name?: string | null
  onDone: () => void
}

/** Where the pointer travels, as a share of the stage. */
const MARKS = {
  rest: { x: 8, y: 88 },
  ticket: { x: 26, y: 30 },
  task: { x: 22, y: 62 },
  chat: { x: 72, y: 74 },
} as const

type Beat =
  | 'idle'
  | 'toTicket'
  | 'openTicket'
  | 'toTask'
  | 'tickTask'
  | 'toChat'
  | 'typing'
  | 'thinking'
  | 'answered'
  | 'leaving'

/** Each beat, and how long it holds before the next one. */
const SCRIPT: [Beat, number][] = [
  ['idle', 450],
  ['toTicket', 900],
  ['openTicket', 1250],
  ['toTask', 800],
  ['tickTask', 1150],
  ['toChat', 800],
  ['typing', 1500],
  ['thinking', 1100],
  ['answered', 1500],
  // Long enough for the exit to finish before onDone navigates. Cut this below the
  // 0.55s transition and the screen vanishes mid-move.
  ['leaving', 700],
]

const QUESTION = 'What needs me today?'

/** This person's actual work, once it arrives. Null until then. */
interface Real {
  ticketRef?: string
  ticketTitle?: string
  ticketFrom?: string
  taskRef?: string
  taskTitle?: string
  openTasks?: number
  dueToday?: number
}

const SigningInScreen: React.FC<Props> = ({ name, onDone }) => {
  const reduced = useReducedMotion()
  const [beat, setBeat] = useState<Beat>('idle')
  const [typed, setTyped] = useState('')
  const [real, setReal] = useState<Real>({})

  // Their own board, fetched alongside the animation rather than before it. Nothing
  // here is awaited by the script: whatever has arrived by the time a card paints is
  // what that card shows, and anything that fails simply never replaces its
  // placeholder.
  useEffect(() => {
    let live = true
    const opts = { timeout: 6000 }

    Promise.allSettled([
      api.get('/tickets', { ...opts, params: { limit: 5 } }),
      api.get('/tasks/my-tasks', { ...opts, params: { limit: 5 } }),
    ]).then(([tickets, tasks]) => {
      if (!live) return
      const next: Real = {}

      if (tickets.status === 'fulfilled') {
        const list = tickets.value.data?.tickets ?? tickets.value.data ?? []
        const t = Array.isArray(list) ? list[0] : undefined
        if (t) {
          next.ticketRef = t.ticketNumber
          next.ticketTitle = t.title
          next.ticketFrom = t.requester?.name ?? t.receiverDept?.name
        }
      }

      if (tasks.status === 'fulfilled') {
        const data = tasks.value.data
        const list = data?.tasks ?? data ?? []
        const arr: any[] = Array.isArray(list) ? list : []
        const open = arr.filter((t) => !t.completedAt)
        const t = open[0] ?? arr[0]
        if (t) {
          next.taskRef = t.taskNumber
          next.taskTitle = t.title
        }
        next.openTasks = open.length
        const today = new Date().toDateString()
        next.dueToday = open.filter(
          (t) => t.dueDate && new Date(t.dueDate).toDateString() === today,
        ).length
      }

      setReal(next)
    })

    return () => {
      live = false
    }
  }, [])

  // Reduced motion gets the finished picture and a short pause, not a fast version of
  // the same movement: the objection is to the movement, not to its speed.
  useEffect(() => {
    if (reduced) {
      setBeat('answered')
      setTyped(QUESTION)
      const done = setTimeout(onDone, 1200)
      return () => clearTimeout(done)
    }

    const timers: ReturnType<typeof setTimeout>[] = []
    let at = 0

    for (const [next, hold] of SCRIPT) {
      timers.push(setTimeout(() => setBeat(next), at))
      at += hold
    }
    timers.push(setTimeout(onDone, at))

    return () => timers.forEach(clearTimeout)
  }, [reduced, onDone])

  // Typed a character at a time, because the whole sentence appearing at once is the
  // one thing in here that would give the game away.
  useEffect(() => {
    if (reduced || beat !== 'typing') return
    let i = 0
    const id = setInterval(() => {
      i += 1
      setTyped(QUESTION.slice(0, i))
      if (i >= QUESTION.length) clearInterval(id)
    }, 55)
    return () => clearInterval(id)
  }, [beat, reduced])

  const reached = (b: Beat) => SCRIPT.findIndex(([x]) => x === b) <= SCRIPT.findIndex(([x]) => x === beat)

  const ticketOpen = reached('openTicket')
  const taskDone = reached('tickTask')
  const chatting = reached('typing')
  const thinking = beat === 'thinking'
  const answered = reached('answered')

  const pointer =
    beat === 'toTicket' || beat === 'openTicket'
      ? MARKS.ticket
      : beat === 'toTask' || beat === 'tickTask'
        ? MARKS.task
        : beat === 'toChat' || chatting
          ? MARKS.chat
          : MARKS.rest

  const leaving = beat === 'leaving'

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: leaving ? 0 : 1 }}
      // Slower going than coming. Arriving should be immediate; leaving is the one
      // moment the screen is handing something over, and cutting it short reads as
      // the screen being switched off rather than the workspace opening.
      transition={{ duration: leaving ? 0.55 : 0.35, ease: leaving ? [0.4, 0, 0.2, 1] : 'linear' }}
      className="fixed inset-0 z-[300] overflow-hidden bg-gray-950"
      role="status"
      aria-label="Opening your workspace"
    >
      {/* The same two layers the sign-in page uses, so this is the same room. */}
      <motion.div
        className="pointer-events-none absolute -left-24 -top-24 h-[28rem] w-[28rem] rounded-full opacity-25 blur-3xl"
        style={{ background: 'rgb(var(--color-primary-600))' }}
        animate={{ scale: leaving && !reduced ? 1.6 : 1, opacity: leaving ? 0 : 0.25 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
          backgroundSize: '44px 44px',
        }}
      />

      {/* The stage pushes gently past the viewer on the way out, the way a camera moves
          through a doorway rather than cutting to the next shot. The dashboard lands
          underneath it a beat later, so the two read as one movement. */}
      <motion.div
        className="relative z-10 flex h-full flex-col"
        animate={
          reduced
            ? { opacity: leaving ? 0 : 1 }
            : { scale: leaving ? 1.05 : 1, opacity: leaving ? 0 : 1, filter: leaving ? 'blur(8px)' : 'blur(0px)' }
        }
        transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1] }}
      >
        <div className="flex items-center justify-between p-6 sm:p-10">
          <AuraLogo monochrome className="text-white [&_span]:text-white" size="md" subtitle="Operations" />
          <button
            onClick={onDone}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:bg-white/5 hover:text-gray-200"
          >
            Skip
          </button>
        </div>

        {/* The stage. Everything inside is positioned as a share of this box, so the
            pointer and the cards cannot drift apart on a different screen. */}
        <div className="relative mx-auto w-full max-w-3xl flex-1 px-6 pb-6 sm:px-10">
          <div className="relative h-full">
            {/* ── The ticket ─────────────────────────────────────────────── */}
            <motion.div
              className="absolute left-0 top-[14%] w-[62%] max-w-sm rounded-xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur"
              animate={{
                borderColor: ticketOpen ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.10)',
                y: ticketOpen ? -2 : 0,
              }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium tracking-wide text-gray-400">
                    {real.ticketRef ?? 'Ticket'}
                  </p>
                  <p className="mt-1 truncate text-sm font-medium text-white">
                    {real.ticketTitle ?? 'Opening your tickets'}
                  </p>
                </div>
                <AnimatePresence mode="wait">
                  <motion.span
                    key={ticketOpen ? 'open' : 'pending'}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.2 }}
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      ticketOpen
                        ? 'bg-emerald-400/15 text-emerald-300'
                        : 'bg-amber-400/15 text-amber-300'
                    }`}
                  >
                    {ticketOpen ? 'Approved' : 'Pending'}
                  </motion.span>
                </AnimatePresence>
              </div>

              <AnimatePresence>
                {ticketOpen && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-3 overflow-hidden text-xs leading-relaxed text-gray-400"
                  >
                    {real.ticketFrom
                      ? `Raised by ${real.ticketFrom}. Everything on it is loaded and waiting.`
                      : 'Loaded, with every comment and attachment on it.'}
                  </motion.p>
                )}
              </AnimatePresence>
            </motion.div>

            {/* ── The task ───────────────────────────────────────────────── */}
            <motion.div
              className="absolute left-[6%] top-[46%] w-[58%] max-w-sm rounded-xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur"
              animate={{ borderColor: taskDone ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.10)' }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex items-center gap-3">
                <motion.span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border"
                  animate={{
                    backgroundColor: taskDone ? 'rgb(var(--color-primary-600))' : 'rgba(255,255,255,0.04)',
                    borderColor: taskDone ? 'rgb(var(--color-primary-600))' : 'rgba(255,255,255,0.25)',
                    scale: taskDone ? [1, 1.18, 1] : 1,
                  }}
                  transition={{ duration: 0.32 }}
                >
                  {taskDone && (
                    <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}>
                      <CheckIcon className="h-3.5 w-3.5 text-white" />
                    </motion.span>
                  )}
                </motion.span>

                <div className="min-w-0 flex-1">
                  <motion.p
                    className="truncate text-sm font-medium"
                    animate={{ color: taskDone ? 'rgb(156,163,175)' : 'rgb(255,255,255)' }}
                  >
                    {real.taskTitle ?? 'Gathering your tasks'}
                  </motion.p>
                  <p className="text-xs text-gray-500">
                    {[real.taskRef, real.dueToday ? `${real.dueToday} due today` : null]
                      .filter(Boolean)
                      .join(' · ') || 'Your board'}
                  </p>
                </div>
              </div>

              <div className="mt-3.5 flex items-center gap-1.5">
                {[0, 1, 2, 3].map((i) => (
                  <motion.div
                    key={i}
                    className="h-1 flex-1 rounded-full"
                    animate={{
                      background:
                        i < (taskDone ? 4 : 2)
                          ? 'rgb(var(--color-primary-500))'
                          : 'rgba(255,255,255,0.14)',
                    }}
                    transition={{ duration: 0.25, delay: taskDone ? i * 0.06 : 0 }}
                  />
                ))}
              </div>
            </motion.div>

            {/* ── Aura ───────────────────────────────────────────────────── */}
            <div className="absolute bottom-[6%] right-0 w-[64%] max-w-sm">
              <AnimatePresence>
                {answered && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-2.5 flex items-start gap-2.5"
                  >
                    {/* The assistant's own face here too, the same one that answers
                        in the real panel. */}
                    <AuraBot className="mt-0.5 h-7 w-7 shrink-0" alive={false} />
                    <div className="rounded-xl rounded-tl-sm border border-white/10 bg-white/[0.07] px-3.5 py-2.5 backdrop-blur">
                      <p className="text-xs leading-relaxed text-gray-300">
                        {/* The answer is assembled from what was actually fetched, so
                            the rehearsal ends on something true. */}
                        {real.openTasks
                          ? `${real.openTasks} ${real.openTasks === 1 ? 'task' : 'tasks'} open${
                              real.dueToday ? `, ${real.dueToday} due today` : ''
                            }${real.ticketRef ? `, and ${real.ticketRef} waiting on you` : ''}.`
                          : 'Everything of yours is loaded and ready.'}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.div
                className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2.5 backdrop-blur"
                animate={{ borderColor: chatting ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.10)' }}
              >
                <AuraBot className="h-7 w-7 shrink-0" thinking={thinking} />
                <p className="min-w-0 flex-1 truncate text-xs text-gray-300">
                  {typed || <span className="text-gray-500">Ask Aura anything</span>}
                  {beat === 'typing' && (
                    <motion.span
                      animate={{ opacity: [1, 0, 1] }}
                      transition={{ duration: 0.9, repeat: Infinity }}
                      className="ml-0.5 inline-block h-3 w-px translate-y-0.5 bg-gray-300"
                    />
                  )}
                </p>
              </motion.div>
            </div>

            {/* ── The pointer ────────────────────────────────────────────── */}
            {!reduced && (
              <motion.div
                className="pointer-events-none absolute z-20"
                initial={false}
                animate={{ left: `${pointer.x}%`, top: `${pointer.y}%` }}
                // Eased rather than sprung: a hand arrives and settles, it does not
                // overshoot and correct.
                transition={{ duration: 0.62, ease: [0.33, 1, 0.68, 1] }}
              >
                <motion.div
                  animate={{
                    scale: beat === 'openTicket' || beat === 'tickTask' || beat === 'typing' ? [1, 0.82, 1] : 1,
                  }}
                  transition={{ duration: 0.28 }}
                >
                  <svg viewBox="0 0 24 24" className="h-6 w-6 drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]">
                    <path
                      d="M5 2.5 19 12l-6.4 1.3L9.9 20 5 2.5Z"
                      fill="white"
                      stroke="rgba(15,23,42,0.55)"
                      strokeWidth="1.1"
                      strokeLinejoin="round"
                    />
                  </svg>
                </motion.div>
              </motion.div>
            )}
          </div>
        </div>

        <p className="relative z-10 border-t border-white/10 px-6 py-4 text-xs text-gray-500 sm:px-10">
          {name ? `Opening your workspace, ${name.split(' ')[0]}.` : 'Opening your workspace.'}
        </p>
      </motion.div>
    </motion.div>
  )
}

export default SigningInScreen
