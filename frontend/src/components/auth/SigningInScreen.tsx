import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { CheckIcon } from '@heroicons/react/24/solid'
import { SparklesIcon } from '@heroicons/react/24/outline'
import { AuraLogo } from '@/components/brand/AuraMark'
import AuraBot from '@/components/chat/AuraBot'
import api, { formatAssetUrl } from '@/services/api'

/**
 * The moment between signing in and arriving.
 *
 * A spinner here would be honest and forgettable. This is the one screen every person
 * sees on every visit, and the workspace behind it genuinely needs a few seconds to
 * fetch, so the wait exists either way: the only question is whether it says anything.
 * This one shows the product doing what the product is for, on the same dark ground
 * and built from the same surfaces as the sign-in page it follows, so the two read as
 * one continuous room rather than a page and then a loading screen.
 *
 * A pointer moves and acts rather than things simply appearing. Motion that has a
 * cause reads as somebody working; the same cards fading in on a timer read as a
 * slideshow. It is deliberately unhurried, because a cursor that snaps between targets
 * looks like a script and one that eases into them looks like a hand.
 *
 * What it shows is this person's own work. The token is stored and set on the client
 * before this mounts, so the screen fetches the ticket and tasks actually waiting for
 * them and puts those on the cards. A rehearsal with invented content is a screenshot
 * with a cursor drawn on it, and it reads as one the second time you see the same
 * fictional TCK-1042. The fetch cannot hold anything up: fire-and-forget with a short
 * timeout, placeholders until it lands, unchanged if it never does.
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

/**
 * Where every panel sits, as a share of the stage, and the point on it the pointer
 * aims for.
 *
 * One table rather than two. The cards were positioned with Tailwind percentages and
 * the pointer with its own unrelated set of numbers, so the two drifted apart and the
 * cursor clicked empty space beside the thing it was supposed to be opening. Now the
 * card reads its box from here and the pointer reads its target from the same row, so
 * they cannot disagree: `aim` is a point inside the panel, expressed as a share of
 * that panel, and resolved against the same rect the card is drawn in.
 */
const PANELS = {
  ticket: { x: 3, y: 8, w: 44, aim: { x: 0.5, y: 0.35 } },
  task: { x: 3, y: 43, w: 44, aim: { x: 0.09, y: 0.34 } }, // the checkbox, not the middle
  stats: { x: 53, y: 8, w: 44, aim: { x: 0.5, y: 0.5 } },
  agenda: { x: 53, y: 41, w: 44, aim: { x: 0.5, y: 0.86 } }, // the summarise button
  // y is an aim point for the pointer here, not a position. The chat lane is pinned to
  // the bottom of the stage instead, because it is the one panel that grows upward: the
  // answer bubble renders above the input. Positioned from the top at 80 it sat across
  // the agenda card's summarise button on a short viewport, and simply moving it down
  // would have pushed the input off the bottom of the screen once an answer appeared.
  chat: { x: 3, y: 86, w: 94, aim: { x: 0.5, y: 0.5 } },
} as const

type PanelName = keyof typeof PANELS

/** Absolute stage coordinates for a panel's aim point, in percent. */
function aimAt(panel: PanelName) {
  const p = PANELS[panel]
  // Height is not in the table because each card sizes to its content. Aiming uses a
  // nominal height per panel, which is enough for the pointer to land on the control
  // rather than merely inside the card.
  const heights: Record<PanelName, number> = {
    ticket: 26,
    task: 24,
    stats: 28,
    agenda: 34,
    chat: 12,
  }
  return { x: p.x + p.w * p.aim.x, y: p.y + heights[panel] * p.aim.y }
}

const REST = { x: 8, y: 92 }

type Beat =
  | 'idle'
  | 'toTicket'
  | 'openTicket'
  | 'toTask'
  | 'tickTask'
  | 'toStats'
  | 'readStats'
  | 'toAgenda'
  | 'summarising'
  | 'summarised'
  | 'toChat'
  | 'typing'
  | 'thinking'
  | 'answered'
  | 'leaving'

/** Each beat, and how long it holds before the next one. */
/**
 * Each beat, and how long it holds before the next one.
 *
 * Five panels rather than three, and the whole thing still has to be over in about
 * twelve seconds. The travel beats are what got cut: a move only needs to be as long
 * as the pointer's own easing, while the beats where something is being read or
 * produced are what the screen is actually for and keep their time.
 */
