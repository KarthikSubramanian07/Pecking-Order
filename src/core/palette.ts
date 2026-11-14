/**
 * Tier colours. Warm, editorial and named, not the stock rainbow.
 * Every swatch carries ink text (#1F1A17) at ≥ 4.5:1 contrast (WCAG AA),
 * and adjacent swatches differ by ΔE ≥ 21 so tiers stay distinguishable.
 */
export interface Swatch {
  name: string
  hex: string
}

export const SWATCHES: readonly Swatch[] = [
  { name: 'Comb', hex: '#D9694A' },
  { name: 'Yolk', hex: '#E9A23B' },
  { name: 'Corn', hex: '#D8C25A' },
  { name: 'Pasture', hex: '#9DB37A' },
  { name: 'Eucalyptus', hex: '#7EAE9C' },
  { name: 'Duck Egg', hex: '#8DB4CF' },
  { name: 'Heather', hex: '#ABA0CF' },
  { name: 'Speckle', hex: '#C8B9A6' },
  { name: 'Rhubarb', hex: '#D98CA0' },
  { name: 'Oat', hex: '#E3D5B8' },
] as const

/** Ink colour used on tier labels; always readable on every swatch. */
export const TIER_INK = '#1F1A17'

export function swatchAt(index: number): string {
  // biome-ignore lint/style/noNonNullAssertion: modulo keeps index in range
  return SWATCHES[((index % SWATCHES.length) + SWATCHES.length) % SWATCHES.length]!.hex
}

/** Relative luminance per WCAG 2.x. */
export function luminance(hex: string): number {
  const n = parseHex(hex)
  if (!n) return 0
  const [r, g, b] = n.map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/** Ink or paper, whichever reads better on a custom user colour. */
export function readableTextOn(bg: string): string {
  return contrastRatio(bg, TIER_INK) >= contrastRatio(bg, '#FBF8F1') ? TIER_INK : '#FBF8F1'
}

export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m?.[1]) return null
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]
  const v = Number.parseInt(h, 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

export function isHexColor(value: string): boolean {
  return parseHex(value) !== null
}
