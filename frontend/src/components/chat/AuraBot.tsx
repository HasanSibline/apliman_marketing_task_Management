import React, { useId } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

/**
 * Aura, as a character.
 *
 * No plate, no circle, no tile: the robot sits directly on whatever is behind it, so
 * it reads as something present rather than an icon pasted onto a button. That means
 * the silhouette has to carry it, which is why the shapes are few and large and the
 * only fine detail is around the eyes, where a face is read.
 *
 * Depth comes from three things and no more: a vertical gradient down each white
 * shell, one soft shadow under the head where the body meets it, and a single
 * highlight on the visor. Anything further stops surviving at the size this is
 * actually drawn, which is a fifty-six pixel button in the corner of a screen.
 *
 * It is alive on purpose but quietly. It breathes, it blinks on an uneven rhythm
 * because a metronome reads as a machine, and once in a while it tips its head as
 * though it caught something. All of it stops for prefers-reduced-motion, where the
 * face simply sits still and open.
 */

interface Props {
  className?: string
  /** Eyes closed and head tilted, for while a reply is being written. */
  thinking?: boolean
  /** Set false for a still frame, e.g. beside a stored message. */
  alive?: boolean
  /**
   * `auto` is the idle rhythm. `burst` blinks three times and stops, which is what
   * it does after peeking out, where the blink is the joke rather than a background
   * tic and has to be deliberate enough to read as one.
   */
  eyes?: 'auto' | 'burst'
  /**
   * One raised hand, swung twice, then back down. Used to introduce a nudge: the
   * bubble arriving on its own is a notification, whereas being waved at first is
   * someone getting your attention before they say something, which is what this is.
   */
  waving?: boolean
}

