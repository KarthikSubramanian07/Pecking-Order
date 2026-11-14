/**
 * Transient UI state + small user preferences.
 * Preferences are tiny strings, so localStorage is fine here (boards are not).
 */
import { create } from 'zustand'
import type { ItemId } from '@/core/types'

export type ThemePref = 'system' | 'light' | 'dark'
export type ItemSize = 'sm' | 'md' | 'lg'
export type DialogId = 'new' | 'search' | 'export' | 'boards' | 'shortcuts' | 'item' | null

export const ITEM_SIZE_PX: Record<ItemSize, number> = { sm: 64, md: 88, lg: 116 }

export interface Toast {
  id: number
  message: string
  tone?: 'info' | 'error'
  action?: { label: string; run: () => void }
}

interface Prefs {
  theme: ThemePref
  itemSize: ItemSize
  showLabels: boolean
}

interface UiState extends Prefs {
  /** Item picked for tap-to-place / keyboard moves. */
  selected: ItemId | null
  /** Item that just landed — drives the "peck" squash animation. */
  landed: ItemId | null
  dialog: DialogId
  editingItem: ItemId | null
  toasts: Toast[]
  busy: { label: string; done: number; total: number } | null

  setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void
  select(id: ItemId | null): void
  land(id: ItemId): void
  open(dialog: Exclude<DialogId, null>, itemId?: ItemId): void
  close(): void
  toast(t: Omit<Toast, 'id'>): void
  dismiss(id: number): void
  setBusy(busy: UiState['busy']): void
}

const PREFS_KEY = 'pecking-order:prefs'

function loadPrefs(): Prefs {
  const defaults: Prefs = { theme: 'system', itemSize: 'md', showLabels: true }
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>
    return {
      theme: ['system', 'light', 'dark'].includes(raw.theme as string)
        ? (raw.theme as ThemePref)
        : defaults.theme,
      itemSize: raw.itemSize && raw.itemSize in ITEM_SIZE_PX ? raw.itemSize : defaults.itemSize,
      showLabels: typeof raw.showLabels === 'boolean' ? raw.showLabels : defaults.showLabels,
    }
  } catch {
    return defaults
  }
}

let toastSeq = 0
let landTimer: ReturnType<typeof setTimeout> | undefined

export const useUiStore = create<UiState>()((set, get) => ({
  ...loadPrefs(),
  selected: null,
  landed: null,
  dialog: null,
  editingItem: null,
  toasts: [],
  busy: null,

  setPref(key, value) {
    set({ [key]: value } as Partial<UiState>)
    const { theme, itemSize, showLabels } = get()
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ theme, itemSize, showLabels }))
    } catch {
      // Private mode / storage disabled: preferences just won't persist.
    }
  },

  select: (selected) => set({ selected }),

  land(id) {
    clearTimeout(landTimer)
    set({ landed: id })
    landTimer = setTimeout(() => set({ landed: null }), 320)
  },

  open: (dialog, itemId) => set({ dialog, editingItem: itemId ?? null }),
  close: () => set({ dialog: null, editingItem: null }),

  toast(t) {
    const id = ++toastSeq
    set({ toasts: [...get().toasts.slice(-2), { ...t, id }] })
    setTimeout(() => get().dismiss(id), t.action ? 6000 : 3500)
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  setBusy: (busy) => set({ busy }),
}))

export const ui = () => useUiStore.getState()
