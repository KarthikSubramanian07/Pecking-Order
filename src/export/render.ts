// CONTRACT STUB — implemented by the export workstream.
import type { Board } from '@/core/types'

export type ExportFormat = 'auto' | 'wide' | 'portrait' | 'story'
export type ExportTheme = 'light' | 'dark'

export interface ExportOptions {
  format: ExportFormat
  theme: ExportTheme
  /** Device pixel multiplier, 1–3. */
  scale: number
  showLabels: boolean
  /** Include the unranked coop at the bottom. */
  includeCoop: boolean
  /** Optional subtitle line, e.g. "ranked by @hen". */
  byline?: string
}

export const DEFAULT_EXPORT: ExportOptions = {
  format: 'auto',
  theme: 'light',
  scale: 2,
  showLabels: true,
  includeCoop: false,
}

export async function renderBoardImage(_board: Board, _opts: ExportOptions): Promise<Blob> {
  throw new Error('not implemented')
}
