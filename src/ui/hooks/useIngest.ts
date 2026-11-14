import { useCallback } from 'react'
import { type IngestResult, ingestDataTransfer, ingestFiles } from '@/images/ingest'
import { useBoardStore } from '@/state/boardStore'
import { ui } from '@/state/uiStore'
import { reportIngest } from '../actions'
import { pickFiles } from '../chrome/pickers'
import { startBlank } from '../start'

type Job = (onProgress: (done: number, total: number) => void) => Promise<IngestResult>

/** Runs an ingest with a progress indicator and reports the outcome. */
async function run(label: string, job: Job, boardReady: Promise<void> = Promise.resolve()) {
  ui().setBusy({ label, done: 0, total: 0 })
  try {
    const result = await job((done, total) => ui().setBusy({ label, done, total }))
    await boardReady
    reportIngest(result)
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
  // Dropping or pasting on the home page starts a fresh board for the items.
  const boardReady = useBoardStore.getState().board ? undefined : startBlank()
  // ingestDataTransfer snapshots dt.items synchronously; call it before any await.
  void run('Hatching images', (onProgress) => ingestDataTransfer(dt, { onProgress }), boardReady)
}

export function useIngest() {
  const upload = useCallback(async (folder = false) => {
    const files = await pickFiles({ folder })
    if (files.length) {
      void run('Hatching images', (onProgress) => ingestFiles(files, { onProgress }))
    }
  }, [])
  return { upload }
}
