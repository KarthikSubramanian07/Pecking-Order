import { beforeEach, describe, expect, it, vi } from 'vitest'
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

  it('explains bad references instead of throwing', async () => {
    expect(await call('move_item', { item: 'ghost', tier: 'S' })).toMatch(/No item/)
    await call('add_items', { labels: ['Egg'] })
    expect(await call('move_item', { item: 'Egg', tier: 'Z' })).toMatch(/No tier/)
  })
})
