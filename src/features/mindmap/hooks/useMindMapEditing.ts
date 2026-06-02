import React from 'react'

interface MindMapEditingState {
  nodeId: string
}

interface MindMapEditingOptions {
  selectNode: (nodeId: string | null) => void
  beginTextEditSession: (nodeId: string) => void
  commitTextEditSession: (nodeId: string) => void
}

export function useMindMapEditing({
  selectNode,
  beginTextEditSession,
  commitTextEditSession,
}: MindMapEditingOptions) {
  const [editing, setEditing] = React.useState<MindMapEditingState | null>(null)

  const startEditing = React.useCallback((nodeId: string) => {
    selectNode(nodeId)
    beginTextEditSession(nodeId)
    setEditing({ nodeId })
  }, [beginTextEditSession, selectNode])

  const finishEditing = React.useCallback((nodeId: string) => {
    commitTextEditSession(nodeId)
    setEditing((state) => (state?.nodeId === nodeId ? null : state))
  }, [commitTextEditSession])

  const cancelEditing = React.useCallback(() => {
    if (editing) {
      commitTextEditSession(editing.nodeId)
    }
    setEditing(null)
  }, [commitTextEditSession, editing])

  const clearEditing = React.useCallback(() => {
    setEditing(null)
  }, [])

  return {
    editing,
    setEditing,
    startEditing,
    finishEditing,
    cancelEditing,
    clearEditing,
  }
}
