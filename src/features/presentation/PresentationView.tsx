import React from 'react'
import ReactFlow, { Background, Controls, MiniMap, type Edge, type Node, type NodeProps } from 'reactflow'
import { ChevronLeft, ChevronRight, Fullscreen, LogOut, Network, Rows3 } from 'lucide-react'
import type { OutlineDocument, OutlineNode } from '../../types/document'
import type { ViewMode } from '../document/documentStore'
import { OutlineInlineContent } from '../outline/OutlineInlineContent'
import { outlineToGraph } from '../mindmap/outlineToGraph'
import { layoutGraph } from '../mindmap/layoutGraph'
import {
  collectPresentationNodeMeta,
  createVisibleNodeIdSet,
  getMaxRevealDepth,
} from './presentationReveal'

type PresentationMode = 'outline' | 'mindmap'

interface PresentationViewProps {
  currentDoc: OutlineDocument
  initialViewMode: ViewMode
  onExit: () => void
}

interface PresentationNodeData {
  label: string
  depth: number
  childCount: number
  checked?: boolean
}

const nodeTypes = {
  presentation: PresentationMindMapNode,
}

export const PresentationView: React.FC<PresentationViewProps> = ({
  currentDoc,
  initialViewMode,
  onExit,
}) => {
  const [mode, setMode] = React.useState<PresentationMode>(
    initialViewMode === 'outline' ? 'outline' : 'mindmap',
  )
  const maxRevealDepth = React.useMemo(() => getMaxRevealDepth(currentDoc.root), [currentDoc.root])
  const [revealDepth, setRevealDepth] = React.useState(Math.min(1, maxRevealDepth))
  const visibleNodeIds = React.useMemo(
    () => createVisibleNodeIdSet(currentDoc.root, revealDepth),
    [currentDoc.root, revealDepth],
  )
  const canStepBackward = revealDepth > 0
  const canStepForward = revealDepth < maxRevealDepth

  const stepForward = React.useCallback(() => {
    setRevealDepth((depth) => Math.min(maxRevealDepth, depth + 1))
  }, [maxRevealDepth])

  const stepBackward = React.useCallback(() => {
    setRevealDepth((depth) => Math.max(0, depth - 1))
  }, [])

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return
      if (event.key === 'Escape') {
        onExit()
        return
      }
      if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
        event.preventDefault()
        stepForward()
      }
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault()
        stepBackward()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onExit, stepBackward, stepForward])

  const enterFullscreen = () => {
    const target = document.documentElement
    if (!document.fullscreenElement && target.requestFullscreen) {
      void target.requestFullscreen()
    }
  }

  return (
    <section
      role="dialog"
      aria-label="演示模式"
      className="fixed inset-0 z-50 flex flex-col bg-[#FAF8F4] text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100"
    >
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-amber-900/10 bg-white/70 px-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/70">
        <div className="min-w-0 truncate text-sm font-semibold">{currentDoc.title || '未命名文档'}</div>
        <div className="flex items-center gap-1.5">
          <ModeButton active={mode === 'outline'} label="大纲" icon={Rows3} onClick={() => setMode('outline')} />
          <ModeButton active={mode === 'mindmap'} label="导图" icon={Network} onClick={() => setMode('mindmap')} />
          <div className="mx-1 h-4 w-px bg-zinc-200 dark:bg-zinc-700" />
          <IconButton label="上一步" disabled={!canStepBackward} onClick={stepBackward}>
            <ChevronLeft size={15} />
          </IconButton>
          <button
            type="button"
            aria-label="下一步"
            disabled={!canStepForward}
            onClick={stepForward}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-zinc-900 px-3 text-xs font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          >
            下一步
            <ChevronRight size={14} />
          </button>
          <IconButton label="全屏展示" onClick={enterFullscreen}>
            <Fullscreen size={15} />
          </IconButton>
          <IconButton label="退出演示" onClick={onExit}>
            <LogOut size={15} />
          </IconButton>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden">
        {mode === 'outline' ? (
          <PresentationOutline root={currentDoc.root} visibleNodeIds={visibleNodeIds} />
        ) : (
          <PresentationMindMap root={currentDoc.root} visibleNodeIds={visibleNodeIds} />
        )}
      </main>
    </section>
  )
}

const PresentationOutline: React.FC<{
  root: OutlineNode
  visibleNodeIds: Set<string>
}> = ({ root, visibleNodeIds }) => (
  <div className="h-full overflow-y-auto px-10 py-8">
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-8 border-b border-dashed border-amber-900/20 pb-4 text-3xl font-bold">
        <OutlineInlineContent text={root.text} />
      </h1>
      <div className="space-y-2">
        {root.children.map((child) => (
          <PresentationOutlineNode
            key={child.id}
            node={child}
            depth={0}
            visibleNodeIds={visibleNodeIds}
          />
        ))}
      </div>
    </div>
  </div>
)

