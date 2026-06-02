import type { OutlineNode } from '../../../types/document'
import {
  countTagUsage,
  normalizeTag,
  normalizeTagList,
} from '../../filter/filterUtils'
import type { DocumentStoreContext } from '../documentStoreContext'
import type { DocumentState } from '../documentStoreTypes'

type NodeMetadataActions = Pick<
  DocumentState,
  | 'toggleNodeCheck'
  | 'updateNodeNote'
  | 'clearNodeNote'
  | 'setNodeChecked'
  | 'toggleNodeChecked'
  | 'addNodeTag'
  | 'removeNodeTag'
  | 'setNodeTags'
  | 'renameTag'
  | 'removeTagFromDocument'
  | 'mergeTag'
>

export function createNodeMetadataSlice(context: DocumentStoreContext): NodeMetadataActions {
  const { get, set, beginMutation, setHistoryAfterMutation, mutateNodeProperty } = context

  const normalizeNote = (note: string): string | undefined => {
    const trimmed = note.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }

  const areTagsEqual = (left?: string[], right?: string[]): boolean => {
    return JSON.stringify(left ?? undefined) === JSON.stringify(right ?? undefined)
  }

  return {
    toggleNodeCheck: (nodeId) => {
      get().toggleNodeChecked(nodeId)
    },

    updateNodeNote: (nodeId, note) => {
      const normalizedNote = normalizeNote(note)
      mutateNodeProperty(nodeId, (node, now) => {
        if (node.note === normalizedNote) return node
        return {
          ...node,
          note: normalizedNote,
          updatedAt: now,
        }
      })
    },

    clearNodeNote: (nodeId) => {
      get().updateNodeNote(nodeId, '')
    },

    setNodeChecked: (nodeId, checked) => {
      mutateNodeProperty(nodeId, (node, now) => {
        if (node.checked === checked) return node
        return {
          ...node,
          checked,
          updatedAt: now,
        }
      })
    },

    toggleNodeChecked: (nodeId) => {
      mutateNodeProperty(nodeId, (node, now) => ({
        ...node,
        checked: node.checked === undefined ? false : !node.checked,
        updatedAt: now,
      }))
    },

    addNodeTag: (nodeId, tag) => {
      mutateNodeProperty(nodeId, (node, now) => {
        const tags = normalizeTagList([...(node.tags ?? []), tag])
        if (areTagsEqual(node.tags, tags)) return node
        return {
          ...node,
          tags,
          updatedAt: now,
        }
      })
    },

    removeNodeTag: (nodeId, tag) => {
      mutateNodeProperty(nodeId, (node, now) => {
        const tags = normalizeTagList((node.tags ?? []).filter((currentTag) => currentTag !== tag))
        if (areTagsEqual(node.tags, tags)) return node
        return {
          ...node,
          tags,
          updatedAt: now,
        }
      })
    },

    setNodeTags: (nodeId, tags) => {
      const normalizedTags = normalizeTagList(tags)
      mutateNodeProperty(nodeId, (node, now) => {
        if (areTagsEqual(node.tags, normalizedTags)) return node
        return {
          ...node,
          tags: normalizedTags,
          updatedAt: now,
        }
      })
    },

    renameTag: (from, to) => {
      const fromTag = normalizeTag(from)
      const toTag = normalizeTag(to)
      if (!fromTag || !toTag || fromTag === toTag) return

      const before = beginMutation()
      const { currentDoc } = get()
      if (!currentDoc || !before) return

      let didChange = false
      const now = Date.now()
      const renameInNode = (node: OutlineNode): OutlineNode => {
        const tags = normalizeTagList((node.tags ?? []).map((tag) => (tag === fromTag ? toTag : tag)))
        const children = node.children.map(renameInNode)
        const tagsChanged = !areTagsEqual(node.tags, tags)
        if (tagsChanged) didChange = true

        return {
          ...node,
          tags,
          updatedAt: tagsChanged ? now : node.updatedAt,
          children,
        }
      }

      const updatedDoc = {
        ...currentDoc,
        root: renameInNode(currentDoc.root),
        updatedAt: now,
      }

      if (!didChange) return

      set((state) => ({
        currentDoc: updatedDoc,
        filter: {
          ...state.filter,
          tag: state.filter.tag === fromTag ? toTag : state.filter.tag,
        },
        isDirty: true,
      }))
      setHistoryAfterMutation(before)
    },

    removeTagFromDocument: (tag) => {
      const targetTag = normalizeTag(tag)
      const { currentDoc } = get()
      if (!currentDoc || !targetTag) return

      const affectedCount = countTagUsage(currentDoc.root, targetTag)
      if (affectedCount === 0) return
      if (!window.confirm(`确定从 ${affectedCount} 个节点中删除标签「${targetTag}」吗？`)) return

      const before = beginMutation()
      if (!before) return

      const now = Date.now()
      const removeFromNode = (node: OutlineNode): OutlineNode => {
        const tags = normalizeTagList((node.tags ?? []).filter((currentTag) => currentTag !== targetTag))
        const children = node.children.map(removeFromNode)
        const tagsChanged = !areTagsEqual(node.tags, tags)

        return {
          ...node,
          tags,
          updatedAt: tagsChanged ? now : node.updatedAt,
          children,
        }
      }

      const updatedDoc = {
        ...currentDoc,
        root: removeFromNode(currentDoc.root),
        updatedAt: now,
      }

      set((state) => ({
        currentDoc: updatedDoc,
        filter: {
          ...state.filter,
          tag: state.filter.tag === targetTag ? null : state.filter.tag,
        },
        isDirty: true,
      }))
      setHistoryAfterMutation(before)
    },

    mergeTag: (from, to) => {
      const fromTag = normalizeTag(from)
      const toTag = normalizeTag(to)
      const { currentDoc } = get()
      if (!currentDoc || !fromTag || !toTag || fromTag === toTag) return

      const affectedCount = countTagUsage(currentDoc.root, fromTag)
      if (affectedCount === 0) return
      if (!window.confirm(`确定将 ${affectedCount} 个节点中的「${fromTag}」合并为「${toTag}」吗？`)) return

      get().renameTag(fromTag, toTag)
    },
  }
}
