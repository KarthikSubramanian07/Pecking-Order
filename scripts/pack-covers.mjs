#!/usr/bin/env node
/**
 * Builds each pack's home page cover: resolves up to four item images with
 * the app's own resolver (recorded in pack.json `cover` for provenance), then
 * renders them into a 2x2 mosaic at packs/<id>/cover.webp with headless
 * Chromium. Covers are committed and served from our own origin, so the home
 * page makes no third-party requests. Needs network: a contributor tool.
 *
 *   npm run packs:covers                 packs without a cover
 *   npm run packs:covers -- --all        recompute every cover
 *   npm run packs:covers -- fruits dogs  only these packs
 */
import { existsSync } from 'node:fs'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { JSDOM } from 'jsdom'
import { resolvePackImage, WIKIMEDIA_HEADERS } from '../src/packs/resolve.ts'
import { isPackFolder } from './pack-validate.mjs'

globalThis.DOMParser = new JSDOM('').window.DOMParser
const nodeFetch = globalThis.fetch
globalThis.fetch = (input, init = {}) => {
  const headers = new Headers(init.headers)
  headers.set('User-Agent', WIKIMEDIA_HEADERS['Api-User-Agent'])
  return nodeFetch(input, { ...init, headers })
}

const root = fileURLToPath(new URL('..', import.meta.url))
const args = process.argv.slice(2)
const all = args.includes('--all')
const wanted = args.filter((a) => !a.startsWith('--'))

const folders = (await readdir(join(root, 'packs'), { withFileTypes: true }))
  .filter((e) => e.isDirectory() && isPackFolder(e.name))
  .map((e) => e.name)
  .filter((n) => !wanted.length || wanted.includes(n))
  .sort()

const browser = await chromium.launch()
const page = await browser.newPage()

/** Draws the mosaic in a real browser canvas and returns WebP bytes. */
async function renderMosaic(urls) {
  const dataUrl = await page.evaluate(async (srcs) => {
    const W = 480
    const H = 300
    const gap = 3
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#efe8da'
    ctx.fillRect(0, 0, W, H)
    const cells =
      srcs.length >= 4
        ? [
            [0, 0, W / 2 - gap / 2, H / 2 - gap / 2],
            [W / 2 + gap / 2, 0, W / 2 - gap / 2, H / 2 - gap / 2],
            [0, H / 2 + gap / 2, W / 2 - gap / 2, H / 2 - gap / 2],
            [W / 2 + gap / 2, H / 2 + gap / 2, W / 2 - gap / 2, H / 2 - gap / 2],
          ]
        : srcs.map((_, i) => [(i * W) / srcs.length, 0, W / srcs.length - gap, H])
    for (let i = 0; i < cells.length; i++) {
      const res = await fetch(srcs[i])
      const bmp = await createImageBitmap(await res.blob())
      const [x, y, w, h] = cells[i]
      // object-fit: cover
      const scale = Math.max(w / bmp.width, h / bmp.height)
      const sw = w / scale
      const sh = h / scale
      ctx.drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, x, y, w, h)
    }
    return canvas.toDataURL('image/webp', 0.82)
  }, urls)
  return Buffer.from(dataUrl.split(',')[1], 'base64')
}

for (const folder of folders) {
  const file = join(root, 'packs', folder, 'pack.json')
  const coverFile = join(root, 'packs', folder, 'cover.webp')
  const pack = JSON.parse(await readFile(file, 'utf8'))
  if (pack.cover && existsSync(coverFile) && !all && !wanted.length) continue
  const cover = pack.cover && !all ? [...pack.cover] : []
  for (const item of cover.length ? [] : pack.items) {
    if (cover.length === 4) break
    try {
      const resolved = await resolvePackImage(item, AbortSignal.timeout(15000))
      if (resolved) cover.push(resolved.url)
    } catch {
      // Skip items whose image fails; the next one will do.
    }
  }
  if (!cover.length) {
    console.warn(`${folder}: no cover images resolved`)
    continue
  }
  // Keep `cover` just before `items` so pack files stay readable.
  const { items, ...head } = pack
  delete head.cover
  await writeFile(file, `${JSON.stringify({ ...head, cover, items }, null, 2)}\n`)
  const webp = await renderMosaic(cover)
  await writeFile(coverFile, webp)
  console.log(`${folder}: ${cover.length} images, cover.webp ${(webp.length / 1024).toFixed(0)} KB`)
}
await browser.close()
