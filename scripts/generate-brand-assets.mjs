#!/usr/bin/env node
/**
 * Generates the hen SVGs, favicons, app icons and the OpenGraph card into
 * public/. The outputs are committed, so run this only after changing the hen
 * (src/brand/hen.ts) or the designs below:
 *
 *   npm run brand
 *
 * PNGs are rendered by headless Chromium through Playwright, using the same
 * variable fonts the app ships, so the OG card matches the product.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { HEN_STROKE_WIDTH, henSvg } from '../src/brand/hen.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const out = (name) => `${root}public/${name}`

const C = {
  paper: '#f6f1e7',
  surface: '#fbf8f1',
  sunken: '#efe8da',
  ink: '#1f1a17',
  muted: '#6b635a',
  hairline: '#e2d9c8',
  clay: '#d97757',
  clayWash: '#f3dccf',
  darkPaper: '#1a1714',
  darkInk: '#f2ece0',
  darkClay: '#e5876a',
}
const TIERS = [
  ['S', '#D9694A'],
  ['A', '#E9A23B'],
  ['B', '#D8C25A'],
  ['C', '#9DB37A'],
  ['D', '#8DB4CF'],
]

/** The hen's inner markup with a custom stroke weight (small sizes need a heavier line). */
function hen({ stroke = HEN_STROKE_WIDTH, ink = C.ink, accent = C.clay } = {}) {
  return henSvg({ ink, accent }).replace(
    `stroke-width="${HEN_STROKE_WIDTH}"`,
    `stroke-width="${stroke}"`,
  )
}

/** Nest the 64×64 hen inside a larger SVG at (x, y) with the given size. */
function placeHen(svg, x, y, size) {
  return svg.replace('<svg ', `<svg x="${x}" y="${y}" width="${size}" height="${size}" `)
}

/** Transparent hen that follows the viewer's colour scheme (static pages). */
function themedHen() {
  const style = `<style>svg{color:${C.ink}}@media (prefers-color-scheme:dark){svg{color:${C.darkInk}}[fill="${C.clay}"]{fill:${C.darkClay}}}</style>`
  return hen({ ink: 'currentColor' }).replace(/(<svg[^>]*>)/, `$1${style}`)
}

/** Rounded paper tile with a heavier hen, legible at 16px, flips in dark mode. */
function faviconSvg() {
  const style = `<style>.t{fill:${C.paper}}svg{color:${C.ink}}@media (prefers-color-scheme:dark){.t{fill:${C.darkPaper}}svg{color:${C.darkInk}}[fill="${C.clay}"]{fill:${C.darkClay}}}</style>`
  const inner = placeHen(hen({ stroke: 3, ink: 'currentColor' }), 3, 4, 58)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${style}<rect class="t" width="64" height="64" rx="14"/>${inner}</svg>`
}

function iconSvg({ size, inset, stroke, radius }) {
  const henSize = size - inset * 2
  const inner = placeHen(hen({ stroke }), inset, inset + size * 0.01, henSize)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="${C.paper}"/>${inner}</svg>`
}

async function fontFace(family, file, style = 'normal') {
  const data = await readFile(`${root}node_modules/@fontsource-variable/${file}`)
  return `@font-face{font-family:"${family}";src:url(data:font/woff2;base64,${data.toString('base64')}) format("woff2");font-weight:100 900;font-style:${style};font-display:block}`
}

