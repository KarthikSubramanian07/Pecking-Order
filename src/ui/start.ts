/** Ways to start a board. Each one opens it and moves to its URL. */
import type { TierPreset } from '@/core/presets'
import { boardFromPack } from '@/packs/install'
import type { PackSummary } from '@/packs/types'
import { useBoardStore } from '@/state/boardStore'
import { ui } from '@/state/uiStore'
import { boardPath, navigate } from './router'

export async function startBlank(title?: string, preset?: TierPreset): Promise<void> {
  const id = await useBoardStore.getState().newBoard({
    title: title?.trim() || 'Untitled pecking order',
    ...(preset ? { preset } : {}),
  })
  navigate(boardPath(id))
}

export async function startFromPack(pack: PackSummary): Promise<void> {
  const label = `Hatching ${pack.title}`
  ui().setBusy({ label, done: 0, total: pack.itemCount })
  try {
    const board = await boardFromPack(pack.id, {
      onProgress: ({ done, total }) => ui().setBusy({ label, done, total }),
    })
    const id = await useBoardStore.getState().openBoard(board)
    navigate(boardPath(id))
    ui().toast({ message: `${pack.title} is ready. Start pecking.` })
  } catch (err) {
    ui().toast({
      message: err instanceof Error ? err.message : 'That pack failed to load.',
      tone: 'error',
    })
  } finally {
    ui().setBusy(null)
  }
}
