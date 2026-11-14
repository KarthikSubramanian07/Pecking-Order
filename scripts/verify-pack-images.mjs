#!/usr/bin/env node
/**
 * Checks that every pack item's image actually resolves and downloads, using
 * the app's own resolver (src/packs/resolve.ts, run via Node type stripping).
 * Hits Wikipedia and Commons, so it is a contributor tool, not a CI step.
 *
 *   node scripts/verify-pack-images.mjs              every pack
 *   node scripts/verify-pack-images.mjs fruits dogs  only these packs
 *   node scripts/verify-pack-images.mjs --verbose    also list each resolved URL
 *
 * Exits 1 if any item that names an image source fails to produce one.
 * Requires Node 23.6+ (TypeScript type stripping).
 */
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { mapWithConcurrency } from '../src/packs/pool.ts'
import { resolvePackImage, WIKIMEDIA_HEADERS } from '../src/packs/resolve.ts'
import { isPackFolder } from './pack-validate.mjs'

// The resolver strips Commons credit HTML with the browser's DOMParser.
globalThis.DOMParser = new JSDOM('').window.DOMParser

// Wikimedia throttles Node's generic User-Agent hard and a full run makes
// ~1000 requests, so identify ourselves and back off on 429 instead of
// reporting rate limits as broken images. Browsers send their own UA.
const nodeFetch = globalThis.fetch
globalThis.fetch = async (input, init = {}) => {
  const headers = new Headers(init.headers)
  headers.set('User-Agent', WIKIMEDIA_HEADERS['Api-User-Agent'])
  for (let attempt = 0; ; attempt++) {
    const res = await nodeFetch(input, { ...init, headers })
    if (res.status !== 429 || attempt === 5) return res
    await res.body?.cancel()
    const wait = Number(res.headers.get('retry-after')) || 2 ** attempt
    await new Promise((r) => setTimeout(r, wait * 1000))
  }
}

const root = fileURLToPath(new URL('..', import.meta.url))
const args = process.argv.slice(2)
const verbose = args.includes('--verbose')
const wanted = args.filter((a) => !a.startsWith('--'))
// Pretend to be the deployed app so we see the CORS headers a browser would get.
const ORIGIN = 'https://pecking-order.pages.dev'

const folders = (await readdir(join(root, 'packs'), { withFileTypes: true }))
  .filter((e) => e.isDirectory() && isPackFolder(e.name))
  .map((e) => e.name)
  .filter((name) => wanted.length === 0 || wanted.includes(name))
  .sort()
const unknown = wanted.filter((w) => !folders.includes(w))
if (unknown.length) {
  console.error(`No such pack: ${unknown.join(', ')}`)
  process.exit(1)
}

/** Downloads the image like ingestUrl will: it must be an image and CORS-readable. */
async function checkDownload(url) {
  const res = await fetch(url, {
    headers: { ...WIKIMEDIA_HEADERS, Origin: ORIGIN },
    signal: AbortSignal.timeout(120_000),
  })
  const type = res.headers.get('content-type') ?? ''
  const cors = res.headers.get('access-control-allow-origin')
  await res.body?.cancel()
  if (!res.ok) return `download failed: HTTP ${res.status}`
  if (!type.startsWith('image/')) return `not an image (content-type ${type || 'missing'})`
  if (cors !== '*' && cors !== ORIGIN) return 'image is not CORS-readable'
  return null
}

async function checkItem(item) {
  if (!item.wikipedia && !item.commons && !item.image) return { status: 'text' }
  try {
    const resolved = await resolvePackImage(item, AbortSignal.timeout(120_000))
    if (!resolved) return { status: 'fail', reason: 'source has no image' }
    const problem = await checkDownload(resolved.url)
    if (problem) return { status: 'fail', reason: `${problem} (${resolved.url})` }
    return { status: 'ok', resolved }
  } catch (err) {
    return { status: 'fail', reason: err instanceof Error ? err.message : String(err) }
  }
}

let failures = 0
let total = 0
for (const folder of folders) {
  const pack = JSON.parse(await readFile(join(root, 'packs', folder, 'pack.json'), 'utf8'))
  const results = await mapWithConcurrency(pack.items, 3, checkItem)
  const failed = results.filter((r) => r.status === 'fail').length
  const text = results.filter((r) => r.status === 'text').length
  failures += failed
  total += pack.items.length
  const mark = failed ? '✗' : '✓'
  console.log(
    `${mark} ${folder}: ${pack.items.length - failed - text} images, ${text} text tiles, ${failed} broken`,
  )
  results.forEach((r, i) => {
    const item = pack.items[i]
    if (r.status === 'fail') console.log(`    ✗ ${item.id}: ${r.reason}`)
    else if (verbose && r.status === 'ok') {
      console.log(`    · ${item.id}: ${r.resolved.url}\n      ${r.resolved.credit.sourceUrl ?? ''}`)
    }
  })
}

console.log(`\n${failures ? '✗' : '✓'} ${total} items checked, ${failures} broken`)
process.exit(failures ? 1 : 0)
