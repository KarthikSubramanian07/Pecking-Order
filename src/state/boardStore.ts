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

const LAST_BOARD_KEY = 'lastBoardId'
const SAVE_DELAY_MS = 400

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

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
  canUndo(): boolean
  canRedo(): boolean

  newBoard(opts?: { title?: string; preset?: TierPreset }): Promise<void>
  openBoard(board: Board): Promise<void>
  switchBoard(id: string): Promise<void>
  duplicateBoard(): Promise<void>
  deleteBoard(id: string): Promise<void>
  refreshBoards(): Promise<void>
  flush(): Promise<void>
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
let gestureStart: Board | null = null

export const useBoardStore = create<BoardState>()((set, get) => {
  const scheduleSave = () => {
    clearTimeout(saveTimer)
    set({ saveStatus: 'saving' })
    saveTimer = setTimeout(() => void get().flush(), SAVE_DELAY_MS)
  }

  const setBoard = (board: Board, history: History<Board> = emptyHistory()) => {
    set({ board, history })
    void storage.setMeta(LAST_BOARD_KEY, board.id)
  }

  return {
    board: null,
    boards: [],
    history: emptyHistory(),
    saveStatus: 'idle',
    ready: false,

    async init() {
      if (get().ready) return
      void storage.requestPersistence()
      const lastId = await storage.getMeta<string>(LAST_BOARD_KEY)
      const board = (lastId && (await storage.getBoard(lastId))) || createBoard()
      setBoard(board)
      await storage.putBoard(board)
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

    canUndo: () => get().history.past.length > 0,
    canRedo: () => get().history.future.length > 0,

    async newBoard(opts) {
      await get().flush()
      await get().openBoard(createBoard(opts))
    },

    async openBoard(board) {
      await get().flush()
      setBoard(board)
      await storage.putBoard(board)
      await get().refreshBoards()
    },

    async switchBoard(id) {
      if (get().board?.id === id) return
      await get().flush()
      const board = await storage.getBoard(id)
      if (board) setBoard(board)
    },

    async duplicateBoard() {
      const { board } = get()
      if (board) await get().openBoard(cloneBoard(board))
    },

    async deleteBoard(id) {
      await storage.deleteBoard(id)
      const remaining = (await storage.listBoards()).filter((b) => b.id !== id)
      if (get().board?.id === id) {
        const next = remaining[0] ? await storage.getBoard(remaining[0].id) : undefined
        await get().openBoard(next ?? createBoard())
      }
      await get().refreshBoards()
      // Keep images still referenced by the undo stack of the open board.
      const keep = get().history.past.flatMap((b) => [...referencedImages(b)])
      void storage.collectGarbage(keep)
    },

    async refreshBoards() {
      set({ boards: await storage.listBoards() })
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
