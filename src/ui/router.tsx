/**
 * A deliberately tiny History API router: two routes don't justify a
 * dependency. Boards live at /b/<id>; everything else is the home page.
 * Cloudflare Pages rewrites /b/* to index.html (see public/_redirects).
 */
import { type AnchorHTMLAttributes, type MouseEvent, useSyncExternalStore } from 'react'

export type Route = { name: 'home' } | { name: 'board'; id: string }

const BOARD_RE = /^\/b\/([\w-]{1,64})\/?$/

export function parseRoute(pathname: string): Route {
  const m = BOARD_RE.exec(pathname)
  return m?.[1] ? { name: 'board', id: m[1] } : { name: 'home' }
}

export const boardPath = (id: string): string => `/b/${encodeURIComponent(id)}`

const listeners = new Set<() => void>()
const notify = () => {
  for (const l of listeners) l()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  window.addEventListener('popstate', cb)
  return () => {
    listeners.delete(cb)
    window.removeEventListener('popstate', cb)
  }
}

let cachedPath = ''
let cachedRoute: Route = { name: 'home' }
function snapshot(): Route {
  // Return a stable object per path so React doesn't re-render needlessly.
  if (location.pathname !== cachedPath) {
    cachedPath = location.pathname
    cachedRoute = parseRoute(cachedPath)
  }
  return cachedRoute
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, snapshot, () => cachedRoute)
}

export function navigate(path: string, opts: { replace?: boolean } = {}): void {
  if (path === location.pathname) return
  if (opts.replace) history.replaceState(null, '', path)
  else history.pushState(null, '', path)
  window.scrollTo({ top: 0 })
  notify()
}

/** An <a> that navigates client-side but still opens new tabs normally. */
export function Link({
  to,
  onClick,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
      return
    e.preventDefault()
    navigate(to)
  }
  return <a href={to} onClick={handle} {...rest} />
}
