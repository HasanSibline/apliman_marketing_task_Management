import React from 'react';

/**
 * The Aura mark.
 *
 * Three arcs sweeping around a single point — work moving through workflow phases,
 * which is the one idea the whole product is built on. The arcs grow outward and
 * fade, which is where the name comes from. Drawn on a 32x32 grid with 2.5px
 * strokes so it still reads at favicon size, where a detailed mark would turn to
 * mush.
 *
 * Colour comes from the brand token, so a company that sets its own primary colour
 * gets its own mark for free.
 */

interface MarkProps {
  className?: string;
  /** Render in a single flat colour instead of the brand ramp (for dark headers). */
  monochrome?: boolean;
}

export const AuraMark: React.FC<MarkProps> = ({ className = 'h-8 w-8', monochrome = false }) => {
  const stroke = monochrome ? 'currentColor' : 'rgb(var(--color-primary-600))';
  const strokeSoft = monochrome ? 'currentColor' : 'rgb(var(--color-primary-400))';
  const strokeFaint = monochrome ? 'currentColor' : 'rgb(var(--color-primary-300))';

  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      role="img"
      aria-label="Aura"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Outermost sweep — widest phase, faintest */}
      <path
        d="M27.5 16a11.5 11.5 0 0 0-11.5-11.5"
        stroke={strokeFaint}
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity={monochrome ? 0.35 : 1}
      />
      {/* Middle sweep */}
      <path
        d="M22.5 16A6.5 6.5 0 0 0 16 9.5"
        stroke={strokeSoft}
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity={monochrome ? 0.6 : 1}
      />
      {/* Core: the near-closed ring the work travels around */}
      <path
        d="M16 27.5a11.5 11.5 0 1 1 0-23"
        stroke={stroke}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* The unit of work itself, sitting at the open end of the ring */}
      <circle cx="16" cy="16" r="3" fill={stroke} />
    </svg>
  );
};

interface LogoProps {
  className?: string;
  /** Hide the wordmark and show the mark alone (sidebars, favicons, avatars). */
  markOnly?: boolean;
  monochrome?: boolean;
  /** Small line under the wordmark, e.g. a company name. */
  subtitle?: string;
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = {
  sm: { mark: 'h-6 w-6', word: 'text-base', sub: 'text-[10px]' },
  md: { mark: 'h-8 w-8', word: 'text-xl', sub: 'text-[11px]' },
  lg: { mark: 'h-11 w-11', word: 'text-3xl', sub: 'text-xs' },
};

/**
 * Mark plus wordmark. The wordmark is set in the app's own type with tight
 * tracking rather than a decorative face, so it sits correctly next to product UI
 * instead of looking like a sticker applied on top of it.
 */
export const AuraLogo: React.FC<LogoProps> = ({
  className = '',
  markOnly = false,
  monochrome = false,
  subtitle,
  size = 'md',
}) => {
  const s = SIZES[size];

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <AuraMark className={s.mark} monochrome={monochrome} />
      {!markOnly && (
        <span className="flex flex-col leading-none">
          <span className={`${s.word} font-semibold tracking-tight text-gray-900 dark:text-white`}>
            Aura
          </span>
          {subtitle && (
            <span
              className={`${s.sub} mt-1 font-medium uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400`}
            >
              {subtitle}
            </span>
          )}
        </span>
      )}
    </span>
  );
};

export default AuraLogo;
