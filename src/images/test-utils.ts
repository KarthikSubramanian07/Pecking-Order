/**
 * Test doubles for the drag-and-drop APIs jsdom doesn't implement:
 * DataTransfer, and the FileSystem entry tree behind folder drops.
 */

interface FakeTransfer {
  files?: File[]
  entries?: FileSystemEntry[]
  data?: Record<string, string>
}

/**
 * Like a real DataTransfer, this one goes dead after the current task: any
 * read after an `await` throws, catching code that snapshots too late.
 */
export function fakeDataTransfer({
  files = [],
  entries = [],
  data = {},
}: FakeTransfer): DataTransfer {
  let live = true
  queueMicrotask(() => {
    live = false
  })
  const guard = <T>(read: () => T): T => {
    if (!live) throw new Error('DataTransfer read after the event ended')
    return read()
  }
  const items = [
    ...files.map((f) => ({
      kind: 'file',
      getAsFile: () => guard(() => f),
      webkitGetAsEntry: () => guard(() => null),
    })),
    ...entries.map((e) => ({
      kind: 'file',
      getAsFile: () => guard(() => null),
      webkitGetAsEntry: () => guard(() => e),
    })),
  ]
  return {
    items,
    files: [],
    getData: (type: string) => guard(() => data[type] ?? ''),
  } as unknown as DataTransfer
}

export function fileEntry(file: File): FileSystemFileEntry {
  return {
    name: file.name,
    isFile: true,
    isDirectory: false,
    file: (ok: (f: File) => void) => setTimeout(() => ok(file)),
  } as unknown as FileSystemFileEntry
}

/** A directory whose reader hands out `batchSize` children per `readEntries` call. */
export function dirEntry(
  name: string,
  children: FileSystemEntry[],
  batchSize = 2,
): FileSystemDirectoryEntry {
  return {
    name,
    isFile: false,
    isDirectory: true,
    createReader: () => {
      let offset = 0
      return {
        readEntries: (ok: (batch: FileSystemEntry[]) => void) => {
          const batch = children.slice(offset, offset + batchSize)
          offset += batchSize
          setTimeout(() => ok(batch))
        },
      }
    },
  } as unknown as FileSystemDirectoryEntry
}

export function imageFile(name: string, content = name, type = 'image/png'): File {
  return new File([content], name, { type })
}
