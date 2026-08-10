import React, { useId } from 'react'

/**
 * A year, drawn as a folder.
 *
 * Years hold quarters the way a folder holds files, so the control says that rather
 * than making it a row of pills that look like filters. The shape follows Windows 11:
 * soft radii, a tab on the back panel, and a lighter front face over a slightly
 * darker back, which is what reads as "folder" before anyone has processed the label.
 *
 * The selected year opens: its front face drops and leans, so the state is carried by
 * the object itself and not only by a highlight around it.
 */

interface Props {
  open?: boolean
  className?: string
}

const YearFolder: React.FC<Props> = ({ open = false, className }) => {
  // Gradient ids are document-global, so two folders on a page would otherwise
  // fight over the same names and both take whichever rendered first.
  const uid = useId().replace(/:/g, '')
  const back = `folder-back-${uid}`
  const front = `folder-front-${uid}`

  return (
    <svg
      viewBox="0 0 48 40"
      className={className}
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={back} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#EDAE47" />
          <stop offset="100%" stopColor="#D0912E" />
        </linearGradient>
        <linearGradient id={front} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFDD96" />
          <stop offset="100%" stopColor="#F6C065" />
        </linearGradient>
      </defs>

      {/* Back panel, carrying the tab. */}
      <path
        d="M3 9.5A4.5 4.5 0 0 1 7.5 5h10.2a3 3 0 0 1 2.12.88L22.5 8.5H40.5A4.5 4.5 0 0 1 45 13v18a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"
        fill={`url(#${back})`}
      />

      {/* Front face. Open leans it forward and drops it, the way an opened folder
          tips its contents toward you. */}
      <path
        d={
          open
            ? 'M4.8 17.5h41.4a1.6 1.6 0 0 1 1.55 2l-3.4 13.2A3 3 0 0 1 41.45 35H6.6a3 3 0 0 1-3-3V20.5a3 3 0 0 1 1.2-3Z'
            : 'M3 15.5h42V31a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z'
        }
        fill={`url(#${front})`}
      />
    </svg>
  )
}

export default YearFolder
