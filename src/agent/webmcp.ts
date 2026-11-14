/**
 * WebMCP: exposes Pecking Order's core actions as structured tools that
 * in-browser AI agents can call (https://github.com/webmachinelearning/webmcp).
 * Every tool reuses the same undoable actions as the UI, so anything an agent
 * does shows up on screen and can be undone with ⌘Z.
 */
import { containerOrder, opAddTier, opMoveItem, opSetTitle } from '@/core/board'
import { COOP, type ContainerId } from '@/core/types'
import { boardActions } from '@/state/boardStore'
import { ui } from '@/state/uiStore'
import { addItems } from '@/ui/actions'

interface ToolResult {
  content: { type: 'text'; text: string }[]
}

interface ModelContextTool {
  name: string
  title?: string
  description: string
  inputSchema?: object
  annotations?: { readOnlyHint?: boolean }
  execute(input: Record<string, unknown>): Promise<ToolResult>
}

interface ModelContext {
  registerTool(tool: ModelContextTool, options?: { signal?: AbortSignal }): Promise<void>
}

const text = (t: string): ToolResult => ({ content: [{ type: 'text', text: t }] })

function snapshot() {
  const b = boardActions().board
  if (!b) return null
  const labelsOf = (cid: ContainerId) =>
    (b.placement[cid] ?? []).map((id) => b.items[id]?.label ?? '')
  return {
    title: b.title,
    tiers: b.tiers.map((t) => ({ label: t.label, items: labelsOf(t.id) })),
    unranked: labelsOf(COOP),
  }
}

/** Resolves "S", "top", "coop" or "unranked" to a container id. */
function findContainer(name: string): ContainerId | undefined {
  const b = boardActions().board
  if (!b) return undefined
  const n = name.trim().toLowerCase()
  if (['coop', 'unranked', 'the coop', 'pool'].includes(n)) return COOP
  return b.tiers.find((t) => t.label.toLowerCase() === n)?.id
}

function findItem(label: string): string | undefined {
  const b = boardActions().board
  if (!b) return undefined
  const n = label.trim().toLowerCase()
  const order = containerOrder(b).flatMap((c) => b.placement[c] ?? [])
  return (
    order.find((id) => b.items[id]?.label.toLowerCase() === n) ??
    order.find((id) => b.items[id]?.label.toLowerCase().includes(n))
  )
}

const TOOLS: ModelContextTool[] = [
  {
    name: 'get_board',
    title: 'Read the current tier list',
    description:
      'Returns the open tier list: its title, each tier (top to bottom) with the item labels in order, and the unranked items in the Coop.',
    annotations: { readOnlyHint: true },
    async execute() {
      return text(JSON.stringify(snapshot()))
    },
  },
  {
    name: 'add_items',
    title: 'Add items',
    description:
      'Adds text items to the tier list. Puts them in the named tier, or in the unranked Coop if no tier is given.',
    inputSchema: {
      type: 'object',
      properties: {
        labels: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 200,
          description: 'Item names',
        },
        tier: { type: 'string', description: 'Tier label such as "S" or "A"; omit for the Coop' },
      },
      required: ['labels'],
    },
    async execute(input) {
      const labels = (Array.isArray(input.labels) ? input.labels : [])
        .filter((l): l is string => typeof l === 'string' && l.trim() !== '')
        .slice(0, 200)
      const to = typeof input.tier === 'string' ? findContainer(input.tier) : COOP
      if (!to) return text(`No tier called "${String(input.tier)}".`)
      const ids = addItems(
        labels.map((label) => ({ label })),
        to,
      )
      return text(`Added ${ids.length} items.`)
    },
  },
  {
    name: 'move_item',
    title: 'Move an item to a tier',
    description: 'Moves an item (matched by its label) into a tier, or back to the unranked Coop.',
    inputSchema: {
      type: 'object',
      properties: {
        item: { type: 'string', description: 'The item label' },
        tier: { type: 'string', description: 'Tier label such as "S", or "coop" for unranked' },
        position: {
          type: 'integer',
          minimum: 0,
          description: 'Optional 0-based position within the tier',
        },
      },
      required: ['item', 'tier'],
    },
    async execute(input) {
      const id = findItem(String(input.item ?? ''))
      const to = findContainer(String(input.tier ?? ''))
      if (!id) return text(`No item matching "${String(input.item)}".`)
      if (!to) return text(`No tier called "${String(input.tier)}".`)
      const at = typeof input.position === 'number' ? input.position : undefined
      boardActions().apply((b) => opMoveItem(b, id, to, at))
      ui().land(id)
      return text('Moved.')
    },
  },
  {
    name: 'set_title',
    title: 'Rename the tier list',
    description: 'Sets the title of the open tier list.',
    inputSchema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
    async execute(input) {
      boardActions().apply((b) => opSetTitle(b, String(input.title ?? '')))
      return text('Renamed.')
    },
  },
  {
    name: 'add_tier',
    title: 'Add a tier',
    description: 'Adds a new tier at the bottom (or at a 0-based position) with the given label.',
    inputSchema: {
      type: 'object',
      properties: { label: { type: 'string' }, position: { type: 'integer', minimum: 0 } },
      required: ['label'],
    },
    async execute(input) {
      let created: string | null = null
      boardActions().apply((b) => {
        created = opAddTier(
          b,
          typeof input.position === 'number' ? input.position : undefined,
          String(input.label),
        )
      })
      return text(created ? 'Tier added.' : 'There are already too many tiers.')
    },
  },
  {
    name: 'open_export',
    title: 'Open the image export',
    description:
      'Opens the export dialog so the user can download, copy or share the tier list as a PNG.',
    async execute() {
      ui().open('export')
      return text('Export dialog opened.')
    },
  },
]

export async function registerAgentTools(signal?: AbortSignal): Promise<void> {
  const ctx =
    (document as unknown as { modelContext?: ModelContext }).modelContext ??
    (navigator as unknown as { modelContext?: ModelContext }).modelContext
  if (!ctx?.registerTool) return
  await Promise.allSettled(TOOLS.map((tool) => ctx.registerTool(tool, { signal })))
}
