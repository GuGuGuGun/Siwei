import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SearchPanel } from './SearchPanel'
import { useDocumentStore } from '../document/documentStore'
import { createDocument } from '../../test/fixtures'
import * as api from '../../services/siweiApi'

vi.mock('../../services/siweiApi', () => ({
  searchDocument: vi.fn(),
}))

const apiMock = vi.mocked(api)

describe('SearchPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useDocumentStore.setState({
      currentDoc: createDocument(),
      selectedNodeId: null,
      collapsedNodeIds: new Set<string>(),
      filter: { query: '', tag: null, checked: 'all' },
    })
  })

  it('renders text note and tag match sources', async () => {
    apiMock.searchDocument.mockResolvedValueOnce([
      {
        nodeId: 'node-2',
        text: '发布计划',
        path: ['根节点'],
        matchIndices: [[0, 2]],
        matchSources: ['text', 'note', 'tag'],
        matches: [
          { source: 'text', value: '发布计划', matchIndices: [[0, 2]] },
          { source: 'note', value: '备注包含发布窗口', matchIndices: [[4, 6]] },
          { source: 'tag', value: '发布', matchIndices: [[0, 2]] },
        ],
      },
    ])

    render(<SearchPanel isOpen onClose={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText('输入关键词进行搜索...'), {
      target: { value: '发布' },
    })

    await waitFor(() => expect(screen.getByText('正文命中')).toBeInTheDocument())
    expect(screen.getByText('备注命中')).toBeInTheDocument()
    expect(screen.getByText('标签命中')).toBeInTheDocument()
    expect(screen.getByText('#发布')).toBeInTheDocument()
  })
})
