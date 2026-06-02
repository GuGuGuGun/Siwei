import React from 'react'

import type { NodeOperationState } from '../document/documentStore'
import type { MindMapLayoutStrategy } from '../../types/document'
import type { MindMapLayoutDiagnostics } from './layoutEngine'
import { MindMapContextMenu, MindMapMenuAction } from './MindMapContextMenu'
import { MindMapDeleteDialog } from './MindMapDeleteDialog'
import { DEFAULT_MIND_MAP_LAYOUT_STRATEGY } from './mindMapLayoutState'
import { MindMapSearchBar } from './MindMapSearchBar'
import { MindMapMode, MindMapToolbar } from './MindMapToolbar'

interface MindMapContextMenuState {
  nodeId: string
  x: number
  y: number
}

interface MindMapOverlaysProps {
  exportClean: boolean
  mode: MindMapMode
  focused: boolean
  searchOpen: boolean
  experimentalLayoutEnabled: boolean
  layoutStrategy: MindMapLayoutStrategy
  forcePreviewActive: boolean
  feedback: string | null
  diagnosticsOpen: boolean
  layoutDiagnostics: MindMapLayoutDiagnostics | null
  searchQuery: string
  matchedNodeCount: number
  activeMatchIndex: number
  contextMenu: MindMapContextMenuState | null
  showContextMenu: boolean
  isContextNodeCollapsed: boolean
  contextNodeOperationState: NodeOperationState | null
  deleteMessage: string | null
  onModeChange: (mode: MindMapMode) => void
  onStrategyChange: (strategy: MindMapLayoutStrategy) => void
  onAutoLayout: () => void
  onForceDirectedPreview: () => void
  onToggleDiagnostics: () => void
  onToggleSearch: () => void
  onResetFocus: () => void
  onApplyForceDirectedPreview: () => void
  onCancelForceDirectedPreview: () => void
  onSearchQueryChange: (query: string) => void
  onPreviousSearchResult: () => void
  onNextSearchResult: () => void
  onCloseSearch: () => void
  onContextMenuAction: (action: MindMapMenuAction) => void
  onFocusContextBranch: () => void
  onRelayoutContextBranch?: () => void
  onUnlockContextNode?: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
}

export const MindMapOverlays: React.FC<MindMapOverlaysProps> = ({
  exportClean,
  mode,
  focused,
  searchOpen,
  experimentalLayoutEnabled,
  layoutStrategy,
  forcePreviewActive,
  feedback,
  diagnosticsOpen,
  layoutDiagnostics,
  searchQuery,
  matchedNodeCount,
  activeMatchIndex,
  contextMenu,
  showContextMenu,
  isContextNodeCollapsed,
  contextNodeOperationState,
  deleteMessage,
  onModeChange,
  onStrategyChange,
  onAutoLayout,
  onForceDirectedPreview,
  onToggleDiagnostics,
  onToggleSearch,
  onResetFocus,
  onApplyForceDirectedPreview,
  onCancelForceDirectedPreview,
  onSearchQueryChange,
  onPreviousSearchResult,
  onNextSearchResult,
  onCloseSearch,
  onContextMenuAction,
  onFocusContextBranch,
  onRelayoutContextBranch,
  onUnlockContextNode,
  onCancelDelete,
  onConfirmDelete,
}) => {
  return (
    <>
      {!exportClean && (
        <MindMapToolbar
          mode={mode}
          focused={focused}
          searchOpen={searchOpen}
          experimentalLayoutEnabled={experimentalLayoutEnabled}
          strategy={experimentalLayoutEnabled ? layoutStrategy : DEFAULT_MIND_MAP_LAYOUT_STRATEGY}
          onModeChange={onModeChange}
          onStrategyChange={onStrategyChange}
          onAutoLayout={onAutoLayout}
          onForceDirectedPreview={onForceDirectedPreview}
          onToggleDiagnostics={onToggleDiagnostics}
          onToggleSearch={onToggleSearch}
          onResetFocus={onResetFocus}
        />
      )}
      {forcePreviewActive && !exportClean && (
        <div className="absolute left-4 top-[4.75rem] z-10 flex items-center gap-2 rounded-md border border-amber-900/10 bg-[#FAF8F4]/95 p-2 shadow-fabric">
          <button
            type="button"
            aria-label="应用力导向布局"
            onClick={onApplyForceDirectedPreview}
            className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-800"
          >
            应用
          </button>
          <button
            type="button"
            aria-label="取消力导向预览"
            onClick={onCancelForceDirectedPreview}
            className="rounded-md border border-amber-900/10 px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-amber-50"
          >
            取消
          </button>
        </div>
      )}
      {feedback && !exportClean && (
        <div className={`absolute left-4 ${forcePreviewActive ? 'top-[7.5rem]' : 'top-[4.75rem]'} z-10 max-w-[calc(100%-2rem)] rounded-md border border-amber-900/10 bg-[#FAF8F4]/95 px-3 py-2 text-xs font-medium text-zinc-600 shadow-fabric`}>
          {feedback}
        </div>
      )}
      {diagnosticsOpen && layoutDiagnostics && !exportClean && (
        <div className="absolute right-4 top-4 z-10 w-64 rounded-md border border-amber-900/10 bg-[#FAF8F4]/95 p-3 text-xs text-zinc-600 shadow-fabric">
          <div className="mb-2 font-semibold text-zinc-800">布局诊断</div>
          <div>策略：{layoutDiagnostics.strategy}</div>
          <div>节点：{layoutDiagnostics.positionedCount}/{layoutDiagnostics.nodeCount}</div>
          <div>重叠：{layoutDiagnostics.overlapCount}</div>
          <div>越界：{layoutDiagnostics.outOfBoundsCount}</div>
          {layoutDiagnostics.fallbackReason && <div>回退：{layoutDiagnostics.fallbackReason}</div>}
        </div>
      )}
      {searchOpen && !exportClean && (
        <MindMapSearchBar
          query={searchQuery}
          matchCount={matchedNodeCount}
          activeIndex={Math.max(activeMatchIndex, 0)}
          onQueryChange={onSearchQueryChange}
          onPrevious={onPreviousSearchResult}
          onNext={onNextSearchResult}
          onClose={onCloseSearch}
        />
      )}
      {contextMenu && showContextMenu && contextNodeOperationState && (
        <MindMapContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          isCollapsed={isContextNodeCollapsed}
          operationState={contextNodeOperationState}
          onAction={onContextMenuAction}
          onFocusBranch={onFocusContextBranch}
          onRelayoutBranch={onRelayoutContextBranch}
          onUnlockNode={onUnlockContextNode}
        />
      )}
      {deleteMessage && (
        <MindMapDeleteDialog
          message={deleteMessage}
          onCancel={onCancelDelete}
          onConfirm={onConfirmDelete}
        />
      )}
    </>
  )
}
