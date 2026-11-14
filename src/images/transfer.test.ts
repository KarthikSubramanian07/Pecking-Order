import { describe, expect, it } from 'vitest'
import { dirEntry, fakeDataTransfer, fileEntry, imageFile } from './test-utils'
import {
  type Draft,
  draftsFromStrings,
  draftsFromText,
  filesInDirectories,
  imagesFromHtml,
  MAX_TEXT_LINES,
  snapshotDataTransfer,
  urlsFromUriList,
} from './transfer'

const hrefs = (drafts: Draft[]) => drafts.map((d) => (d.kind === 'url' ? d.url.href : d.label))

describe('snapshotDataTransfer', () => {
  it('copies files, folders and strings synchronously', async () => {
    const dir = dirEntry('Pics', [])
    const dt = fakeDataTransfer({
      files: [imageFile('a.png')],
      entries: [dir],
      data: { 'text/plain': 'hello' },
    })
    const snap = snapshotDataTransfer(dt)
    await Promise.resolve()
    expect(snap.files.map((f) => f.name)).toEqual(['a.png'])
    expect(snap.directories).toEqual([dir])
    expect(snap.text).toBe('hello')
    // The fake goes dead after the event, like the real thing.
    expect(() => dt.getData('text/plain')).toThrow()
  })
})

describe('filesInDirectories', () => {
  it('recurses folders, reading every readEntries batch', async () => {
    const tree = dirEntry(
      'Snacks',
      [
        fileEntry(imageFile('chips.png')),
        fileEntry(imageFile('.DS_Store')),
        dirEntry('Sweet', [fileEntry(imageFile('fudge.jpg')), fileEntry(imageFile('toffee.jpg'))]),
        fileEntry(imageFile('pretzel.webp')),
        dirEntry('.git', [fileEntry(imageFile('secret.png'))]),
      ],
      3,
    ) // five children → batches of 3 and 2, then an empty batch
    const files = await filesInDirectories([tree])
    expect(files.map((f) => f.name)).toEqual([
      'chips.png',
      'fudge.jpg',
      'toffee.jpg',
      'pretzel.webp',
    ])
  })
})

describe('imagesFromHtml', () => {
  it('extracts absolute <img> sources with alt or title labels', () => {
    const html = `
      <p>hi</p>
      <img src="https://a.org/one.jpg" alt="  Pad   Thai ">
      <img src="https://a.org/two.png" title="Ramen">
      <img src="https://a.org/one.jpg" alt="duplicate">
      <img src="javascript:alert(1)">
      <img src="relative.png">
      <img src="data:image/gif;base64,R0lGOD">`
    const drafts = imagesFromHtml(html)
    expect(hrefs(drafts)).toEqual([
      'https://a.org/one.jpg',
      'https://a.org/two.png',
      'data:image/gif;base64,R0lGOD',
    ])
    expect(drafts.map((d) => (d.kind === 'url' ? d.label : undefined))).toEqual([
      'Pad Thai',
      'Ramen',
      undefined,
    ])
  })

  it('resolves relative sources against a <base>', () => {
    expect(hrefs(imagesFromHtml('<base href="https://a.org/x/"><img src="y.png">'))).toEqual([
      'https://a.org/x/y.png',
    ])
  })

  it('never executes or attaches the markup', () => {
    imagesFromHtml('<img src="x" onerror="window.__pwned = 1"><script>window.__pwned = 1</script>')
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined()
    expect(document.querySelector('img')).toBeNull()
  })
})

describe('urlsFromUriList', () => {
  it('skips comments and unsafe schemes', () => {
    const list = '# dragged\r\nhttps://a.org/x.png\r\nfile:///etc/passwd\r\n\r\nhttp://b.org/y'
    expect(hrefs(urlsFromUriList(list))).toEqual(['https://a.org/x.png', 'http://b.org/y'])
  })
})

describe('draftsFromText', () => {
  it('makes text cards from lines and fetches image links', () => {
    const { drafts, truncated } = draftsFromText(
      'Pizza\n\n  Tacos  \nhttps://a.org/sushi.jpg\nhttps://a.org/not-an-image',
    )
    expect(drafts).toEqual([
      { kind: 'text', label: 'Pizza' },
      { kind: 'text', label: 'Tacos' },
      { kind: 'url', url: new URL('https://a.org/sushi.jpg') },
      { kind: 'text', label: 'https://a.org/not-an-image' },
    ])
    expect(truncated).toBe(false)
  })

  it(`stops at ${MAX_TEXT_LINES} lines`, () => {
    const text = Array.from({ length: MAX_TEXT_LINES + 5 }, (_, i) => `Item ${i}`).join('\n')
    const { drafts, truncated } = draftsFromText(text)
    expect(drafts).toHaveLength(MAX_TEXT_LINES)
    expect(truncated).toBe(true)
  })
})

describe('draftsFromStrings', () => {
  it('prefers HTML, then the URI list, then plain text', () => {
    const base = { files: [], directories: [] }
    expect(
      hrefs(
        draftsFromStrings({
          ...base,
          html: '<img src="https://a.org/h.png">',
          uriList: 'https://a.org/u.png',
          text: 'https://a.org/u.png',
        }).drafts,
      ),
    ).toEqual(['https://a.org/h.png'])
    expect(
      hrefs(
        draftsFromStrings({
          ...base,
          html: '<b>no images</b>',
          uriList: 'https://a.org/u',
          text: 'u',
        }).drafts,
      ),
    ).toEqual(['https://a.org/u'])
    expect(
      hrefs(draftsFromStrings({ ...base, html: '', uriList: '', text: 'Just text' }).drafts),
    ).toEqual(['Just text'])
  })
})
