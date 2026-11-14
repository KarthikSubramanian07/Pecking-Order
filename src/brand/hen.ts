/**
 * The Pecking Order hen — one line drawing, used everywhere (UI, favicon,
 * export watermark). Plain SVG path data in a 64×64 box so it works both as
 * inline SVG and as `new Path2D(d)` on a canvas.
 */
export const HEN_VIEWBOX = 64

export interface HenPath {
  d: string
  /** Filled with the accent (comb, wattle) or ink (eye); otherwise stroke only. */
  fill?: 'accent' | 'ink'
  /** Draw without a stroke. */
  noStroke?: boolean
}

export const HEN_PATHS: readonly HenPath[] = [
  // comb
  {
    d: 'M40.5 13.2c-.6-2.6 1.4-4.4 3.2-3.2.4-2.5 3.4-3 4.4-.9 1.4-1.8 4.2-.8 3.6 1.9',
    fill: 'accent',
  },
  // head + body
  {
    d: 'M51.6 12.2c2.3 1.6 3.2 4.3 2.6 7l3.4 1.6-3.6 1.2c-.3 2.6-.9 5.1-.4 7.8 1.4 7-1.6 14.9-9.8 18.7-7.6 3.5-17.4 3.4-24.6-1.1C12.8 43.8 9 37.4 9.6 30.2c.3-4.1-1-8.4-2.6-12 4.8 1.4 9 4.6 12.4 8.2 4-2.4 8.8-2.6 13.2-1.3 3.4 1 6-1 6.6-4.1.8-4.3 2.4-8 6.6-9.4 2-.7 4.1-.4 5.8.6z',
  },
  // wattle
  { d: 'M54.2 22.2c.3 2.3-.6 4-2.2 4.4-1.3-1.5-1.2-3.4.3-4.6', fill: 'accent' },
  // eye
  { d: 'M48.1 16.6a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0 -2.2 0z', fill: 'ink', noStroke: true },
  // wing
  { d: 'M22.6 33.4c3.4 6.6 10.6 9.4 17.6 7.2-2.2-1.4-3.4-3.6-3.6-6' },
  // tail feather
  { d: 'M11.6 22.6c2.2.6 4.4 2 6 3.6' },
  // feet
  { d: 'M27.6 49.6v6.2m0 0-2.6 2.2m2.6-2.2 2.4 2m8-8.8v6.6m0 0-2.6 2.2m2.6-2.2 2.4 2' },
] as const

export const HEN_STROKE_WIDTH = 1.6

/** Standalone SVG markup (favicon, static pages). */
export function henSvg({ ink = '#1f1a17', accent = '#d97757', paper = '#fbf8f1' } = {}): string {
  const body = HEN_PATHS.map((p) => {
    const fill = p.fill === 'accent' ? accent : p.fill === 'ink' ? ink : 'none'
    const stroke = p.noStroke ? 'none' : ink
    return `<path d="${p.d}" fill="${fill}" stroke="${stroke}"/>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="${paper}" stroke-width="${HEN_STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
}
