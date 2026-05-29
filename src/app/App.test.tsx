import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { useDocumentStore } from '../features/document/documentStore'
import { useSettingsStore } from '../features/settings/settingsStore'
import { useWorkspaceStore } from './workspaceStore'
import { createDocument } from '../test/fixtures'

vi.mock('../services/siweiApi', () => ({
  newDocument: vi.fn(() => Promise.resolve(createDocument())),
  saveDocument: vi.fn(() => Promise.resolve()),
  loadDocument: vi.fn(),
  exportMarkdown: vi.fn(),
  importMarkdown: vi.fn(),
  exportJson: vi.fn(),
  importJson: vi.fn(),
  exportMindMapAsset: vi.fn(),
  getRecentDocs: vi.fn(() => Promise.resolve([])),
  addRecentDoc: vi.fn(() => Promise.resolve()),
  removeRecentDoc: vi.fn(() => Promise.resolve()),
  openFileDialog: vi.fn(() => Promise.resolve(null)),
  saveFileDialog: vi.fn(() => Promise.resolve(null)),
  searchDocument: vi.fn(() => Promise.resolve([])),
  getSettings: vi.fn(() => Promise.resolve({
    autoSaveEnabled: true,
    autoSaveIntervalMs: 1500,
    defaultViewMode: 'mindmap',
    sidebarCollapsed: false,
    agent: {
      enabled: false,
      provider: 'openai-compatible',
      model: 'gpt-4.1',
      baseUrl: 'https://api.openai.com/v1',
      thinkingLevel: 'medium',
      contextScope: 'currentDocument',
    },
  })),
  updateSettings: vi.fn((settings) => Promise.resolve(settings)),
  agentStartSession: vi.fn(),
  agentSendMessage: vi.fn(),
  agentAbort: vi.fn(),
  agentGetStatus: vi.fn(() => Promise.resolve({ available: false, running: false, streaming: false })),
  agentSaveApiKey: vi.fn(),
  agentDeleteApiKey: vi.fn(),
  getLibraryDocs: vi.fn(() => Promise.resolve([])),
  queryLibraryDocs: vi.fn(() => Promise.resolve({ items: [], hasMore: false, total: 0 })),
  addLibraryDoc: vi.fn(),
  removeLibraryDoc: vi.fn(),
  refreshLibraryDoc: vi.fn(),
  refreshLibrary: vi.fn(() => Promise.resolve([])),
  searchLibrary: vi.fn(() => Promise.resolve([])),
  queryLibrarySearch: vi.fn(() => Promise.resolve({ items: [], hasMore: false, total: 0 })),
  getLibraryTags: vi.fn(() => Promise.resolve([])),
  queryLibraryTags: vi.fn(() => Promise.resolve({ items: [], hasMore: false, total: 0 })),
  getLibraryTasks: vi.fn(() => Promise.resolve([])),
  queryLibraryTasks: vi.fn(() => Promise.resolve({ items: [], hasMore: false, total: 0 })),
  rebuildLibraryIndex: vi.fn(() => Promise.resolve([])),
  startLibraryRefresh: vi.fn(),
  getLibraryRefreshStatus: vi.fn(),
  cancelLibraryRefresh: vi.fn(),
  removeMissingLibraryDocs: vi.fn(() => Promise.resolve([])),
  toggleLibraryTask: vi.fn(),
}))

vi.mock('reactflow', async () => {
  const React = await import('react')
  return {
    __esModule: true,
    default: ({ children }: { children?: React.ReactNode }) => <div data-testid="react-flow">{children}</div>,
    Handle: () => <span />,
    Position: { Left: 'left', Right: 'right' },
    MiniMap: () => <div />,
    Controls: () => <div />,
    Background: () => <div />,
    useNodesState: () => [[], vi.fn(), vi.fn()],
    useEdgesState: () => [[], vi.fn(), vi.fn()],
  }
})

describe('App', () => {
  beforeEach(() => {
    useDocumentStore.setState({
      currentDoc: createDocument(),
      viewMode: 'mindmap',
      selectedNodeId: null,
      collapsedNodeIds: new Set<string>(),
      isDirty: false,
      saveStatus: 'idle',
      currentFilePath: null,
      filter: { query: '', tag: null, checked: 'all' },
      focusedNodeId: null,
      focusRequestSeq: 0,
      canUndo: false,
      canRedo: false,
      undoStack: [],
      redoStack: [],
      cleanSnapshotKey: null,
      activeTextEditSession: null,
    })
    useWorkspaceStore.setState({ activeView: 'editor' })
    useSettingsStore.setState({
      settings: {
        autoSaveEnabled: true,
        autoSaveIntervalMs: 1500,
        defaultViewMode: 'mindmap',
        sidebarCollapsed: false,
        agent: {
          enabled: false,
          provider: 'openai-compatible',
          model: 'gpt-4.1',
          baseUrl: 'https://api.openai.com/v1',
          thinkingLevel: 'medium',
          contextScope: 'currentDocument',
        },
      },
      isLoaded: true,
      isSaving: false,
      error: null,
    })
  })

  it('merges mind map png and pdf export into the document export dialog', async () => {
    render(<App />)

    await waitFor(() => expect(screen.getByTitle('导出')).toBeInTheDocument())
    await act(async () => {
      fireEvent.click(screen.getByTitle('导出'))
    })

    expect(screen.getByRole('dialog', { name: '导出文档' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /导出 JSON 备份/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /导出 Markdown/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /导出导图图片/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /导出导图 PDF/ })).toBeInTheDocument()
  })
})
