import { customAlphabet } from 'nanoid'

// URL-safe, no look-alikes. 12 chars ≈ 1 collision per ~10^9 ids at 1k ids/hour.
const nano = customAlphabet('23456789abcdefghjkmnpqrstuvwxyz', 12)

export const newId = (prefix: 't' | 'i' | 'b'): string => `${prefix}_${nano()}`
