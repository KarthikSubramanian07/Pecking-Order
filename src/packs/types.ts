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
  /** No image: render as a text tile. */
  tags?: string[]
}

export interface PackSpec {
  id: string
  version: string
  title: string
  description: string
  /** Emoji or short glyph for the catalog card. */
  icon: string
  category: string
  author: string
  tiers?: string[]
  items: PackItemSpec[]
}

/** Catalog entry generated at build time (no items, keeps the bundle tiny). */
export interface PackSummary {
  id: string
  version: string
  title: string
  description: string
  icon: string
  category: string
  author: string
  itemCount: number
  /** First few labels, for previews. */
  sample: string[]
}
