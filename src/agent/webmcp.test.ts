import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_ITEMS } from '@/core/board'
import { useBoardStore } from '@/state/boardStore'
import { registerAgentTools } from './webmcp'

type Tool = {
  name: string
  execute(i: Record<string, unknown>): Promise<{ content: { text: string }[] }>
}
const tools = new Map<string, Tool>()

beforeEach(async () => {
  tools.clear()
  Object.defineProperty(document, 'modelContext', {
    configurable: true,
    value: { registerTool: vi.fn(async (t: Tool) => void tools.set(t.name, t)) },
  })
  useBoardStore.setState({ ready: false, board: null })
  await useBoardStore.getState().init()
  await useBoardStore.getState().newBoard()
  await registerAgentTools()
})

const call = async (name: string, input: Record<string, unknown> = {}) =>
  (await tools.get(name)?.execute(input))?.content[0]?.text

describe('WebMCP tools', () => {
  it('registers every tool', () => {
    expect([...tools.keys()]).toEqual(
      expect.arrayContaining([
        'get_board',
        'add_items',
        'move_item',
        'set_title',
        'add_tier',
        'open_export',
      ]),
    )
  })

  it('adds, moves and reads items', async () => {
    await call('add_items', { labels: ['Rust', 'Go', ''] })
    await call('move_item', { item: 'rust', tier: 'S' })
    await call('set_title', { title: 'Languages' })
    const board = JSON.parse((await call('get_board')) ?? '{}')
    expect(board.title).toBe('Languages')
    expect(board.tiers[0].items).toEqual(['Rust'])
    expect(board.unranked).toEqual(['Go'])
  })

  it('starts a new board', async () => {
    await call('new_board', { title: 'Cereals' })
    expect(useBoardStore.getState().board?.title).toBe('Cereals')
  })

  it('never turns a non-string board title into text', async () => {
    await call('new_board', { title: { toString: () => 'sneaky' } })
    expect(useBoardStore.getState().board?.title).toBe('Untitled pecking order')
    await call('new_board', { title: 't'.repeat(100_000) })
    expect(useBoardStore.getState().board?.title.length).toBeLessThanOrEqual(120)
  })

  it('explains bad references instead of throwing', async () => {
    expect(await call('move_item', { item: 'ghost', tier: 'S' })).toMatch(/No item/)
    await call('add_items', { labels: ['Egg'] })
    expect(await call('move_item', { item: 'Egg', tier: 'Z' })).toMatch(/No tier/)
  })
})

describe('WebMCP tools with hostile input', () => {
  const board = () => useBoardStore.getState().board!

  it('caps argument sizes and ignores non-string labels', async () => {
    const before = Object.keys(board().items).length
    await call('add_items', {
      labels: ['x'.repeat(1_000_000), 42, { toString: () => 'sneaky' }, null, ' Ok '],
    })
    const added = Object.values(board().items).slice(before)
    expect(added.map((i) => i.label.length <= 80)).toEqual([true, true])
    expect(added.at(-1)?.label).toBe('Ok')
  })

  it('refuses to match an item or tier from an empty query', async () => {
    await call('add_items', { labels: ['First'] })
    expect(await call('move_item', { item: '', tier: 'S' })).toMatch(/No item/)
    expect(await call('move_item', { item: '   ', tier: 'S' })).toMatch(/No item/)
    expect(await call('move_item', { item: 'First', tier: '' })).toMatch(/No tier/)
    expect(await call('add_items', { labels: ['Z'], tier: '' })).toMatch(/Added 1/)
  })

  it('requires real titles and labels instead of stringifying junk', async () => {
    const title = board().title
    expect(await call('set_title', { title: { evil: true } })).toMatch(/required/)
    expect(board().title).toBe(title)
    const tiers = board().tiers.length
    expect(await call('add_tier', {})).toMatch(/required/)
    expect(board().tiers).toHaveLength(tiers)
  })

  it('ignores non-integer or negative positions', async () => {
    await call('add_items', { labels: ['Pos'] })
    for (const p of [-1, 1.5, Number.NaN, '0']) {
      expect(await call('move_item', { item: 'Pos', tier: 'S', position: p })).toBe('Moved.')
    }
    expect(await call('add_tier', { label: 'New', position: -5 })).toBe('Tier added.')
    expect(board().tiers.at(-1)?.label).toBe('New')
  })

  it('stops at the item limit and says so', async () => {
    const room = MAX_ITEMS - Object.keys(board().items).length
    const labels = Array.from({ length: 200 }, (_, i) => `n${i}`)
    let reply = ''
    for (let added = 0; added <= room; added += 200) reply = (await call('add_items', { labels }))!
    expect(reply).toMatch(/full/)
    expect(Object.keys(board().items)).toHaveLength(MAX_ITEMS)
  })

  it('every change is undoable', async () => {
    const start = board()
    await call('add_items', { labels: ['Undo me'] })
    await call('set_title', { title: 'Changed' })
    useBoardStore.getState().undo()
    useBoardStore.getState().undo()
    expect(board()).toEqual(start)
  })
})
