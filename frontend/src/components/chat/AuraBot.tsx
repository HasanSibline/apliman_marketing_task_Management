import React, { useId } from 'react'

/**
 * Aura's face.
 *
 * The launcher wore a speech-bubble glyph, which is what every chat widget on the
 * internet wears and says nothing about what is behind it. A character does: people
 * address a face differently from a form, and this one has to survive being drawn at
 * fifty-six pixels in the corner of a screen, so it is built from large shapes with
 * one point of focus, the eyes, and no detail that would turn to mush.
 *
 * Drawn rather than exported. A raster mascot needs a file per density and goes soft
 * on the ones nobody remembered to export; this stays sharp at any size, themes with
 * the page, and costs a few hundred bytes.
 */

interface Props {
  className?: string
  /** Eyes close and the head tips while a reply is being written. */
  thinking?: boolean
}

const AuraBot: React.FC<Props> = ({ className = 'h-10 w-10', thinking = false }) => {
  // Gradient ids are document-global; two bots on a page would otherwise both take
  // whichever rendered first.
  const uid = useId().replace(/:/g, '')
  const sky = `bot-sky-${uid}`
  const shell = `bot-shell-${uid}`
  const glass = `bot-glass-${uid}`

  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Aura Assist">
      <defs>
        <linearGradient id={sky} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#1D4ED8" />
        </linearGradient>
        <linearGradient id={shell} x1="0.3" y1="0" x2="0.7" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#DCE7F7" />
        </linearGradient>
        <linearGradient id={glass} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0%" stopColor="#1E293B" />
          <stop offset="100%" stopColor="#0B1220" />
        </linearGradient>
      </defs>

      <circle cx="32" cy="32" r="32" fill={`url(#${sky})`} />

      {/* A single sweep behind the character, catching the light the way the arcs in
          the Aura mark do, so the two read as the same family. */}
      <path
        d="M-2 44C10 40 16 26 30 18 44 10 56 12 66 4v64H-2Z"
        fill="#FFFFFF"
        opacity="0.07"
      />

      {/* Arms first, so the body overlaps them and the joins never show. */}
      <ellipse cx="13.5" cy="42" rx="4.6" ry="6.4" fill={`url(#${shell})`} transform="rotate(-18 13.5 42)" />
      <ellipse cx="50.5" cy="42" rx="4.6" ry="6.4" fill={`url(#${shell})`} transform="rotate(18 50.5 42)" />

      <g transform={thinking ? 'rotate(-4 32 30)' : undefined}>
        {/* Head */}
        <rect x="14" y="12" width="36" height="26" rx="11" fill={`url(#${shell})`} />
        {/* Visor. Inset so the white shell reads as thickness rather than an outline. */}
        <rect x="18.5" y="16.5" width="27" height="17" rx="8" fill={`url(#${glass})`} />

        {thinking ? (
          // Closed eyes: two strokes. A blink is the cheapest way to show attention
          // without animating anything that would distract at this size.
          <>
            <rect x="24" y="24" width="6.5" height="2" rx="1" fill="#7DD3FC" />
            <rect x="33.5" y="24" width="6.5" height="2" rx="1" fill="#7DD3FC" />
          </>
        ) : (
          <>
            <rect x="24.5" y="21.5" width="5" height="8" rx="2.5" fill="#38BDF8" />
            <rect x="34.5" y="21.5" width="5" height="8" rx="2.5" fill="#38BDF8" />
            {/* One catchlight, not two: it is what stops the face reading as a mask. */}
            <circle cx="37.6" cy="23.6" r="1.5" fill="#FFFFFF" opacity="0.9" />
          </>
        )}
      </g>

      {/* Body, wide and low, so the whole thing sits inside the circle at small sizes. */}
      <path d="M20 42c0-5.5 5.4-8 12-8s12 2.5 12 8v9a5 5 0 0 1-5 5H25a5 5 0 0 1-5-5Z" fill={`url(#${shell})`} />
    </svg>
  )
}

export default AuraBot