const PresentationOutlineNode: React.FC<{
  node: OutlineNode
  depth: number
  visibleNodeIds: Set<string>
}> = ({ node, depth, visibleNodeIds }) => {
  if (!visibleNodeIds.has(node.id)) return null

  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 duration-200" style={{ marginLeft: depth * 24 }}>
      <div className="rounded-lg border border-amber-900/10 bg-white/70 px-3 py-2 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
        <div className="text-sm font-medium leading-relaxed">
          {node.checked !== undefined && (
            <span className="mr-2 font-mono text-xs text-emerald-700">{node.checked ? '[x]' : '[ ]'}</span>
          )}
          <OutlineInlineContent text={node.text || '空白节点'} />
        </div>
        {node.note?.trim() && (
          <div className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-zinc-500">{node.note}</div>
        )}
      </div>
      <div className="mt-2 space-y-2">
        {node.children.map((child) => (
          <PresentationOutlineNode
            key={child.id}
            node={child}
            depth={depth + 1}
            visibleNodeIds={visibleNodeIds}
          />
        ))}
      </div>
    </div>
  )
}

const PresentationMindMap: React.FC<{
  root: OutlineNode
  visibleNodeIds: Set<string>
}> = ({ root, visibleNodeIds }) => {
  const { nodes, edges } = React.useMemo(() => {
    const metaByNodeId = collectPresentationNodeMeta(root)
    const graph = layoutGraph(outlineToGraph(root, new Set(), visibleNodeIds))
    return {
      nodes: graph.nodes.map((node): Node<PresentationNodeData> => {
        const meta = metaByNodeId.get(node.id) ?? { depth: 0, childCount: 0 }
        return {
          ...node,
          type: 'presentation',
          data: {
            label: String(node.data?.label ?? ''),
            depth: meta.depth,
            childCount: meta.childCount,
            checked: findNodeById(root, node.id)?.checked,
          },
        }
      }),
      edges: graph.edges as Edge[],
    }
  }, [root, visibleNodeIds])

  return (
    <div className="h-full w-full" data-renderer="reactflow">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        className="text-zinc-700"
      >
        <Controls className="!bg-[#FAF8F4] !border-amber-900/10 !shadow-fabric" />
        <MiniMap
          position="bottom-right"
          nodeColor="#FAF6EC"
          nodeStrokeColor="rgba(139, 90, 43, 0.18)"
          maskColor="rgba(240, 235, 220, 0.24)"
          className="opacity-70"
        />
        <Background color="#EFECE3" gap={16} size={1} />
      </ReactFlow>
    </div>
  )
}

function PresentationMindMapNode({ data }: NodeProps<PresentationNodeData>) {
  const visualDepth = Math.min(data.depth, 3)
  return (
    <div className="min-w-[170px] max-w-[240px] rounded-xl border-2 border-dashed border-amber-900/20 bg-[#FAF6EC] px-3 py-2 text-center shadow-fabric">
      <div className={`${visualDepth === 0 ? 'text-sm font-bold' : 'text-xs font-semibold'} leading-relaxed text-zinc-800`}>
        {data.checked !== undefined && (
          <span className="mr-1 font-mono text-[10px] text-emerald-700">{data.checked ? '[x]' : '[ ]'}</span>
        )}
        <OutlineInlineContent text={data.label || '空白节点'} />
      </div>
      {data.childCount > 0 && (
        <div className="mt-1 text-[10px] font-medium text-amber-900/50">{data.childCount} 个子节点</div>
      )}
    </div>
  )
}

const ModeButton: React.FC<{
  active: boolean
  label: string
  icon: typeof Rows3
  onClick: () => void
}> = ({ active, label, icon: Icon, onClick }) => (
  <button
    type="button"
    aria-label={label}
    onClick={onClick}
    className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition ${
      active
        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
        : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'
    }`}
  >
    <Icon size={14} />
    {label}
  </button>
)

const IconButton: React.FC<{
  label: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}> = ({ label, disabled = false, onClick, children }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    disabled={disabled}
    onClick={onClick}
    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-35 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
  >
    {children}
  </button>
)

function findNodeById(root: OutlineNode, nodeId: string): OutlineNode | null {
  if (root.id === nodeId) return root
  for (const child of root.children) {
    const match = findNodeById(child, nodeId)
    if (match) return match
  }
  return null
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tagName = target.tagName.toLowerCase()
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable
}
