import { newId } from './ids'
import { swatchAt } from './palette'
import type { Tier } from './types'

export interface TierPreset {
  id: string
  name: string
  labels: string[]
  /** Optional explicit swatch indexes (defaults to 0..n). */
  colors?: number[]
}

export const TIER_PRESETS: readonly TierPreset[] = [
  { id: 'classic', name: 'Classic', labels: ['S', 'A', 'B', 'C', 'D', 'F'] },
  {
    id: 'coop',
    name: 'Pecking order',
    labels: ['Top Chicken', 'Free Range', 'Barnyard', 'Nugget', 'Plucked'],
    colors: [0, 1, 3, 5, 6],
  },
  {
    id: 'vibes',
    name: 'Vibes',
    labels: ['Obsessed', 'Love it', 'Fine', 'Meh', 'Nope'],
    colors: [0, 1, 2, 5, 6],
  },
  { id: 'numbers', name: '1 to 5', labels: ['1', '2', '3', '4', '5'], colors: [0, 1, 2, 3, 5] },
  { id: 'binary', name: 'Yes / No', labels: ['Yes', 'No'], colors: [3, 0] },
] as const

export function tiersFromPreset(preset: TierPreset): Tier[] {
  return preset.labels.map((label, i) => ({
    id: newId('t'),
    label,
    color: swatchAt(preset.colors?.[i] ?? i),
  }))
}

export const DEFAULT_PRESET = TIER_PRESETS[0] as TierPreset
