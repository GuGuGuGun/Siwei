import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDocument } from '../../test/fixtures'
import { useDocumentStore } from '../document/documentStore'
import { OutlineNodeItem } from './OutlineNodeItem'

describe('OutlineNodeItem', () => {
  beforeEach(() => {
    useDocumentStore.setState({
      currentDoc: createDocument(),
      viewMode: 'outline',
      selectedNodeId: 'node-2',
      collapsedNodeIds: new Set<string>(),
      isDirty: false,
      saveStatus: 'idle',
      currentFilePath: null,
      filter: { query: '', tag: null, checked: 'all' },
      focusedNodeId: null,
      canUndo: false,
      canRedo: false,
      undoStack: [],
      redoStack: [],
      cleanSnapshotKey: null,
      activeTextEditSession: null,
    })
  })

  it('keeps the note editor popover outside the clipped action toolbar', () => {
    const node = createDocument().root.children[1]

    render(
      <OutlineNodeItem
        node={node}
        depth={0}
        path={[1]}
        parentId="root"
        isSelected
        isCollapsed={false}
        onNavigate={() => undefined}
      />,
    )

    fireEvent.click(screen.getByTitle('添加备注'))

    const textarea = screen.getByPlaceholderText('记录补充说明')
    const toolbar = textarea.closest('[data-node-actions]')

    expect(toolbar).toBeInTheDocument()
    expect(toolbar).not.toHaveClass('overflow-hidden')
  })
})
