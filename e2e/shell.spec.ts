import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'

/**
 * Smoke tests for the static web shell: the pre-rendered homepage HTML that
 * crawlers and agents read, the static pages, and the agent-readiness files.
 * They deliberately avoid the React UI, which replaces the shell once it mounts.
 */

const ORIGIN = 'https://pecking-order.pages.dev'
const STATIC_PAGES = ['/about/', '/privacy/', '/contact/'] as const

interface JsonLdNode {
  '@type': string
  mainEntity?: unknown[]
  [key: string]: unknown
}

function visibleText(html: string): string {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function expectNoSeriousA11yIssues(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
    .analyze()
  const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(
    serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([])
}

test.describe('homepage HTML', () => {
  test('ships one H1, readable content and valid JSON-LD before any JavaScript runs', async ({
    request,
  }) => {
    const response = await request.get('/')
    expect(response.status()).toBe(200)
    const html = await response.text()

    const h1s = html.match(/<h1[\s>][\s\S]*?<\/h1>/g) ?? []
    expect(h1s).toHaveLength(1)
    expect(visibleText(h1s[0] ?? '')).toBe('Rank anything.')
    expect(
      visibleText(html.match(/<div id="root">[\s\S]*<\/body>/)?.[0] ?? '').length,
    ).toBeGreaterThan(700)
    expect(html).toContain(`<link rel="canonical" href="${ORIGIN}/"`)
    expect(html).toContain(`<meta property="og:image" content="${ORIGIN}/og.png"`)
    expect(html).toContain('<link rel="alternate" type="text/markdown" href="/index.md"')

    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    expect(blocks).toHaveLength(1)
    const data = JSON.parse(blocks[0]?.[1] ?? '') as { '@graph': JsonLdNode[] }
    const types = data['@graph'].map((node) => node['@type'])
    expect(types).toEqual(['WebApplication', 'Organization', 'FAQPage'])
    const faq = data['@graph'].find((node) => node['@type'] === 'FAQPage')
    const visibleQuestions = html.match(/<h3>[^<]+\?<\/h3>/g) ?? []
    expect(faq?.mainEntity).toHaveLength(visibleQuestions.length)
  })
})

test.describe('static pages', () => {
  for (const path of STATIC_PAGES) {
    test(`${path} is served with its own canonical URL and real content`, async ({ request }) => {
      const response = await request.get(path)
      expect(response.status()).toBe(200)
      const html = await response.text()
      expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
      expect(html).toContain(`<link rel="canonical" href="${ORIGIN}${path}"`)
      expect(visibleText(html).length).toBeGreaterThan(600)
    })
  }

  test('the 404 page exists and is not indexed', async ({ request }) => {
    const html = await (await request.get('/404.html')).text()
    expect(html).toContain('This page flew the coop.')
    expect(html).toContain('<meta name="robots" content="noindex"')
  })
})

test.describe('agent-readiness files', () => {
  test('robots.txt, sitemap, llms.txt and markdown twins are served', async ({ request }) => {
    expect(await (await request.get('/robots.txt')).text()).toContain(
      `Sitemap: ${ORIGIN}/sitemap.xml`,
    )
    const sitemap = await (await request.get('/sitemap.xml')).text()
    for (const path of ['/', ...STATIC_PAGES]) {
      expect(sitemap).toContain(`<loc>${ORIGIN}${path}</loc>`)
    }
    expect(await (await request.get('/llms.txt')).text()).toMatch(/^# Pecking Order\n\n> /)
    for (const twin of ['/index.md', '/about.md', '/privacy.md', '/contact.md']) {
      expect(await (await request.get(twin)).text()).toMatch(/^---\ntitle: .+\n/)
    }
  })

  test('every manifest icon resolves', async ({ request }) => {
    const manifest = (await (await request.get('/manifest.webmanifest')).json()) as {
      icons: { src: string }[]
    }
    expect(manifest.icons.length).toBeGreaterThan(2)
    for (const icon of [...manifest.icons, { src: '/og.png' }, { src: '/apple-touch-icon.png' }]) {
      expect((await request.get(icon.src)).status(), icon.src).toBe(200)
    }
  })
})

test.describe('accessibility', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`static pages have no serious axe violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      for (const path of [...STATIC_PAGES, '/404.html']) {
        await page.goto(path)
        await expectNoSeriousA11yIssues(page)
      }
    })
  }

  // axe needs page scripts, so instead of disabling JavaScript the app bundle is
  // blocked: the page stays on the pre-rendered shell, as it looks while loading.
  for (const scheme of ['light', 'dark'] as const) {
    test(`the homepage shell has no serious axe violations (${scheme})`, async ({ page }) => {
      await page.route('**/assets/*.js', (route) => route.abort())
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto('/')
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Rank anything.')
      await expectNoSeriousA11yIssues(page)
    })
  }
})
