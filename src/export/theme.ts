/**
 * Export palette and type. Mirrors `styles/tokens.css` as literals because a
 * canvas cannot read CSS custom properties from a detached render.
 */
import { parseHex, TIER_INK } from '@/core/palette'

export interface ExportPalette {
  paper: string
  surface: string
  sunken: string
  ink: string
  muted: string
  hairline: string
  accent: string
  /** Tier tint strength mixed into the sunken row colour. */
  tint: number
  /** Opacity of the paper-grain overlay. */
  grain: number
  /** Tier label text — dark on every swatch in both themes. */
  tierInk: string
}

export const PALETTES = {
  light: {
    paper: '#F6F1E7',
    surface: '#FBF8F1',
    sunken: '#EFE8DA',
    ink: '#1F1A17',
    muted: '#6B635A',
    hairline: '#E2D9C8',
    accent: '#D97757',
    tint: 0.1,
    grain: 0.07,
    tierInk: TIER_INK,
  },
  dark: {
    paper: '#1A1714',
    surface: '#24201C',
    sunken: '#14110F',
    ink: '#F2ECE0',
    muted: '#A69C8E',
    hairline: 'rgba(255,255,255,0.08)',
    accent: '#E5876A',
    tint: 0.14,
    grain: 0.08,
    tierInk: TIER_INK,
  },
} as const satisfies Record<'light' | 'dark', ExportPalette>

// Fallbacks keep exports legible when the web fonts are missing (tests, old browsers).
const DISPLAY = '"Fraunces Variable", Georgia, serif'
const UI = '"Instrument Sans Variable", system-ui, sans-serif'
const MONO = '"JetBrains Mono Variable", ui-monospace, monospace'

export const font = {
  display: (size: number) => `500 ${round(size)}px ${DISPLAY}`,
  ui: (size: number, weight = 600) => `${weight} ${round(size)}px ${UI}`,
  mono: (size: number, weight = 500) => `${weight} ${round(size)}px ${MONO}`,
}

/** Mixes `amount` (0–1) of hex colour `b` into hex colour `a`. */
export function mixHex(a: string, b: string, amount: number): string {
  const ca = parseHex(a)
  const cb = parseHex(b)
  if (!ca || !cb) return a
  const t = Math.max(0, Math.min(1, amount))
  const out = ca.map((c, i) => Math.round(c + ((cb[i] ?? c) - c) * t))
  return `#${out.map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

function round(n: number): number {
  return Math.round(n * 10) / 10
}
