#!/usr/bin/env node
/**
 * Validates every pack in packs/ and compiles them for the app.
 *
 *   node scripts/build-packs.mjs          validate, then write the outputs
 *   node scripts/build-packs.mjs --check  validate only (exit 1 on errors)
 *
 * Outputs (both git-ignored, rebuilt on dev/build/test):
 *   src/packs/generated/catalog.json  PackSummary[] bundled into the app
 *   public/packs/<id>.json            full pack, fetched when installed
 */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  isPackFolder,
  parseSwatchNames,
  sortCatalog,
  toPublicPack,
  toSummary,
  validatePack,
} from './pack-validate.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const packsDir = join(root, 'packs')
const catalogFile = join(root, 'src/packs/generated/catalog.json')
const publicDir = join(root, 'public/packs')
const checkOnly = process.argv.includes('--check')

const swatchNames = parseSwatchNames(await readFile(join(root, 'src/core/palette.ts'), 'utf8'))
if (swatchNames.length === 0) {
  console.error('build-packs: could not read swatch names from src/core/palette.ts')
  process.exit(1)
}

const entries = await readdir(packsDir, { withFileTypes: true })
const folders = entries
  .filter((e) => e.isDirectory() && isPackFolder(e.name))
  .map((e) => e.name)
  .sort()

const packs = []
const problems = []
for (const folder of folders) {
  const file = join(packsDir, folder, 'pack.json')
  const shown = relative(root, file)
  let pack
  try {
    pack = JSON.parse(await readFile(file, 'utf8'))
  } catch (err) {
    problems.push(`${shown}: ${err.code === 'ENOENT' ? 'missing pack.json' : err.message}`)
    continue
  }
  const errors = validatePack(pack, { folder, swatchNames })
  if (errors.length) problems.push(...errors.map((e) => `${shown} › ${e}`))
  else packs.push(pack)
}

if (problems.length) {
  console.error(`✗ ${problems.length} problem${problems.length === 1 ? '' : 's'} in packs:\n`)
  for (const p of problems) console.error(`  ${p}`)
  console.error('\nSee CONTRIBUTING-PACKS.md for the pack format.')
  process.exit(1)
}

const itemCount = packs.reduce((n, p) => n + p.items.length, 0)
if (checkOnly) {
  console.log(`✓ ${packs.length} packs, ${itemCount} items — all valid`)
  process.exit(0)
}

await mkdir(join(catalogFile, '..'), { recursive: true })
await writeFile(catalogFile, `${JSON.stringify(sortCatalog(packs.map(toSummary)), null, 2)}\n`)
// Start clean so packs deleted from the repo don't linger in public/.
await rm(publicDir, { recursive: true, force: true })
await mkdir(publicDir, { recursive: true })
await Promise.all(
  packs.map((p) => writeFile(join(publicDir, `${p.id}.json`), JSON.stringify(toPublicPack(p)))),
)
console.log(`✓ built ${packs.length} packs (${itemCount} items)`)
