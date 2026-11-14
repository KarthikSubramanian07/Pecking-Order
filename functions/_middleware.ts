/**
 * Cloudflare Pages middleware: serves the Markdown twin of a page to clients
 * that ask for `text/markdown` (agents, `curl -H 'Accept: text/markdown'`), a
 * Markdown 404 for unknown pages, and everything else untouched.
 *
 * Only the few types used here are declared, so the project does not need
 * @cloudflare/workers-types.
 */
import { isAppRoute, notFoundMarkdown, pagePath, route, varyOnAccept } from './_lib/negotiate'

interface AssetFetcher {
  fetch(input: Request | URL | string): Promise<Response>
}

interface PagesContext {
  request: Request
  env: { ASSETS: AssetFetcher }
  next(input?: Request | string, init?: RequestInit): Promise<Response>
}

const MARKDOWN = 'text/markdown; charset=utf-8'

export async function onRequest(context: PagesContext): Promise<Response> {
  const { request } = context
  if (request.method !== 'GET' && request.method !== 'HEAD') return context.next()

  const url = new URL(request.url)
  const decision = route(url.pathname, request.headers.get('Accept'))

  if (decision.kind === 'markdown') {
    // ASSETS.fetch applies the _headers rules, so security headers come along.
    const asset = await context.env.ASSETS.fetch(
      new Request(new URL(decision.asset, url), {
        method: request.method,
        headers: request.headers,
      }),
    )
    const response = new Response(asset.body, asset)
    if (asset.ok) {
      response.headers.set('Content-Type', MARKDOWN)
      response.headers.set('Link', `<${url.origin}${pagePath(url.pathname)}>; rel="canonical"`)
    }
    response.headers.set('Vary', varyOnAccept(response.headers.get('Vary')))
    return response
  }

  if (decision.kind === 'markdown-not-found') {
    // Generated here, so _headers does not apply: set the essentials directly.
    const body = request.method === 'HEAD' ? null : notFoundMarkdown(url.pathname, url.origin)
    return new Response(body, {
      status: 404,
      headers: {
        'Content-Type': MARKDOWN,
        Vary: 'Accept',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      },
    })
  }

  if (isAppRoute(url.pathname)) {
    // Boards are personal and local to one browser: serve the shell, never index it.
    const shell = await context.env.ASSETS.fetch(new URL('/', url))
    const response = new Response(request.method === 'HEAD' ? null : shell.body, shell)
    response.headers.set('X-Robots-Tag', 'noindex')
    response.headers.set('Vary', varyOnAccept(response.headers.get('Vary')))
    return response
  }

  const response = await context.next()
  if (!response.headers.get('Content-Type')?.includes('text/html')) return response
  const html = new Response(response.body, response)
  html.headers.set('Vary', varyOnAccept(html.headers.get('Vary')))
  return html
}
