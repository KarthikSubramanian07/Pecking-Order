/**
 * Opens a native file or folder picker from a user gesture and resolves with
 * the chosen files. The input is created on the fly so no hidden DOM lingers.
 */
export function pickFiles(opts: { folder?: boolean } = {}): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.accept = 'image/*'
    if (opts.folder) input.webkitdirectory = true
    input.addEventListener('change', () => resolve([...(input.files ?? [])]), { once: true })
    input.addEventListener('cancel', () => resolve([]), { once: true })
    input.click()
  })
}
