import { useEffect, useSyncExternalStore } from 'react'
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

const DARK_QUERY = '(prefers-color-scheme: dark)'

const subscribeSystem = (cb: () => void) => {
  const mq = window.matchMedia(DARK_QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

/** Whether the page is dark right now: the saved choice, or the device setting before one is made. */
export function useIsDark(): boolean {
  const pref = useUiStore((s) => s.theme)
  const systemDark = useSyncExternalStore(
    subscribeSystem,
    () => window.matchMedia(DARK_QUERY).matches,
    () => false,
  )
  return pref === 'dark' || (pref === 'system' && systemDark)
}
