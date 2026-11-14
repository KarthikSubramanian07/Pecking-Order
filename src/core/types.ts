/**
 * Core domain types for Pecking Order.
 *
 * These are plain, serialisable data shapes. Nothing in `src/core` may import
 * React, the DOM, or storage — keep it pure so it stays trivially testable.
 */

/** The id of the unranked pool. Every board has exactly one. */
export const COOP = 'coop' as const
export type CoopId = typeof COOP

export type TierId = string
export type ItemId = string
/** A container is either a tier or the coop. */
export type ContainerId = TierId | CoopId

/** SHA-256 hex of the processed image bytes. Also the IndexedDB key. */
export type ImageHash = string

export interface Tier {
  id: TierId
  label: string
  /** CSS colour (hex). Picked from the palette but may be any hex. */
  color: string
}

/** Where an image came from — required for attribution of free sources. */
export interface ImageCredit {
  provider: 'upload' | 'paste' | 'url' | 'openverse' | 'wikimedia' | 'wikipedia' | 'pack'
  /** Page a human can visit to see the original + licence. */
  sourceUrl?: string
  author?: string
  license?: string
}

export interface Item {
  id: ItemId
  label: string
  /** Absent for text-only items. */
  image?: ImageHash
  credit?: ImageCredit
  /** Stable id inside a category pack, so packs can be upgraded / shared. */
  packItemId?: string
}

export interface PackRef {
  id: string
  version: string
}

export interface Board {
  /** Schema version — bump and add a migration in `migrate.ts` on change. */
  v: 1
  id: string
  title: string
  tiers: Tier[]
  items: Record<ItemId, Item>
  /** Ordered item ids per container. The coop key is always present. */
  placement: Record<ContainerId, ItemId[]>
  pack?: PackRef
  createdAt: number
  updatedAt: number
}

/** Lightweight listing entry for the board gallery. */
export interface BoardSummary {
  id: string
  title: string
  itemCount: number
  rankedCount: number
  updatedAt: number
  /** Up to 4 image hashes for the gallery thumbnail mosaic. */
  preview: ImageHash[]
}
