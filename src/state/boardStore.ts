/**
 * The one store for the open board.
 *
 * - Every edit goes through `apply(op)`, which runs a pure `core/board` op in
 *   an Immer draft and records the previous snapshot for undo.
 * - Drags are "gestures": `beginGesture()` snapshots the board, live moves
 *   during the drag skip history, and `endGesture()` records one undo step.
 * - Persistence is a debounced write-behind to IndexedDB.
 */
import { produce } from 'immer'
import { create } from 'zustand'
import { cloneBoard, createBoard, referencedImages } from '@/core/board'
import { emptyHistory, type History, record, redo, undo } from '@/core/history'
import type { TierPreset } from '@/core/presets'
import type { Board, BoardSummary } from '@/core/types'
import * as storage from '@/storage/db'

const SAVE_DELAY_MS = 400

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface BoardState {
  board: Board | null
  boards: BoardSummary[]
  history: History<Board>
  saveStatus: SaveStatus
  ready: boolean

  init(): Promise<void>
  /** Applies a mutating op to the board as one undoable step. */
  apply(op: (draft: Board) => void): void
  beginGesture(): void
  /** Moves during a gesture: no history entries, no saves. */
  applyLive(op: (draft: Board) => void): void
  endGesture(commit?: boolean): void
  undo(): void
  redo(): void

  /** Creates and opens a board; resolves with its id (for navigation). */
  newBoard(opts?: { title?: string; preset?: TierPreset }): Promise<string>
  /** Saves and opens an already-built board (packs, backups, duplicates). */
  openBoard(board: Board): Promise<string>
  /** Loads a saved board by id; resolves false if it doesn't exist. */
  loadBoard(id: string): Promise<boolean>
  closeBoard(): Promise<void>
  duplicateBoard(): Promise<string | null>
  deleteBoard(id: string): Promise<void>
  refreshBoards(): Promise<void>
  flush(): Promise<void>
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
let refreshSeq = 0
let gestureStart: Board | null = null

export const useBoardStore = create<BoardState>()((set, get) => {
  const scheduleSave = () => {
    clearTimeout(saveTimer)
    set({ saveStatus: 'saving' })
    saveTimer = setTimeout(() => void get().flush(), SAVE_DELAY_MS)
  }

  const setBoard = (board: Board | null) => set({ board, history: emptyHistory() })

  return {
    board: null,
    boards: [],
    history: emptyHistory(),
    saveStatus: 'idle',
    ready: false,

    async init() {
      if (get().ready) return
      void storage.requestPersistence()
      await get().refreshBoards()
      set({ ready: true })
    },

    apply(op) {
      const { board, history } = get()
      if (!board) return
      const next = produce(board, op)
      if (next === board) return
      set({ board: next, history: record(history, board) })
      scheduleSave()
    },

    beginGesture() {
      gestureStart = get().board
    },

    applyLive(op) {
      const { board } = get()
      if (!board) return
      const next = produce(board, op)
      if (next !== board) set({ board: next })
    },

    endGesture(commit = true) {
      const start = gestureStart
      gestureStart = null
      const { board, history } = get()
      if (!start || !board) return
      if (!commit) {
        set({ board: start })
        return
      }
      if (board !== start) {
        set({ history: record(history, start) })
        scheduleSave()
      }
    },

    undo() {
      const { board, history } = get()
      if (!board) return
      const r = undo(history, board)
      if (!r) return
      set({ board: r.state, history: r.history })
      scheduleSave()
    },

    redo() {
      const { board, history } = get()
      if (!board) return
      const r = redo(history, board)
      if (!r) return
      set({ board: r.state, history: r.history })
      scheduleSave()
    },

    newBoard(opts) {
      return get().openBoard(createBoard(opts))
    },

    async openBoard(board) {
      await get().flush()
      setBoard(board)
      await storage.putBoard(board)
      await get().refreshBoards()
      return board.id
    },

    async loadBoard(id) {
      if (get().board?.id === id) return true
      await get().flush()
      const board = await storage.getBoard(id)
      setBoard(board ?? null)
      return Boolean(board)
    },

    async closeBoard() {
      await get().flush()
      setBoard(null)
    },

    async duplicateBoard() {
      const { board } = get()
      return board ? get().openBoard(cloneBoard(board)) : null
    },

    async deleteBoard(id) {
      // Keep images still referenced by the undo stack of the open board.
      const keep = get().history.past.flatMap((b) => [...referencedImages(b)])
      if (get().board?.id === id) setBoard(null)
      await storage.deleteBoard(id)
      await get().refreshBoards()
      void storage.collectGarbage(keep)
    },

    async refreshBoards() {
      // Only the latest refresh may win; a slow earlier one could resurrect a deleted board.
      const seq = ++refreshSeq
      const boards = await storage.listBoards()
      if (seq === refreshSeq) set({ boards })
    },

    async flush() {
      clearTimeout(saveTimer)
      const { board } = get()
      if (!board || get().saveStatus !== 'saving') return
      try {
        await storage.putBoard(board)
        set({ saveStatus: 'saved' })
        void get().refreshBoards()
      } catch (err) {
        console.error('Save failed', err)
        set({ saveStatus: 'error' })
      }
    },
  }
})

/** Imperative access for event handlers outside React. */
export const boardActions = () => useBoardStore.getState()
