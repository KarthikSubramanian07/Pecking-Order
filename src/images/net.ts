/** Small fetch helpers shared by URL ingest and the search sources. */

export interface Deadline {
  signal: AbortSignal
  /** True once the timeout (not the caller) aborted the request. */
  readonly timedOut: boolean
  dispose(): void
}

/**
 * A signal that aborts when `parent` does or after `ms`. Hand-rolled rather
 * than `AbortSignal.any` so it works on every browser we target and can tell
 * a timeout apart from the user cancelling.
 */
export function deadline(parent: AbortSignal | undefined, ms: number): Deadline {
  const controller = new AbortController()
  let timedOut = false
  const onAbort = () => controller.abort(parent?.reason)
  if (parent?.aborted) controller.abort(parent.reason)
  else parent?.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort(new DOMException('The request timed out.', 'TimeoutError'))
  }, ms)
  return {
    signal: controller.signal,
    get timedOut() {
      return timedOut
    },
    dispose() {
      clearTimeout(timer)
      parent?.removeEventListener('abort', onAbort)
    },
  }
}
