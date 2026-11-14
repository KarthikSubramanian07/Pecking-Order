import { afterEach, describe, expect, it, vi } from 'vitest'

type Rules = { createHTML(s: string): string; createScriptURL(s: string): string }

/** Loads a fresh copy of the module, optionally with a fake Trusted Types factory. */
async function load(withTrustedTypes: boolean) {
  vi.resetModules()
  const created: { name: string; rules: Rules }[] = []
  if (withTrustedTypes) {
    vi.stubGlobal('trustedTypes', {
      createPolicy: (name: string, rules: Rules) => {
        created.push({ name, rules })
        return {
          createHTML: (s: string) => ({ html: rules.createHTML(s), toString: () => s }),
          createScriptURL: (s: string) => rules.createScriptURL(s),
        }
      },
    })
  }
  return { mod: await import('./trustedTypes'), created }
}

afterEach(() => vi.unstubAllGlobals())

describe('trusted types policy', () => {
  it('creates exactly one policy, under the name the CSP allows', async () => {
    const { mod, created } = await load(true)
    mod.parseInertHtml('<b>a</b>')
    mod.trustedScriptUrl('/assets/worker.js')
    mod.parseInertHtml('<i>b</i>')
    expect(created.map((c) => c.name)).toEqual([mod.TRUSTED_TYPES_POLICY])
  })

  it('parses HTML into a detached document that runs nothing', async () => {
    const { mod } = await load(true)
    const onerror = vi.fn()
    vi.stubGlobal('pwned', onerror)
    const doc = mod.parseInertHtml('<img src=x onerror="pwned()"><script>pwned()</script>Hi')
    expect(doc).not.toBe(document)
    expect(doc.body.textContent).toBe('pwned()Hi')
    expect(document.querySelector('img[src=x]')).toBeNull()
    expect(onerror).not.toHaveBeenCalled()
  })

  it('allows same-origin script URLs only', async () => {
    for (const withTrustedTypes of [true, false]) {
      const { mod } = await load(withTrustedTypes)
      expect(mod.trustedScriptUrl('/assets/process.worker.js')).toBe(
        `${location.origin}/assets/process.worker.js`,
      )
      expect(() => mod.trustedScriptUrl('https://evil.example/w.js')).toThrow(/cross-origin/)
      expect(() => mod.trustedScriptUrl('data:text/javascript,1')).toThrow(/cross-origin/)
    }
  })

  it('works without Trusted Types support', async () => {
    const { mod } = await load(false)
    expect(mod.parseInertHtml('<p>x</p>').body.textContent).toBe('x')
  })
})
