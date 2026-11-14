import { openverse } from './openverse'
import type { ImageSource } from './types'
import { wikimedia } from './wikimedia'
import { wikipedia } from './wikipedia'

export type { ImageSearchResult, ImageSource, SearchOptions } from './types'

/** Search tabs, in display order: named things first, then broader free photo pools. */
export const SOURCES: ImageSource[] = [wikipedia, wikimedia, openverse]