const AuraBot: React.FC<Props> = ({
  className = 'h-10 w-10',
  thinking = false,
  alive = true,
  eyes = 'auto',
  waving = false,
}) => {
  // Gradient ids are document-global; two bots would otherwise share whichever
  // definition rendered first.
  const uid = useId().replace(/:/g, '')
  const shell = `bot-shell-${uid}`
  const visor = `bot-visor-${uid}`
  const glow = `bot-glow-${uid}`
  const shade = `bot-shade-${uid}`

  const still = useReducedMotion() || !alive

  // A blink has weight: the lid falls, rests shut for an instant, and opens more
  // slowly than it closed. The first version snapped through in a quarter second,
  // which read as a flicker in the rendering rather than as an eye. The delay is not
  // a round number, so successive blinks never settle into a visible pattern.
  const idleBlink = {
    animate: { scaleY: [1, 1, 0.06, 0.06, 1] },
    transition: {
      duration: 0.62,
      times: [0, 0.55, 0.72, 0.8, 1],
      repeat: Infinity,
      repeatDelay: 3.9,
      ease: 'easeInOut' as const,
    },
  }

  // Three, unhurried, then still. Read as counting rather than as a malfunction.
  const burstBlink = {
    animate: { scaleY: [1, 0.06, 1, 0.06, 1, 0.06, 1] },
    transition: {
      duration: 2.4,
      times: [0, 0.1, 0.24, 0.44, 0.58, 0.78, 1],
      ease: 'easeInOut' as const,
    },
  }

  const eye = still || thinking ? {} : eyes === 'burst' ? burstBlink : idleBlink

  /**
   * The wave. One arm only, because both is a robot doing jumping jacks.
   *
   * It lifts, swings twice from the shoulder, and lowers. The lift and the drop take
   * longer than the swings between them: an arm has weight, and a hand that snaps to
   * the top of its arc and snaps back reads as a sprite flipping between two frames.
   *
   * Rotated about the shoulder rather than the arm's own centre, or it would pivot
   * around its middle and read as a spinning pill instead of a limb.
   */
  const wave =
    still || !waving
      ? {}
      : {
          animate: { rotate: [0, -62, -48, -70, -48, -62, 0] },
          transition: {
            duration: 1.5,
            times: [0, 0.22, 0.38, 0.52, 0.66, 0.8, 1],
            ease: 'easeInOut' as const,
          },
        }

  // A slow rise and fall. Small enough to be felt rather than watched.
  const breathe = still
    ? {}
    : {
        animate: { y: [0, -0.9, 0] },
        transition: { duration: 3.6, repeat: Infinity, ease: 'easeInOut' as const },
      }

  // The glance. Rare, brief, and back to centre: it is the difference between a
  // character and a logo that happens to move.
  const glance = still || thinking
    ? {}
    : {
        // Held. The tip itself is quick; the pause at the bottom is what makes it
        // look like attention rather than a twitch, so most of the duration is spent
        // there before it comes back up.
        animate: { rotate: [0, 0, -8, -8, -8, 0], x: [0, 0, -1, -1, -1, 0] },
        transition: {
          duration: 2.9,
          times: [0, 0.24, 0.36, 0.76, 0.84, 1],
          repeat: Infinity,
          repeatDelay: 9,
          ease: 'easeInOut' as const,
        },
      }

  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Aura Assist">
      <defs>
        {/* Themed through tokens rather than fixed hex. The robot was drawn white,
            which is right on the dark chat panel and wrong everywhere else: on a light
            page a white shell against white has no edge, and what is left reads as a
            pale blob sitting on a plate. In light it wears Aura's slate instead, and
            the visor drops to near-black so the face still separates from the shell.
            See --bot-* in index.css. */}
        {/* Set through style rather than the stopColor attribute. A presentation
            attribute holding var() is resolved by some engines and dropped by others,
            and where it is dropped the stop falls back to black and the robot renders
            as a silhouette. The style property is plain CSS and resolves everywhere. */}
        <linearGradient id={shell} x1="0.25" y1="0" x2="0.75" y2="1">
          <stop offset="0%" style={{ stopColor: 'var(--bot-shell-0)' }} />
          <stop offset="55%" style={{ stopColor: 'var(--bot-shell-1)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--bot-shell-2)' }} />
        </linearGradient>
        <linearGradient id={visor} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" style={{ stopColor: 'var(--bot-visor-0)' }} />
          <stop offset="45%" style={{ stopColor: 'var(--bot-visor-1)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--bot-visor-2)' }} />
        </linearGradient>
        <radialGradient id={glow}>
          <stop offset="0%" stopColor="#7DD3FC" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#38BDF8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={shade} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0B1220" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#0B1220" stopOpacity="0" />
        </linearGradient>
      </defs>

      <motion.g {...breathe}>
        {/* Arms, behind the body so no join is ever visible. */}
        <ellipse cx="11.5" cy="45" rx="4.3" ry="6.2" fill={`url(#${shell})`} transform="rotate(-20 11.5 45)" />
        {/* The waving arm. Its own group so the swing pivots at the shoulder, up at
            the top of the arm, rather than at the ellipse's centre. */}
        {/* originX/originY, not style.transformOrigin: framer-motion recomputes an
            SVG element's transform-origin from its bounding box whenever it animates
            a transform, and writes that over anything set in style. The head group
            below sets its pivot the same way for the same reason. */}
        <motion.g {...wave} style={{ originX: '52.5px', originY: '40px' }}>
          <ellipse cx="52.5" cy="45" rx="4.3" ry="6.2" fill={`url(#${shell})`} transform="rotate(20 52.5 45)" />
        </motion.g>

        {/* Body. Wide and low, so the head has something to sit on at any size. */}
        <path
          d="M18 47c0-6.2 6.3-9.4 14-9.4S46 40.8 46 47v7.5a5.5 5.5 0 0 1-5.5 5.5h-17A5.5 5.5 0 0 1 18 54.5Z"
          fill={`url(#${shell})`}
        />

        <motion.g {...glance} style={{ originX: '32px', originY: '38px' }}>
          {/* The shadow the head casts on the chest: the one cue that says these are
              two objects rather than one flat shape. */}
          <ellipse cx="32" cy="40.5" rx="15" ry="3.4" fill={`url(#${shade})`} />

          {/* Head */}
          <rect x="12.5" y="10" width="39" height="29" rx="12.5" fill={`url(#${shell})`} />
          <rect x="17" y="14.5" width="30" height="20" rx="9.5" fill={`url(#${visor})`} />

          {/* Light thrown by the eyes onto the visor. */}
          <ellipse cx="32" cy="24.5" rx="13" ry="8" fill={`url(#${glow})`} opacity="0.5" />

          {thinking ? (
            <>
              <rect x="23.5" y="23.5" width="7" height="2.2" rx="1.1" fill="#7DD3FC" />
              <rect x="33.5" y="23.5" width="7" height="2.2" rx="1.1" fill="#7DD3FC" />
            </>
          ) : (
            <>
              <motion.rect
                x="24" y="19.5" width="5.4" height="10" rx="2.7" fill="#38BDF8"
                style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                {...eye}
              />
              <motion.rect
                x="34.6" y="19.5" width="5.4" height="10" rx="2.7" fill="#38BDF8"
                style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                {...eye}
              />
              {/* One catchlight. Two makes it a mask; none makes it a screen. */}
              <circle cx="37.6" cy="21.8" r="1.5" fill="#FFFFFF" opacity="0.92" />
            </>
          )}

          {/* Sheen across the top of the visor, the last thing that makes it glass. */}
          <path d="M19.5 20.5c2.5-4 8-5.5 14-5.5-6.5 1.8-10.5 4.5-12.5 8Z" fill="#FFFFFF" opacity="0.13" />
        </motion.g>
      </motion.g>
    </svg>
  )
}

export default AuraBot
