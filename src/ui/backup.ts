import { fileNameFor } from '@/export/share'
import { boardActions } from '@/state/boardStore'
import { ui } from '@/state/uiStore'
import { exportPeck, importPeck } from '@/storage/peckFile'

export const isPeckFile = (f: File): boolean => /\.peck$/i.test(f.name)

export async function downloadBackup(): Promise<void> {
  const board = boardActions().board
  if (!board) return
  const blob = await exportPeck(board)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileNameFor(board.title, 'peck')
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  ui().toast({ message: 'Backup saved. Open it here any time to restore.' })
}

export async function restoreBackup(file: File): Promise<void> {
  ui().setBusy({ label: 'Restoring backup', done: 0, total: 0 })
  try {
    const { board, skippedImages } = await importPeck(file)
    await boardActions().openBoard(board)
    ui().toast({
      message: skippedImages
        ? `Restored “${board.title}”. ${skippedImages} images were damaged and skipped.`
        : `Restored “${board.title}”.`,
      tone: skippedImages ? 'error' : 'info',
    })
  } catch (err) {
    ui().toast({
      message: err instanceof Error ? err.message : 'Could not open that file.',
      tone: 'error',
    })
  } finally {
    ui().setBusy(null)
  }
}

export function pickBackup(): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.peck,application/zip'
  input.addEventListener('change', () => {
    const f = input.files?.[0]
    if (f) void restoreBackup(f)
  })
  input.click()
}
