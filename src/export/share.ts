/**
 * Getting the PNG out of the browser: download, clipboard, native share sheet.
 * Each path feature-detects and resolves false when unavailable, so the UI can
 * quietly offer the next option.
 */
export function fileNameFor(title: string, ext = 'png'): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
  return `${slug || 'pecking-order'}.${ext}`
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.append(a)
  a.click()
  a.remove()
  // Revoke on the next task: Safari cancels the download if revoked synchronously.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** Pass a Promise so Safari keeps the user-activation. Resolves false if unsupported. */
export async function copyImageToClipboard(png: Promise<Blob>): Promise<boolean> {
  if (typeof ClipboardItem === 'undefined' || typeof navigator.clipboard?.write !== 'function') {
    // Don't leave the render promise rejecting unobserved.
    png.catch(() => {})
    return false
  }
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
    return true
  } catch {
    return false
  }
}

export function canShareFiles(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function') return false
  if (typeof File === 'undefined') return false
  try {
    const probe = new File([new Uint8Array(1)], 'probe.png', { type: 'image/png' })
    return navigator.canShare({ files: [probe] })
  } catch {
    return false
  }
}

/**
 * Opens the native share sheet. Resolves false if unsupported, cancelled
 * (AbortError) or refused (e.g. an expired user gesture), so callers can offer
 * a download instead without wrapping every call in try/catch.
 */
export async function shareImage(blob: Blob, title: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false
  const file = new File([blob], fileNameFor(title), { type: 'image/png' })
  const data: ShareData = { files: [file], title }
  if (typeof navigator.canShare === 'function' && !navigator.canShare(data)) return false
  try {
    await navigator.share(data)
    return true
  } catch {
    return false
  }
}
