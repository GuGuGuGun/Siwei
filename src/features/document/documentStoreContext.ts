import type { StoreApi } from 'zustand'

import type { OutlineDocument, OutlineNode } from '../../types/document'
import type { DocumentHistoryController } from './documentStoreHistory'
import { createSnapshot } from './documentStoreHelpers'
import type { DocumentState } from './documentStoreTypes'

export type StoreSet = StoreApi<DocumentState>['setState']
export type StoreGet = StoreApi<DocumentState>['getState']

export interface DocumentStoreContext extends DocumentHistoryController {
  set: StoreSet
  get: StoreGet
  mutateNodeProperty: (
    nodeId: string,
    updater: (node: OutlineNode, now: number) => OutlineNode,
  ) => void
  markDocumentDirty: (doc: OutlineDocument) => boolean
}

export function createDirtyStateSelector(get: StoreGet) {
  return (doc: OutlineDocument): boolean => {
    const state = get()
    return state.cleanSnapshotKey === null
      ? true
      : createSnapshot(doc, state.selectedNodeId, state.collapsedNodeIds).key !== state.cleanSnapshotKey
  }
}
