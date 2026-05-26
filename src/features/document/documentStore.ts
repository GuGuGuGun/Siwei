import { create } from 'zustand'
import { OutlineDocument, OutlineNode } from '../../types/document'
import * as api from '../../services/siweiApi'
import { generateId } from '../../utils/id'
import {
  findPath,
  updateNodeAtPath,
  insertSiblingAtPath,
  deleteNodeAtPath,
  indentNodeAtPath,
  outdentNodeAtPath,
  moveNodeUpAtPath,
  moveNodeDownAtPath,
  getVisibleNodes,
} from '../../utils/tree'

export type ViewMode = 'outline' | 'mindmap' | 'split'
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface DocumentState {
  currentDoc: OutlineDocument | null
  viewMode: ViewMode
  selectedNodeId: string | null
  collapsedNodeIds: Set<string>
  isDirty: boolean
  saveStatus: SaveStatus
  currentFilePath: string | null

  // Document management actions
  newDoc: () => Promise<void>
  loadDoc: (path: string) => Promise<void>
  saveDoc: (customPath?: string | null) => Promise<boolean>
  exportDoc: (path: string, format: 'json' | 'markdown') => Promise<void>
  importDoc: (path: string, format: 'json' | 'markdown') => Promise<void>
  canDiscardCurrentDoc: () => boolean
  setViewMode: (mode: ViewMode) => void
  selectNode: (nodeId: string | null) => void

  // Tree manipulation actions
  updateNodeText: (nodeId: string, text: string) => void
  toggleCollapse: (nodeId: string) => void
  indentNode: (nodeId: string) => void
  outdentNode: (nodeId: string) => void
  moveNode: (nodeId: string, direction: 'up' | 'down') => void
  insertNode: (nodeId: string, text?: string) => string | null
  deleteNode: (nodeId: string) => void
  toggleNodeCheck: (nodeId: string) => void
}

