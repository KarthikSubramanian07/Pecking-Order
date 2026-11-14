import { useEffect } from 'react'
import { useUiStore } from '@/state/uiStore'

/** Resolves the theme preference to `data-theme` on <html>, tracking the OS. */
export function useTheme(): void {
  const pref = useUiStore((s) => s.theme)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = pref === 'dark' || (pref === 'system' && mq.matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
      document
        .querySelector('meta[name="theme-color"]:not([media])')
        ?.setAttribute('content', dark ? '#1a1714' : '#f6f1e7')
    }
    const current = document.documentElement.dataset.theme
    const next = pref === 'dark' || (pref === 'system' && mq.matches) ? 'dark' : 'light'
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // A soft cross-fade between themes where the browser supports it.
    if (current && current !== next && document.startViewTransition && !reduce) {
      document.startViewTransition(apply)
    } else {
      apply()
    }
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [pref])
}
