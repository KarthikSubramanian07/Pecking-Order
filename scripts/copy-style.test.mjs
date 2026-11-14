// House style guard: no em dashes anywhere we ship or document.
// They read as machine-written; use commas, colons, periods or "·" instead.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { expect, it } from 'vitest'

// Vitest runs from the repo root.
const ROOT = process.cwd()
// Built from its code point so formatters can't turn it back into a literal.
const EM_DASH = String.fromCharCode(0x2014)
const SKIP = new Set([
  'node_modules',
  'dist',
  '.git',
  '.claude',
  'coverage',
  'playwright-report',
  'test-results',
])
const TEXT = /\.(tsx?|mjs|css|html|md|json|ya?ml|txt|xml)$/

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* walk(p)
    else if (TEXT.test(name) && name !== 'package-lock.json') yield p
  }
}

it('contains no em dashes', () => {
  const offenders = []
  for (const file of walk(ROOT)) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (line.includes(EM_DASH)) offenders.push(`${relative(ROOT, file)}:${i + 1}`)
      })
  }
  expect(offenders).toEqual([])
})
