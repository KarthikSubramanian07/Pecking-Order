/**
 * A tiny bounded undo/redo stack of immutable snapshots.
 * Snapshots come from Immer, so consecutive entries share structure and
 * keeping 100 of them costs little more than keeping one.
 */
export interface History<T> {
  past: T[]
  future: T[]
}

const HISTORY_LIMIT = 100

export const emptyHistory = <T>(): History<T> => ({ past: [], future: [] })

/** Records `prev` as the state to return to, and drops the redo branch. */
export function record<T>(h: History<T>, prev: T, limit = HISTORY_LIMIT): History<T> {
  const past = h.past.length >= limit ? h.past.slice(h.past.length - limit + 1) : h.past.slice()
  past.push(prev)
  return { past, future: [] }
}

export function undo<T>(h: History<T>, current: T): { history: History<T>; state: T } | null {
  const state = h.past.at(-1)
  if (state === undefined) return null
  return { history: { past: h.past.slice(0, -1), future: [current, ...h.future] }, state }
}

export function redo<T>(h: History<T>, current: T): { history: History<T>; state: T } | null {
  const [state, ...future] = h.future
  if (state === undefined) return null
  return { history: { past: [...h.past, current], future }, state }
}
