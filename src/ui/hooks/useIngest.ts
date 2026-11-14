import { useCallback } from 'react'
import { type IngestResult, ingestDataTransfer, ingestFiles } from '@/images/ingest'
import { ui } from '@/state/uiStore'
import { reportIngest } from '../actions'
import { pickFiles } from '../chrome/pickers'

/** Runs an ingest with a progress indicator and reports the outcome. */
async function run(
  label: string,
  job: (onProgress: (d: number, t: number) => void) => Promise<IngestResult>,
) {
  ui().setBusy({ label, done: 0, total: 0 })
  try {
    reportIngest(await job((done, total) => ui().setBusy({ label, done, total })))
  } catch (err) {
    ui().toast({
      message: err instanceof Error ? err.message : 'Something went wrong.',
      tone: 'error',
    })
  } finally {
    ui().setBusy(null)
  }
}

export function ingestTransfer(dt: DataTransfer): void {
  // ingestDataTransfer snapshots dt.items synchronously; call it before any await.
  const pending = (onProgress: (d: number, t: number) => void) =>
    ingestDataTransfer(dt, { onProgress })
  void run('Hatching images', pending)
}

export function useIngest() {
  const upload = useCallback(async (folder = false) => {
    const files = await pickFiles({ folder })
    if (files.length)
      void run('Hatching images', (onProgress) => ingestFiles(files, { onProgress }))
  }, [])
  return { upload }
}
