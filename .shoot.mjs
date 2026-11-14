// Usage: node shoot.mjs <out.png> [width] [height] [scheme] [scriptFile]

import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const [out, w = '1280', h = '900', scheme = 'light', script] = process.argv.slice(2)
const b = await chromium.launch()
const ctx = await b.newContext({
  viewport: { width: +w, height: +h },
  colorScheme: scheme,
  deviceScaleFactor: 1,
})
const p = await ctx.newPage()
const errs = []
p.on('pageerror', (e) => errs.push(String(e)))
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
await p.goto('http://localhost:5317/')
await p.waitForTimeout(800)
if (script) await new Function('p', `return (async () => { ${readFileSync(script, 'utf8')} })()`)(p)
await p.screenshot({ path: out, fullPage: process.env.FULL === '1' })
if (errs.length) console.log('ERRORS:', errs.join('\n'))
await b.close()
