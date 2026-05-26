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

interface HistorySnapshot {
  currentDoc: OutlineDocument
  selectedNodeId: string | null
  collapsedNodeIds: string[]
  key: string
}

interface TextEditSession {
  nodeId: string
  before: HistorySnapshot
  didChange: boolean
}

interface DocumentState {
  currentDoc: OutlineDocument | null
  viewMode: ViewMode
  selectedNodeId: string | null
  collapsedNodeIds: Set<string>
  isDirty: boolean
  saveStatus: SaveStatus
  currentFilePath: string | null
  canUndo: boolean
  canRedo: boolean
  undoStack: HistorySnapshot[]
  redoStack: HistorySnapshot[]
  cleanSnapshotKey: string | null
  activeTextEditSession: TextEditSession | null

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

  // History actions
  undo: () => void
  redo: () => void
  beginTextEditSession: (nodeId: string) => void
  commitTextEditSession: (nodeId: string) => void
}

export const useDocumentStore = create<DocumentState>((set, get) => {
  const cloneDocument = (doc: OutlineDocument): OutlineDocument => JSON.parse(JSON.stringify(doc)) as OutlineDocument

  const createSnapshot = (
    currentDoc: OutlineDocument,
    selectedNodeId: string | null,
    collapsedNodeIds: Set<string>,
  ): HistorySnapshot => {
    const collapsedIds = [...collapsedNodeIds].sort()
    const doc = cloneDocument(currentDoc)
    const key = JSON.stringify({
      currentDoc: doc,
      selectedNodeId,
      collapsedNodeIds: collapsedIds,
    })

    return {
      currentDoc: doc,
      selectedNodeId,
      collapsedNodeIds: collapsedIds,
      key,
    }
  }

  const getCurrentSnapshot = (): HistorySnapshot | null => {
    const { currentDoc, selectedNodeId, collapsedNodeIds } = get()
    if (!currentDoc) return null

    return createSnapshot(currentDoc, selectedNodeId, collapsedNodeIds)
  }

  const restoreSnapshot = (
    snapshot: HistorySnapshot,
    undoStack: HistorySnapshot[],
    redoStack: HistorySnapshot[],
  ) => {
    const { cleanSnapshotKey } = get()
    set({
      currentDoc: cloneDocument(snapshot.currentDoc),
      selectedNodeId: snapshot.selectedNodeId,
      collapsedNodeIds: new Set(snapshot.collapsedNodeIds),
      undoStack,
      redoStack,
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
      activeTextEditSession: null,
      isDirty: cleanSnapshotKey === null ? true : snapshot.key !== cleanSnapshotKey,
    })
  }

  const setHistoryAfterMutation = (before: HistorySnapshot) => {
    const after = getCurrentSnapshot()
    if (!after || after.key === before.key) return

    set((state) => ({
      undoStack: [...state.undoStack, before],
      redoStack: [],
      canUndo: true,
      canRedo: false,
      isDirty: state.cleanSnapshotKey === null ? true : after.key !== state.cleanSnapshotKey,
    }))
  }

  const clearHistoryState = (
    doc: OutlineDocument,
    selectedNodeId: string | null,
    collapsedNodeIds: Set<string>,
    options: { isDirty: boolean },
  ) => {
    const snapshot = createSnapshot(doc, selectedNodeId, collapsedNodeIds)

    return {
      undoStack: [],
      redoStack: [],
      canUndo: false,
      canRedo: false,
      activeTextEditSession: null,
      cleanSnapshotKey: options.isDirty ? null : snapshot.key,
    }
  }

  const finalizeActiveTextEditSession = () => {
    const session = get().activeTextEditSession
    if (!session) return

    const after = getCurrentSnapshot()
    if (!after || !session.didChange || after.key === session.before.key) {
      set((state) => ({
        activeTextEditSession: null,
        canUndo: state.undoStack.length > 0,
      }))
      return
    }

    set((state) => ({
      undoStack: [...state.undoStack, session.before],
      redoStack: [],
      activeTextEditSession: null,
      canUndo: true,
      canRedo: false,
      isDirty: state.cleanSnapshotKey === null ? true : after.key !== state.cleanSnapshotKey,
    }))
  }

  const beginMutation = (): HistorySnapshot | null => {
    finalizeActiveTextEditSession()
    return getCurrentSnapshot()
  }

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
    canUndo: false,
    canRedo: false,
    undoStack: [],
    redoStack: [],
    cleanSnapshotKey: null,
    activeTextEditSession: null,

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
          ...clearHistoryState(doc, firstNodeId, collapsedIds, { isDirty: false }),
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
          ...clearHistoryState(doc, firstNodeId, collapsedIds, { isDirty: false }),
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
          const cleanSnapshot = createSnapshot(updatedDoc, latestState.selectedNodeId, latestState.collapsedNodeIds)

          if (latestState.currentDoc !== state.currentDoc) {
            const latestSnapshot = latestState.currentDoc
              ? createSnapshot(latestState.currentDoc, latestState.selectedNodeId, latestState.collapsedNodeIds)
              : null

            return {
              currentFilePath: path,
              cleanSnapshotKey: cleanSnapshot.key,
              isDirty: latestSnapshot ? latestSnapshot.key !== cleanSnapshot.key : true,
              saveStatus: 'saved',
            }
          }

          return {
            currentDoc: updatedDoc,
            currentFilePath: path,
            cleanSnapshotKey: cleanSnapshot.key,
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
          ...clearHistoryState(doc, doc.root.children.length > 0 ? doc.root.children[0].id : doc.root.id, collapsedIds, {
            isDirty: true,
          }),
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
      const activeSession = get().activeTextEditSession
      const shouldRecordImmediately = activeSession?.nodeId !== nodeId
      const before = shouldRecordImmediately ? beginMutation() : null

      const now = Date.now()

      // If updating the root node (document title)
      if (currentDoc.root.id === nodeId) {
        if (currentDoc.root.text === text && currentDoc.title === text) return

        const updatedDoc = {
          ...currentDoc,
          title: text,
          updatedAt: now,
          root: {
            ...currentDoc.root,
            text: text,
            updatedAt: now,
          },
        }
        set((state) => ({
          currentDoc: updatedDoc,
          isDirty: state.cleanSnapshotKey === null
            ? true
            : createSnapshot(updatedDoc, state.selectedNodeId, state.collapsedNodeIds).key !== state.cleanSnapshotKey,
          activeTextEditSession: state.activeTextEditSession?.nodeId === nodeId
            ? { ...state.activeTextEditSession, didChange: true }
            : state.activeTextEditSession,
          canUndo: state.activeTextEditSession?.nodeId === nodeId ? true : state.canUndo,
          canRedo: state.activeTextEditSession?.nodeId === nodeId ? false : state.canRedo,
        }))
        if (before) setHistoryAfterMutation(before)
        return
      }

      const path = findPath(currentDoc.root, nodeId)
      if (!path) return

      let currentNode: OutlineNode = currentDoc.root
      for (const idx of path) {
        currentNode = currentNode.children[idx]
      }
      if (currentNode.text === text) return

      const newRoot = updateNodeAtPath(currentDoc.root, path, (node) => ({
        ...node,
        text,
        updatedAt: now,
      }))

      const updatedDoc = {
        ...currentDoc,
        root: newRoot,
        updatedAt: now,
      }

      set((state) => ({
        currentDoc: updatedDoc,
        isDirty: state.cleanSnapshotKey === null
          ? true
          : createSnapshot(updatedDoc, state.selectedNodeId, state.collapsedNodeIds).key !== state.cleanSnapshotKey,
        activeTextEditSession: state.activeTextEditSession?.nodeId === nodeId
          ? { ...state.activeTextEditSession, didChange: true }
          : state.activeTextEditSession,
        canUndo: state.activeTextEditSession?.nodeId === nodeId ? true : state.canUndo,
        canRedo: state.activeTextEditSession?.nodeId === nodeId ? false : state.canRedo,
      }))
      if (before) setHistoryAfterMutation(before)
    },

    toggleCollapse: (nodeId) => {
      const before = beginMutation()
      if (!before) return

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
      setHistoryAfterMutation(before)
    },

    indentNode: (nodeId) => {
      const before = beginMutation()
      const { currentDoc } = get()
      if (!currentDoc || !before) return

      const path = findPath(currentDoc.root, nodeId)
      if (!path) return

      const newRoot = indentNodeAtPath(currentDoc.root, path)
      if (newRoot === currentDoc.root) return

      set({
        currentDoc: {
          ...currentDoc,
          root: newRoot,
          updatedAt: Date.now(),
        },
        isDirty: true,
      })
      setHistoryAfterMutation(before)
    },

    outdentNode: (nodeId) => {
      const before = beginMutation()
      const { currentDoc } = get()
      if (!currentDoc || !before) return

      const path = findPath(currentDoc.root, nodeId)
      if (!path) return

      const newRoot = outdentNodeAtPath(currentDoc.root, path)
      if (newRoot === currentDoc.root) return

      set({
        currentDoc: {
          ...currentDoc,
          root: newRoot,
          updatedAt: Date.now(),
        },
        isDirty: true,
      })
      setHistoryAfterMutation(before)
    },

    moveNode: (nodeId, direction) => {
      const before = beginMutation()
      const { currentDoc } = get()
      if (!currentDoc || !before) return

      const path = findPath(currentDoc.root, nodeId)
      if (!path) return

      const newRoot =
        direction === 'up'
          ? moveNodeUpAtPath(currentDoc.root, path)
          : moveNodeDownAtPath(currentDoc.root, path)
      if (newRoot === currentDoc.root) return

      set({
        currentDoc: {
          ...currentDoc,
          root: newRoot,
          updatedAt: Date.now(),
        },
        isDirty: true,
      })
      setHistoryAfterMutation(before)
    },

    insertNode: (nodeId, text = '') => {
      const before = beginMutation()
      const { currentDoc } = get()
      if (!currentDoc || !before) return null

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
        setHistoryAfterMutation(before)
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
        setHistoryAfterMutation(before)
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
      setHistoryAfterMutation(before)
      return newId
    },

    deleteNode: (nodeId) => {
      const before = beginMutation()
      const { currentDoc, selectedNodeId } = get()
      if (!currentDoc || !before || currentDoc.root.id === nodeId) return // Cannot delete root

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
      setHistoryAfterMutation(before)
    },

    toggleNodeCheck: (nodeId) => {
      const before = beginMutation()
      const { currentDoc } = get()
      if (!currentDoc || !before) return

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
      setHistoryAfterMutation(before)
    },

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
})