export const useDocumentStore = create<DocumentState>((set, get) => {
  // Helper to extract collapsed node IDs recursively
  const collectCollapsedIds = (node: OutlineNode, ids: Set<string>) => {
    if (node.collapsed) {
      ids.add(node.id)
    }
    node.children.forEach((child) => collectCollapsedIds(child, ids))
  }

  return {
    currentDoc: null,
    viewMode: 'outline',
    selectedNodeId: null,
    collapsedNodeIds: new Set<string>(),
    isDirty: false,
    saveStatus: 'idle',
    currentFilePath: null,

    canDiscardCurrentDoc: () => {
      const { isDirty } = get()
      if (!isDirty) return true

      return window.confirm('当前文档有未保存的修改。确定要放弃这些修改吗？')
    },

    setViewMode: (viewMode) => set({ viewMode }),
    selectNode: (selectedNodeId) => set({ selectedNodeId }),

    newDoc: async () => {
      try {
        const doc = await api.newDocument()
        const collapsedIds = new Set<string>()
        collectCollapsedIds(doc.root, collapsedIds)
        
        // Select the first node or root
        const firstNodeId = doc.root.children.length > 0 ? doc.root.children[0].id : doc.root.id

        set({
          currentDoc: doc,
          currentFilePath: null,
          isDirty: false,
          collapsedNodeIds: collapsedIds,
          selectedNodeId: firstNodeId,
          saveStatus: 'idle',
        })
      } catch (error) {
        console.error('Error creating new document:', error)
      }
    },

    loadDoc: async (path) => {
      try {
        const doc = await api.loadDocument(path)
        const collapsedIds = new Set<string>()
        collectCollapsedIds(doc.root, collapsedIds)
        
        const firstNodeId = doc.root.children.length > 0 ? doc.root.children[0].id : doc.root.id

        set({
          currentDoc: doc,
          currentFilePath: path,
          isDirty: false,
          collapsedNodeIds: collapsedIds,
          selectedNodeId: firstNodeId,
          saveStatus: 'idle',
        })

        // Add to recents
        await api.addRecentDoc({
          path,
          title: doc.title || '未命名文档',
          lastOpenedAt: Date.now(),
        })
      } catch (error) {
        set({ saveStatus: 'error' })
        throw error
      }
    },

    saveDoc: async (customPath = null) => {
      const state = get()
      if (!state.currentDoc) return false

      let path = customPath || state.currentFilePath
      if (!path) {
        // Show save file dialog
        const defaultName = `${state.currentDoc.title || '未命名文档'}.siwei.json`
        path = await api.saveFileDialog(defaultName)
        if (!path) return false
      }

      set({ saveStatus: 'saving' })
      try {
        // Sync collapsed set into nodes before saving
        const syncCollapsed = (node: OutlineNode): OutlineNode => {
          return {
            ...node,
            collapsed: state.collapsedNodeIds.has(node.id),
            children: node.children.map(syncCollapsed),
          }
        }

        const updatedDoc = {
          ...state.currentDoc,
          root: syncCollapsed(state.currentDoc.root),
          updatedAt: Date.now(),
        }

        await api.saveDocument(path, updatedDoc)

        set((latestState) => {
          if (latestState.currentDoc !== state.currentDoc) {
            return {
              currentFilePath: path,
              isDirty: true,
              saveStatus: 'saved',
            }
          }

          return {
            currentDoc: updatedDoc,
            currentFilePath: path,
            isDirty: false,
            saveStatus: 'saved',
          }
        })

        // Add to recents
        await api.addRecentDoc({
          path,
          title: updatedDoc.title || '未命名文档',
          lastOpenedAt: Date.now(),
        })

        setTimeout(() => {
          if (get().saveStatus === 'saved') {
            set({ saveStatus: 'idle' })
          }
        }, 3000)

        return true
      } catch (error) {
        console.error('Error saving document:', error)
        set({ saveStatus: 'error' })
        return false
      }
    },

    exportDoc: async (path, format) => {
      const { currentDoc, collapsedNodeIds } = get()
      if (!currentDoc) return

      // Sync collapsed state to tree first
      const syncCollapsed = (node: OutlineNode): OutlineNode => {
        return {
          ...node,
          collapsed: collapsedNodeIds.has(node.id),
          children: node.children.map(syncCollapsed),
        }
      }

      const docToExport = {
        ...currentDoc,
        root: syncCollapsed(currentDoc.root),
      }

      if (format === 'markdown') {
        await api.exportMarkdown(path, docToExport)
      } else {
        await api.exportJson(path, docToExport)
      }
    },

    importDoc: async (path, format) => {
      try {
        let doc: OutlineDocument
        if (format === 'markdown') {
          doc = await api.importMarkdown(path)
        } else {
          doc = await api.importJson(path)
        }

        const collapsedIds = new Set<string>()
        collectCollapsedIds(doc.root, collapsedIds)

        set({
          currentDoc: doc,
          currentFilePath: format === 'json' ? path : null, // Markdown import creates a new unsaved document state
          isDirty: true,
          collapsedNodeIds: collapsedIds,
          selectedNodeId: doc.root.children.length > 0 ? doc.root.children[0].id : doc.root.id,
          saveStatus: 'idle',
        })
      } catch (error) {
        console.error('Error importing document:', error)
        throw error
      }
    },

    // Tree actions
    updateNodeText: (nodeId, text) => {
      const { currentDoc } = get()
      if (!currentDoc) return

      const now = Date.now()

      // If updating the root node (document title)
      if (currentDoc.root.id === nodeId) {
        set({
          currentDoc: {
            ...currentDoc,
            title: text,
            updatedAt: now,
            root: {
              ...currentDoc.root,
              text: text,
              updatedAt: now,
            },
          },
          isDirty: true,
        })
        return
      }

      const path = findPath(currentDoc.root, nodeId)
      if (!path) return

      const newRoot = updateNodeAtPath(currentDoc.root, path, (node) => ({
        ...node,
        text,
        updatedAt: now,
      }))

      set({
        currentDoc: {
          ...currentDoc,
          root: newRoot,
          updatedAt: now,
        },
        isDirty: true,
      })
    },

    toggleCollapse: (nodeId) => {
      set((state) => {
        const newCollapsed = new Set(state.collapsedNodeIds)
        if (newCollapsed.has(nodeId)) {
          newCollapsed.delete(nodeId)
        } else {
          newCollapsed.add(nodeId)
        }
        return {
          collapsedNodeIds: newCollapsed,
          isDirty: true,
        }
      })
    },

    indentNode: (nodeId) => {
      const { currentDoc } = get()
      if (!currentDoc) return

      const path = findPath(currentDoc.root, nodeId)
      if (!path) return

      const newRoot = indentNodeAtPath(currentDoc.root, path)
      set({
        currentDoc: {
          ...currentDoc,
          root: newRoot,
          updatedAt: Date.now(),
        },
        isDirty: true,
      })
    },

    outdentNode: (nodeId) => {
      const { currentDoc } = get()
      if (!currentDoc) return

      const path = findPath(currentDoc.root, nodeId)
      if (!path) return

      const newRoot = outdentNodeAtPath(currentDoc.root, path)
      set({
        currentDoc: {
          ...currentDoc,
          root: newRoot,
          updatedAt: Date.now(),
        },
        isDirty: true,
      })
    },

    moveNode: (nodeId, direction) => {
      const { currentDoc } = get()
      if (!currentDoc) return

      const path = findPath(currentDoc.root, nodeId)
      if (!path) return

      const newRoot =
        direction === 'up'
          ? moveNodeUpAtPath(currentDoc.root, path)
          : moveNodeDownAtPath(currentDoc.root, path)

      set({
        currentDoc: {
          ...currentDoc,
          root: newRoot,
          updatedAt: Date.now(),
        },
        isDirty: true,
      })
    },

    insertNode: (nodeId, text = '') => {
      const { currentDoc } = get()
      if (!currentDoc) return null

      const newId = generateId()
      const now = Date.now()
      const newNode: OutlineNode = {
        id: newId,
        text,
        createdAt: now,
        updatedAt: now,
        children: [],
      }

      // If active node is root, append child directly
      if (currentDoc.root.id === nodeId) {
        set({
          currentDoc: {
            ...currentDoc,
            root: {
              ...currentDoc.root,
              children: [...currentDoc.root.children, newNode],
            },
            updatedAt: now,
          },
          selectedNodeId: newId,
          isDirty: true,
        })
        return newId
      }

      const path = findPath(currentDoc.root, nodeId)
      if (!path) return null

      // Check if node is collapsed. If it has children and is NOT collapsed, we insert the new node as the FIRST child of this node instead of a sibling!
      // This is standard outliner UX (pressing enter on an expanded node with children creates a child, not a sibling).
      const activeNodePath = path
      let node: OutlineNode = currentDoc.root
      for (const idx of activeNodePath) {
        node = node.children[idx]
      }

      const isCollapsed = get().collapsedNodeIds.has(nodeId)
      if (node.children.length > 0 && !isCollapsed) {
        // Insert as first child
        const newRoot = updateNodeAtPath(currentDoc.root, activeNodePath, (parent) => ({
          ...parent,
          children: [newNode, ...parent.children],
        }))
        set({
          currentDoc: {
            ...currentDoc,
            root: newRoot,
            updatedAt: now,
          },
          selectedNodeId: newId,
          isDirty: true,
        })
        return newId
      }

      // Insert as sibling after the node
      const newRoot = insertSiblingAtPath(currentDoc.root, path, newNode)
      set({
        currentDoc: {
          ...currentDoc,
          root: newRoot,
          updatedAt: now,
        },
        selectedNodeId: newId,
        isDirty: true,
      })
      return newId
    },

    deleteNode: (nodeId) => {
      const { currentDoc, selectedNodeId } = get()
      if (!currentDoc || currentDoc.root.id === nodeId) return // Cannot delete root

      const path = findPath(currentDoc.root, nodeId)
      if (!path) return

      // Find the next node to focus before deleting this one
      const visibleNodes = getVisibleNodes(currentDoc.root, get().collapsedNodeIds)
      const currentIndex = visibleNodes.findIndex((n) => n.node.id === nodeId)
      let nextFocusId: string | null = null

      if (visibleNodes.length > 1) {
        if (currentIndex > 0) {
          // Select previous visible node
          nextFocusId = visibleNodes[currentIndex - 1].node.id
        } else if (currentIndex < visibleNodes.length - 1) {
          // Select next visible node
          nextFocusId = visibleNodes[currentIndex + 1].node.id
        } else {
          nextFocusId = currentDoc.root.id
        }
      } else {
        nextFocusId = currentDoc.root.id
      }

      const newRoot = deleteNodeAtPath(currentDoc.root, path)

      set({
        currentDoc: {
          ...currentDoc,
          root: newRoot,
          updatedAt: Date.now(),
        },
        selectedNodeId: selectedNodeId === nodeId ? nextFocusId : selectedNodeId,
        isDirty: true,
      })
    },

    toggleNodeCheck: (nodeId) => {
      const { currentDoc } = get()
      if (!currentDoc) return

      const path = findPath(currentDoc.root, nodeId)
      if (!path) return

      const newRoot = updateNodeAtPath(currentDoc.root, path, (node) => ({
        ...node,
        checked: node.checked !== undefined ? !node.checked : true,
        updatedAt: Date.now(),
      }))

      set({
        currentDoc: {
          ...currentDoc,
          root: newRoot,
          updatedAt: Date.now(),
        },
        isDirty: true,
      })
    },
  }
})
