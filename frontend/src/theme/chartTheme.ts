import { useEffect, useState } from 'react'

/**
 * True while the `dark` class is on <html>. Unlike `useTheme`, this observes the
 * class so charts follow a theme toggle without a remount.
 */
export function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  )

  useEffect(() => {
    const root = document.documentElement
    const observer = new MutationObserver(() => setIsDark(root.classList.contains('dark')))
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    setIsDark(root.classList.contains('dark'))
    return () => observer.disconnect()
  }, [])

  return isDark
}

/**
 * Recharts renders SVG with inline styles, so Tailwind's `dark:` variants can't
 * reach it, axis labels, grid lines and tooltips need explicit colors.
 */
export function useChartTheme() {
  const isDark = useIsDark()

  return {
    isDark,
    /** CartesianGrid / axis lines */
    grid: isDark ? '#374151' : '#f0f0f0',
    /** Axis tick labels */
    tick: { fill: isDark ? '#9ca3af' : '#6b7280' },
    /** Tooltip container */
    tooltip: {
      backgroundColor: isDark ? '#1f2937' : '#fff',
      border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
      borderRadius: '8px',
      color: isDark ? '#f3f4f6' : '#111827',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    },
    /** Tooltip label row (the category name above the values) */
    tooltipLabel: { color: isDark ? '#e5e7eb' : '#374151' },
  }
}
