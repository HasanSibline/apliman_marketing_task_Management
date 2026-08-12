import { useLayoutEffect } from 'react'
import { getInitialTheme, applyTheme } from './useTheme'

/**
 * Hold the page in dark for as long as it is mounted, then put it back.
 *
 * The sign-in pages are designed dark: a navy panel, a showcase built from the app's
 * own surfaces, artwork drawn against a dark ground. Rendered in light they are not a
 * lighter version of that design, they are that design with its background removed,
 * and the artwork stops having anything to sit on.
 *
 * The choice is also nobody's yet. Whoever is looking at a sign-in page has not
 * identified themselves, so the stored preference belongs to whoever used this
 * browser last, which is a stranger as often as not. Deciding for them is more honest
 * than honouring a setting that was never theirs.
 *
 * Restoring on unmount is the part that matters: signing in must land you in your own
 * theme, so this holds the class rather than writing the preference. Nothing is saved.
 */
export function useForcedDark(): void {
  // Layout, not passive: a passive effect runs after the first paint, so a light
  // themed visitor sees a white frame before the panel turns navy on every visit.
  useLayoutEffect(() => {
    applyTheme('dark')

    return () => {
      // Read at teardown, not at mount. Someone can change the setting while a login
      // page is open, and the value at mount would then be stale by the time we
      // restore it.
      applyTheme(getInitialTheme())
    }
  }, [])
}

export default useForcedDark