const SCRIPT: [Beat, number][] = [
  ['idle', 350],
  ['toTicket', 680],
  ['openTicket', 900],
  ['toTask', 640],
  ['tickTask', 800],
  ['toStats', 640],
  ['readStats', 900],
  ['toAgenda', 640],
  ['summarising', 1000],
  ['summarised', 1150],
  ['toChat', 640],
  ['typing', 1300],
  ['thinking', 900],
  ['answered', 1250],
  // Long enough for the exit to finish before onDone navigates. Cut this below the
  // 0.55s transition and the screen vanishes mid-move.
  ['leaving', 700],
]

const QUESTION = 'What needs me today?'

/** This person's actual work, once it arrives. Empty until then. */
interface Real {
  ticketRef?: string
  ticketTitle?: string
  ticketFrom?: string
  taskRef?: string
  taskTitle?: string
  openTasks?: number
  dueToday?: number
  doneThisWeek?: number
  onTime?: number
  meetings?: { at: string; title: string }[]
}

const SigningInScreen: React.FC<Props> = ({ name, onDone }) => {
  const reduced = useReducedMotion()
  const [beat, setBeat] = useState<Beat>('idle')
  const [typed, setTyped] = useState('')
  const [real, setReal] = useState<Real>({})
  const [logos, setLogos] = useState<{ name: string; logo: string | null }[]>([])

  // Their own board, fetched alongside the animation rather than before it. Nothing
  // here is awaited by the script: whatever has arrived by the time a card paints is
  // what that card shows, and anything that fails never replaces its placeholder.
  useEffect(() => {
    let live = true
    const opts = { timeout: 6000 }

    Promise.allSettled([
      api.get('/tickets', { ...opts, params: { limit: 5 } }),
      api.get('/tasks/my-tasks', { ...opts, params: { limit: 20 } }),
      // Microsoft Graph, through our own route, bounded to today. Someone who has
      // never connected an account gets nothing back, which is why the agenda card
      // has a sensible default rather than an empty state: this is a loading screen,
      // not a place to be told what you have not set up.
      api.get('/microsoft/events', {
        ...opts,
        params: {
          start: new Date(new Date().setHours(0, 0, 0, 0)).toISOString(),
          end: new Date(new Date().setHours(23, 59, 59, 999)).toISOString(),
        },
      }),
    ]).then(([tickets, tasks, events]) => {
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
        const arr: any[] = Array.isArray(data?.tasks ?? data) ? (data?.tasks ?? data) : []
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

        const weekAgo = Date.now() - 7 * 86_400_000
        const done = arr.filter((t) => t.completedAt && new Date(t.completedAt).getTime() >= weekAgo)
        next.doneThisWeek = done.length

        const dated = done.filter((t) => t.dueDate)
        if (dated.length) {
          const onTime = dated.filter(
            (t) => new Date(t.completedAt).getTime() < new Date(t.dueDate).getTime() + 86_400_000,
          ).length
          next.onTime = Math.round((onTime / dated.length) * 100)
        }
      }

      if (events.status === 'fulfilled') {
        const list = events.value.data
        if (Array.isArray(list) && list.length) {
          // Graph nests the time: start is { dateTime, timeZone }, not a string, and
          // reading it as one gives an Invalid Date on every row.
          const when = (e: any) => e?.start?.dateTime ?? e?.start
          next.meetings = list
            .slice(0, 3)
            .map((e: any) => {
              const at = when(e) ? new Date(when(e)) : null
              return {
                at: at && !isNaN(at.getTime())
                  ? at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : '',
                title: e.subject || 'Meeting',
              }
            })
        }
      }

      setReal(next)
    })

    return () => {
      live = false
    }
  }, [])

  // The wall behind everything. Failing leaves the rows empty, which is the design
  // without its wallpaper rather than a broken screen.
  useEffect(() => {
    let live = true
    api
      .get('/companies/logos', { timeout: 6000 })
      .then(({ data }) => {
        if (live && Array.isArray(data)) setLogos(data.filter((c) => c?.logo))
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  /**
   * Split in two, not repeated twice.
   *
   * One list running through both rows puts the same mark on screen twice at once a
   * few hundred pixels apart, and the eye reads that as a rendering fault rather than
   * as branding. Alternate entries go to alternate rows, so the two rows never carry
   * the same company.
   */
  const rowA = logos.filter((_, i) => i % 2 === 0)
  const rowB = logos.filter((_, i) => i % 2 === 1)

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

  const reached = (b: Beat) =>
    SCRIPT.findIndex(([x]) => x === b) <= SCRIPT.findIndex(([x]) => x === beat)

  const ticketOpen = reached('openTicket')
  const taskDone = reached('tickTask')
  const statsUp = reached('readStats')
  const summarising = beat === 'summarising'
  const summarised = reached('summarised')
  const chatting = reached('typing')
  const thinking = beat === 'thinking'
  const answered = reached('answered')
  const leaving = beat === 'leaving'

  // Which panel the hand is on, resolved through the same table the cards use.
  const pointer =
    beat === 'toTicket' || beat === 'openTicket'
      ? aimAt('ticket')
      : beat === 'toTask' || beat === 'tickTask'
        ? aimAt('task')
        : beat === 'toStats' || beat === 'readStats'
          ? aimAt('stats')
          : beat === 'toAgenda' || summarising || beat === 'summarised'
            ? aimAt('agenda')
            : beat === 'toChat' || chatting
              ? aimAt('chat')
              : REST

  const clicking =
    beat === 'openTicket' || beat === 'tickTask' || beat === 'summarising' || beat === 'typing'

  /** A panel's box, straight from the table. */
  const box = (p: PanelName) => ({
    left: `${PANELS[p].x}%`,
    top: `${PANELS[p].y}%`,
    width: `${PANELS[p].w}%`,
  })

  const card =
    'absolute rounded-xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm'

  /**
   * The week, with something to show before the numbers land.
   *
   * These read from `real` and fall back together, not field by field. Mixing one real
   * count with two invented ones would be worse than either: the card would look
   * authoritative while two thirds of it was made up.
   *
   * The fallback exists because the honest empty state is three zeroes and no bars,
   * which is what this card showed for anyone whose fetch had not returned yet, and
   * for every brand-new account. A chart of nothing does not demonstrate a chart.
   */
  const haveWeek = real.openTasks !== undefined
  const bars = haveWeek
    ? [
        { label: 'Open', value: real.openTasks ?? 0 },
        { label: 'Due today', value: real.dueToday ?? 0 },
        { label: 'Done, 7d', value: real.doneThisWeek ?? 0 },
      ]
    : [
        { label: 'Open', value: 7 },
        { label: 'Due today', value: 2 },
        { label: 'Done, 7d', value: 5 },
      ]
  // A real board of all zeroes still gets bars with a visible floor rather than an
  // empty frame, so the card reads as measured-and-empty rather than broken.
  const peak = Math.max(1, ...bars.map((b) => b.value))

  /** The chart row's height in pixels. Bars are sized against this, never against a
   *  percentage of a parent that has no height of its own to take a percentage of. */
  const TRACK_PX = 80

  const meetings = real.meetings ?? [
    { at: '10:00', title: 'Team stand-up' },
    { at: '13:30', title: 'Campaign review' },
    { at: '16:00', title: 'Client check-in' },
  ]

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

      {/* ── The wall of company marks ──────────────────────────────────────
          Two rows drifting right to left at different speeds, so they never line up
          into a grid, greyscale and faint because this is the room's wallpaper.

          The gap is a viewport width. That is the whole trick: an endless marquee has
          to repeat its content to have anything to loop back to, and with two or three
          companies on the platform the repeat lands beside the original and reads as
          the same logo printed twice. Spacing every mark a full screen apart means at
          most one is in view, so a copy is never on screen next to what it copies.

          Each rail is the content twice over and travels exactly half its own width,
          which is what makes the loop seamless: the second half arrives in precisely
          the position the first half left. */}
      {logos.length > 0 && !reduced && (
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
          {[
            { row: rowA, top: '20%', duration: 34 },
            { row: rowB, top: '68%', duration: 46 },
          ].map(({ row, top, duration }, r) =>
            row.length === 0 ? null : (
              <motion.div
                key={r}
                className="absolute flex w-max items-center"
                style={{ top, gap: '100vw', left: 0 }}
                initial={{ x: '0%' }}
                animate={{ x: '-50%' }}
                transition={{ duration, repeat: Infinity, ease: 'linear' }}
              >
                {[...row, ...row].map((c, i) => (
                  <img
                    key={`${c.name}-${i}`}
                    src={formatAssetUrl(c.logo)}
                    alt=""
                    className="h-14 w-auto max-w-[11rem] shrink-0 object-contain opacity-[0.08] grayscale invert"
                  />
                ))}
              </motion.div>
            ),
          )}
        </div>
      )}

      {/* ── The robot, looking in ──────────────────────────────────────────
          It starts beyond the right edge, comes fully into view, holds while the work
          happens, and withdraws the same way.

          Nothing clips it. An earlier version parked it half outside the window, which
          is what a hard vertical cut down its side looked like; it rests at right-10
          now, entirely on screen, and is only ever out of frame when it is meant to be
          gone. The page itself hides the overflow, so at rest off-stage it is simply
          not there.

          The picture, not the component: the chat mascot is inline SVG so it can
          breathe and take its colour from CSS variables, and neither survives being
          loaded through an img. */}
      {!reduced && (
        <motion.img
          src="/aura-bot.svg"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute right-10 top-[30%] z-0 h-56 w-56 opacity-90 drop-shadow-2xl"
          initial={{ x: 420 }}
          animate={{ x: [420, 0, 0, 420] }}
          transition={{
            duration: 12,
            times: [0, 0.14, 0.8, 1],
            repeat: Infinity,
            repeatDelay: 3,
            ease: [0.4, 0, 0.2, 1],
          }}
        />
      )}

      {/* The stage pushes gently past the viewer on the way out, the way a camera moves
          through a doorway rather than cutting to the next shot. The dashboard lands
          underneath it a beat later, so the two read as one movement. */}
      <motion.div
        className="relative z-10 flex h-full flex-col"
        animate={
          reduced
            ? { opacity: leaving ? 0 : 1 }
            : {
                scale: leaving ? 1.05 : 1,
                opacity: leaving ? 0 : 1,
                filter: leaving ? 'blur(8px)' : 'blur(0px)',
              }
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
        <div className="relative mx-auto w-full max-w-5xl flex-1 px-6 pb-6 sm:px-10">
          <div className="relative h-full">
            {/* ── The ticket ─────────────────────────────────────────────── */}
            <motion.div
              className={card}
              style={box('ticket')}
              animate={{
                borderColor: ticketOpen ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.10)',
                y: ticketOpen ? -2 : 0,
              }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium tracking-wide text-gray-400">
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
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      ticketOpen ? 'bg-emerald-400/15 text-emerald-300' : 'bg-amber-400/15 text-amber-300'
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
                      ? `Raised by ${real.ticketFrom}. Every comment and file on it is loaded.`
                      : 'Loaded, with every comment and attachment on it.'}
                  </motion.p>
                )}
              </AnimatePresence>
            </motion.div>

            {/* ── The task ───────────────────────────────────────────────── */}
            <motion.div
              className={card}
              style={box('task')}
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
                  <motion.span
                    key={i}
                    className="h-1 flex-1 rounded-full"
                    animate={{
                      backgroundColor:
                        taskDone || i < 2 ? 'rgb(var(--color-primary-500))' : 'rgba(255,255,255,0.12)',
                    }}
                    transition={{ duration: 0.3, delay: taskDone ? i * 0.07 : 0 }}
                  />
                ))}
              </div>
            </motion.div>

            {/* ── Analytics ──────────────────────────────────────────────── */}
            <motion.div
              className={card}
              style={box('stats')}
              animate={{ borderColor: statsUp ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.10)' }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-medium text-white">Your week</p>
                {/* Shown against the demonstration figures too, so the card is not
                    missing its headline number in the case it exists to cover. */}
                {(real.onTime !== undefined || !haveWeek) && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: statsUp ? 1 : 0 }}
                    className="text-[11px] font-medium text-emerald-300"
                  >
                    {real.onTime ?? 86}% on time
                  </motion.span>
                )}
              </div>

              {/* Bars grow from nothing when the pointer arrives, so the number is read
                  as being measured rather than as having always been there. */}
              {/*
                * Heights in pixels, not percentages.
                *
                * Each bar used to animate to a percentage height, but its parent was the
                * auto-height column wrapping it rather than the h-20 row. A percentage of
                * an indefinite height resolves to nothing, so every bar computed a height
                * and then drew at zero: the card showed a headline figure, a row of
                * labels, and a blank space where the chart belonged.
                *
                * TRACK_PX is the row's own height, so the arithmetic below is against a
                * number this file controls rather than against whatever the layout
                * happened to give the parent.
                */}
              <div className="mt-4 flex items-end gap-3" style={{ height: TRACK_PX }}>
                {bars.map((b, i) => (
                  <div key={b.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                    <span className="text-[11px] font-semibold tabular-nums text-gray-200">{b.value}</span>
                    <motion.div
                      className="w-full shrink-0 rounded-t bg-gradient-to-t from-primary-600 to-primary-400"
                      initial={{ height: 0 }}
                      animate={{
                        // A floor of 4px, so a genuine zero still reads as a measured
                        // zero rather than as a bar that failed to draw.
                        height: statsUp ? Math.max(4, (b.value / peak) * (TRACK_PX - 20)) : 0,
                      }}
                      transition={{ duration: 0.5, delay: i * 0.09, ease: 'easeOut' }}
                    />
                  </div>
                ))}
              </div>

              <div className="mt-2 flex justify-between">
                {bars.map((b) => (
                  <span key={b.label} className="flex-1 text-center text-[10px] text-gray-500">
                    {b.label}
                  </span>
                ))}
              </div>
            </motion.div>

            {/* ── Today's meetings, and the AI reading them ──────────────── */}
            <motion.div
              className={card}
              // The cap is what makes the lane a lane. Everything here is positioned by
              // percentage and sized by content, so without a ceiling this card grows
              // with whatever it is given and walks into the assistant below it.
              style={{ ...box('agenda'), maxHeight: '44vh', overflow: 'hidden' }}
              animate={{ borderColor: summarised ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.10)' }}
              transition={{ duration: 0.3 }}
            >
              <p className="text-sm font-medium text-white">Today</p>

              <div className="mt-3 space-y-2">
                {meetings.map((m) => (
                  <div key={m.title} className="flex items-center gap-2.5">
                    <span className="w-11 shrink-0 text-[11px] tabular-nums text-gray-500">{m.at}</span>
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary-500" />
                    <span className="truncate text-xs text-gray-300">{m.title}</span>
                  </div>
                ))}
              </div>

              {/* The button the pointer presses, then what it produced. */}
              <motion.div
                className="mt-3.5 flex items-center gap-2 rounded-lg border border-white/10 px-2.5 py-2"
                animate={{
                  backgroundColor: summarising ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.03)',
                  borderColor: summarising ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.10)',
                }}
              >
                <SparklesIcon
                  className={`h-3.5 w-3.5 shrink-0 ${summarising ? 'animate-pulse text-primary-300' : 'text-primary-400'}`}
                />
                <span className="text-[11px] font-medium text-gray-300">
                  {summarised ? 'Summarised by Aura' : summarising ? 'Reading your day…' : 'Summarise my day'}
                </span>
              </motion.div>

              <AnimatePresence>
                {summarised && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    transition={{ duration: 0.35 }}
                    className="mt-2.5 line-clamp-2 overflow-hidden text-[11px] leading-relaxed text-gray-400"
                  >
                    {meetings.length} meetings, back to back after lunch.
                    {real.dueToday ? ` ${real.dueToday} due today, so the morning is the only clear run.` : ' The morning is your clear run.'}
                  </motion.p>
                )}
              </AnimatePresence>
            </motion.div>

            {/* ── The assistant ──────────────────────────────────────────── */}
            <div
              className="absolute"
              style={{ left: `${PANELS.chat.x}%`, width: `${PANELS.chat.w}%`, bottom: '5%' }}
            >
              <AnimatePresence>
                {answered && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-2.5 flex items-start gap-2.5"
                  >
                    <AuraBot className="mt-0.5 h-7 w-7 shrink-0" alive={false} />
                    <div className="rounded-xl rounded-tl-sm border border-white/10 bg-white/[0.07] px-3.5 py-2.5 backdrop-blur">
                      <p className="text-xs leading-relaxed text-gray-300">
                        {/* Assembled from what was actually fetched, so the rehearsal
                            ends on something true. */}
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
                      className="ml-0.5 inline-block h-3 w-px translate-y-0.5 bg-gray-300"
                      animate={{ opacity: [1, 0, 1] }}
                      transition={{ duration: 0.9, repeat: Infinity }}
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
                <motion.div animate={{ scale: clicking ? [1, 0.82, 1] : 1 }} transition={{ duration: 0.28 }}>
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
