import type { DocumentStoreContext } from '../documentStoreContext'
import type { DocumentState } from '../documentStoreTypes'

type HistoryActions = Pick<
  DocumentState,
  | 'undo'
  | 'redo'
  | 'beginTextEditSession'
  | 'commitTextEditSession'
>

export function createHistorySlice(context: DocumentStoreContext): HistoryActions {
  const {
    get,
    set,
    getCurrentSnapshot,
    restoreSnapshot,
    finalizeActiveTextEditSession,
  } = context

  return {
    undo: () => {
      finalizeActiveTextEditSession()
      const { undoStack } = get()
      if (undoStack.length === 0) return

      const current = getCurrentSnapshot()
      if (!current) return

      const previous = undoStack[undoStack.length - 1]
      restoreSnapshot(previous, undoStack.slice(0, -1), [current, ...get().redoStack])
    },

    redo: () => {
      finalizeActiveTextEditSession()
      const { redoStack } = get()
      if (redoStack.length === 0) return

      const current = getCurrentSnapshot()
      if (!current) return

      const next = redoStack[0]
      restoreSnapshot(next, [...get().undoStack, current], redoStack.slice(1))
    },

    beginTextEditSession: (nodeId) => {
      const activeSession = get().activeTextEditSession
      if (activeSession?.nodeId === nodeId) return

      finalizeActiveTextEditSession()
      const before = getCurrentSnapshot()
      if (!before) return

      set({
        activeTextEditSession: {
          nodeId,
          before,
          didChange: false,
        },
      })
    },

    commitTextEditSession: (nodeId) => {
      const activeSession = get().activeTextEditSession
      if (activeSession?.nodeId !== nodeId) return

      finalizeActiveTextEditSession()
    },
  }
}
