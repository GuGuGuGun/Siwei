import type { MindMapLayoutEngine } from '../layoutEngine'
import { layoutGraph } from '../layoutGraph'
import { normalizeMindMapLayoutState } from '../mindMapLayoutState'
import { attachDirectionalEdgeHandles, createResult } from './shared'

export const classicDagreEngine: MindMapLayoutEngine = {
  layout(input) {
    const layouted = layoutGraph(input.graphData, {
      savedLayout: Object.fromEntries(
        Object.entries(normalizeMindMapLayoutState(input.persistedLayout)?.nodes ?? {})
          // 经典布局只保留用户锁定的手动节点，避免旧自动坐标阻止重新排版。
          .filter(([, state]) => state.locked)
          .map(([nodeId, state]) => [nodeId, state.position]),
      ),
      preserveSavedPositions: true,
      nodeSizes: input.nodeSizes,
    })

    return createResult(input, layouted.nodes, attachDirectionalEdgeHandles(layouted.edges, layouted.nodes, input.nodeSizes))
  },
}
