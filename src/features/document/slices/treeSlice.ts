import type { DocumentStoreContext } from '../documentStoreContext'
import type { DocumentState } from '../documentStoreTypes'
import { createTreeInsertDeleteSlice } from './treeInsertDeleteSlice'
import { createTreeLayoutSlice } from './treeLayoutSlice'
import { createTreeMoveSlice } from './treeMoveSlice'
import { createTreeTextSlice } from './treeTextSlice'

type TreeActions = Pick<
  DocumentState,
  | 'updateNodeText'
  | 'toggleCollapse'
  | 'indentNode'
  | 'outdentNode'
  | 'moveNode'
  | 'moveSelectedOutlineNodes'
  | 'indentSelectedOutlineNodes'
  | 'outdentSelectedOutlineNodes'
  | 'moveNodeToSibling'
  | 'moveNodeToParent'
  | 'commitMindMapLayout'
  | 'insertNode'
  | 'insertSiblingNode'
  | 'insertChildNode'
  | 'deleteNode'
  | 'getNodeOperationState'
>

export function createTreeSlice(context: DocumentStoreContext): TreeActions {
  return {
    ...createTreeTextSlice(context),
    ...createTreeMoveSlice(context),
    ...createTreeInsertDeleteSlice(context),
    ...createTreeLayoutSlice(context),
  }
}
