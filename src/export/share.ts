// CONTRACT STUB — implemented by the export workstream.
export function fileNameFor(title: string, ext = 'png'): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
  return `${slug || 'pecking-order'}.${ext}`
}
export function downloadBlob(_blob: Blob, _name: string): void {
  throw new Error('not implemented')
}
/** Pass a Promise so Safari keeps the user-activation. Resolves false if unsupported. */
export async function copyImageToClipboard(_png: Promise<Blob>): Promise<boolean> {
  throw new Error('not implemented')
}
export function canShareFiles(): boolean {
  return false
}
export async function shareImage(_blob: Blob, _title: string): Promise<boolean> {
  throw new Error('not implemented')
}
