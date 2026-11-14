import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import { DEFAULT_ORIGIN, ORIGIN_FILE_PATTERN, resolveOrigin } from './site.config.ts'

/** Rewrites the canonical origin in emitted pages when SITE_ORIGIN points elsewhere. */
function siteOrigin(): Plugin {
  const origin = resolveOrigin(process.env.SITE_ORIGIN)
  let outDir = 'dist'
  return {
    name: 'pecking-order:site-origin',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir
    },
    async closeBundle() {
      if (origin === DEFAULT_ORIGIN) return
      const files = await readdir(outDir, { recursive: true })
      for (const file of files) {
        if (!ORIGIN_FILE_PATTERN.test(file)) continue
        const path = join(outDir, file)
        const text = await readFile(path, 'utf8')
        if (text.includes(DEFAULT_ORIGIN)) {
          await writeFile(path, text.replaceAll(DEFAULT_ORIGIN, origin))
        }
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), siteOrigin()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    assetsInlineLimit: 0,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs', 'functions/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
})
