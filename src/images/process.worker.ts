/**
 * Image processing worker: decode, downscale, encode and hash off the main
 * thread. Stateless; each message is handled independently, so several
 * requests can be in flight at once.
 */
import { processBitmapBlob, type WorkerRequest, type WorkerResponse } from './pipeline'

function reply(message: WorkerResponse): void {
  self.postMessage(message)
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const { id, blob } = event.data
  processBitmapBlob(blob).then(
    (image) => reply({ id, ok: true, image }),
    (err: unknown) =>
      reply({ id, ok: false, message: err instanceof Error ? err.message : String(err) }),
  )
})
