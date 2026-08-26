import React, { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { BRAND } from '@/config/brand'

/**
 * The mark, drawing itself.
 *
 * Same three arcs and centre point as AuraMark (see components/brand/AuraMark.tsx
 * and IDENTITY.md #2): a unit of work at the centre, the arcs it sweeps through
 * growing outward and fading as they go. AuraMark itself stays a static brand
 * asset for headers and sidebars; this is a separate, animated drawing of the same
 * geometry so the identity's own idea, work in motion, is what the wait looks like
 * rather than a generic spinner standing in for it.
 *
 * Each arc draws in, holds, and fades, staggered outward from the centre so the
 * sweep reads as one continuous gesture rather than three shapes blinking in turn.
 */
const AuraMarkLoader: React.FC<{ className?: string }> = ({ className = 'h-16 w-16' }) => {
  const stillness = useReducedMotion()

  const sweep = (delay: number) => ({
    initial: { pathLength: 0, opacity: 0 },
    animate: stillness
      ? { pathLength: 1, opacity: 1 }
      : { pathLength: [0, 1, 1], opacity: [0, 1, 1] },
    transition: stillness
      ? { duration: 0 }
      : { duration: 1.8, times: [0, 0.55, 1], repeat: Infinity, repeatDelay: 0.4, delay, ease: 'easeInOut' },
  })

  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} role="img" aria-label={`Loading ${BRAND.name}`}>
      <motion.path
        d="M27.5 16a11.5 11.5 0 0 0-11.5-11.5"
        stroke="rgb(var(--color-primary-300))"
        strokeWidth="2.5"
        strokeLinecap="round"
        {...sweep(0.3)}
      />
      <motion.path
        d="M22.5 16A6.5 6.5 0 0 0 16 9.5"
        stroke="rgb(var(--color-primary-400))"
        strokeWidth="2.5"
        strokeLinecap="round"
        {...sweep(0.15)}
      />
      <motion.path
        d="M16 27.5a11.5 11.5 0 1 1 0-23"
        stroke="rgb(var(--color-primary-600))"
        strokeWidth="2.5"
        strokeLinecap="round"
        {...sweep(0)}
      />
      <motion.circle
        cx="16"
        cy="16"
        r="3"
        fill="rgb(var(--color-primary-600))"
        initial={{ scale: 0.85 }}
        animate={stillness ? { scale: 1 } : { scale: [0.85, 1.05, 0.85] }}
        transition={stillness ? { duration: 0 } : { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        style={{ transformOrigin: '16px 16px' }}
      />
    </svg>
  )
}

const LoadingScreen: React.FC = () => {
  // A warm start is over in well under a second. Anything past a few seconds is the
  // backend waking, and saying so is the difference between a wait and a hang: the
  // screen is identical either way, so without a word it reads as broken.
  const [slowToStart, setSlowToStart] = useState(false)

  useEffect(() => {
    const id = setTimeout(() => setSlowToStart(true), 4000)
    return () => clearTimeout(id)
  }, [])

  return (
    <div className="app-backdrop flex min-h-screen items-center justify-center bg-white dark:bg-gray-900">
      <div className="surface flex w-full max-w-sm flex-col items-center gap-5 px-8 py-10 text-center">
        <AuraMarkLoader />

        <div>
          <p className="text-xl font-semibold tracking-tight text-gray-900 dark:text-white">
            {BRAND.fullName}
          </p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {slowToStart
              ? 'The server was asleep and is waking up. This first load takes a little longer.'
              : 'Preparing your workspace'}
          </p>
        </div>
      </div>
    </div>
  )
}

export default LoadingScreen