async function ogHtml() {
  const fonts = [
    await fontFace('Fraunces', 'fraunces/files/fraunces-latin-full-normal.woff2'),
    await fontFace(
      'Instrument Sans',
      'instrument-sans/files/instrument-sans-latin-wdth-normal.woff2',
    ),
    await fontFace('Fraunces', 'fraunces/files/fraunces-latin-full-italic.woff2', 'italic'),
  ].join('')
  // Each tile holds an "egg" in a muted swatch tint; null is the hen.
  const eggs = [
    [null, '#e9a23b', '#7eaeb0'],
    ['#d98ca0', '#c8b9a6', '#9db37a', '#aba0cf'],
    ['#8db4cf', '#e3d5b8'],
    ['#c8b9a6', '#d9694a', '#d8c25a'],
    ['#7eae9c'],
  ]
  const rows = TIERS.map(([label, color], r) => {
    const tiles = eggs[r]
      .map((egg) =>
        egg
          ? `<span class="tile"><i style="background:${egg}"></i></span>`
          : `<span class="tile hen">${hen({ stroke: 2.2 })}</span>`,
      )
      .join('')
    return `<div class="row"><b style="background:${color}">${label}</b>${tiles}</div>`
  }).join('')
  const grain = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`
  return `<!doctype html><html><head><meta charset="utf-8"><style>${fonts}
  *{box-sizing:border-box}
  html,body{margin:0;width:1200px;height:630px;overflow:hidden}
  body{background:${C.paper};color:${C.ink};font-family:"Instrument Sans";position:relative}
  body::before{content:"";position:absolute;inset:0;background-image:${grain};opacity:.07;mix-blend-mode:multiply}
  .wrap{position:relative;display:grid;grid-template-columns:1fr 400px;gap:56px;height:100%;padding:64px 80px 60px}
  .copy{display:flex;flex-direction:column}
  .mark{display:flex;align-items:center;gap:14px;font:500 30px/1 Fraunces;letter-spacing:-.01em;font-variation-settings:"SOFT" 50,"WONK" 0,"opsz" 36}
  .mark svg{width:48px;height:48px}
  h1{margin:auto 0 0;font:480 142px/.9 Fraunces;letter-spacing:-.045em;font-variation-settings:"SOFT" 50,"WONK" 0,"opsz" 144}
  h1 em{font-style:normal;color:#a9472e}
  p{margin:28px 0 0;font-size:30px;line-height:1.3;color:${C.muted};font-stretch:96%}
  .url{margin-top:auto;padding-top:28px;font:italic 400 24px/1 Fraunces;font-variation-settings:"SOFT" 50,"WONK" 0,"opsz" 24;color:${C.muted}}
  .card{align-self:center;background:${C.surface};border:1px solid ${C.hairline};border-radius:22px;padding:16px;display:grid;gap:10px;box-shadow:0 2px 0 rgb(31 26 23/.05),0 40px 70px -36px rgb(31 26 23/.45);transform:rotate(1.6deg)}
  .row{display:flex;gap:10px;align-items:center;min-height:62px;padding-right:6px;border-radius:14px;background:${C.paper}}
  .row b{display:grid;place-items:center;width:62px;height:62px;border-radius:14px 0 0 14px;font:560 32px/1 Fraunces;font-variation-settings:"SOFT" 50,"opsz" 36;color:${C.ink};margin-right:4px}
  .tile{width:50px;height:50px;border-radius:10px;background:${C.sunken};border:1px solid ${C.hairline}}
  .tile{display:grid;place-items:center}
  .tile i{width:22px;height:28px;border-radius:50% 50% 50% 50%/60% 60% 40% 40%;opacity:.55}
  .tile.hen{background:${C.clayWash};border-color:#e9c3b0}
  .tile.hen svg{width:42px;height:42px}
  </style></head><body><div class="wrap"><div class="copy">
  <div class="mark">${hen({ stroke: 2 })}Pecking Order</div>
  <h1>Rank<br>anything<em>.</em></h1>
  <p>A fast, local-first tier list maker.<br>Free. No account. Nothing uploaded.</p>
  <div class="url">pecking-order.pages.dev</div>
  </div><div class="card">${rows}</div></div></body></html>`
}

/** Wrap a PNG in an ICO container (PNG-in-ICO is supported by every current browser). */
function pngToIco(png, size) {
  const header = Buffer.alloc(22)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(1, 4) // image count
  header.writeUInt8(size, 6)
  header.writeUInt8(size, 7)
  header.writeUInt8(0, 8) // palette
  header.writeUInt8(0, 9) // reserved
  header.writeUInt16LE(1, 10) // colour planes
  header.writeUInt16LE(32, 12) // bits per pixel
  header.writeUInt32LE(png.length, 14)
  header.writeUInt32LE(22, 18) // image offset
  return Buffer.concat([header, png])
}

async function main() {
  await writeFile(out('hen.svg'), `${themedHen()}\n`)
  await writeFile(out('favicon.svg'), `${faviconSvg()}\n`)

  const browser = await chromium.launch()
  const page = await browser.newPage({ colorScheme: 'light' })
  const shoot = async (html, width, height, transparent = false) => {
    await page.setViewportSize({ width, height })
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:transparent">${html}</body></html>`,
    )
    await page.evaluate(() => document.fonts.ready)
    return page.screenshot({ omitBackground: transparent, type: 'png' })
  }
  const fill = (svg) => svg.replace('<svg ', '<svg style="display:block;width:100vw;height:100vh" ')

  const favicon32 = await shoot(fill(faviconSvg()), 32, 32, true)
  await writeFile(out('favicon.ico'), pngToIco(favicon32, 32))
  await writeFile(
    out('apple-touch-icon.png'),
    await shoot(iconSvg({ size: 180, inset: 26, stroke: 2.1, radius: 0 }), 180, 180),
  )
  for (const size of [192, 512]) {
    const svg = iconSvg({ size, inset: size * 0.13, stroke: 2, radius: size * 0.22 })
    await writeFile(out(`icon-${size}.png`), await shoot(svg, size, size, true))
  }
  await writeFile(
    out('icon-maskable-512.png'),
    await shoot(iconSvg({ size: 512, inset: 112, stroke: 1.8, radius: 0 }), 512, 512),
  )

  await page.setViewportSize({ width: 1200, height: 630 })
  await page.setContent(await ogHtml())
  await page.evaluate(() => document.fonts.ready)
  await writeFile(out('og.png'), await page.screenshot({ type: 'png' }))

  await browser.close()
  console.log(
    'icons: wrote hen.svg, favicon.svg, favicon.ico, apple-touch-icon.png, icon-*.png, og.png',
  )
}

await main()
