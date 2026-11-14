/** Shape of a contributor pack file: packs/<id>/pack.json (see CONTRIBUTING-PACKS.md). */
export interface PackItemSpec {
  /** Stable id, unique within the pack. Never change it once published. */
  id: string
  label: string
  /** Resolve the lead image of this English Wikipedia article. */
  wikipedia?: string
  /** A Wikimedia Commons file name, e.g. "File:Pizza.jpg". */
  commons?: string
  /** Direct https image URL on an allow-listed CORS host. */
  image?: string
  /** Free-form tags (unused by the app today, handy for future filters). */
  tags?: string[]
  // No image source at all → the item renders as a text tile.
}

export interface PackSpec {
  id: string
  version: string
  title: string
  description: string
  /** Swatch name from core/palette.ts used as the catalog card accent. */
  accent?: string
  category: string
  author: string
  /** Optional custom tier labels; defaults to the classic S–F preset. */
  tiers?: string[]
  items: PackItemSpec[]
}

/** Catalog entry generated at build time (no items, keeps the bundle tiny). */
export interface PackSummary {
  id: string
  version: string
  title: string
  description: string
  accent?: string
  category: string
  author: string
  itemCount: number
  /** First few labels, for previews. */
  sample: string[]
}
