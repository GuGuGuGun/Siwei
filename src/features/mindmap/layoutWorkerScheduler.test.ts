import { describe, expect, it, vi } from 'vitest'
import { createNode } from '../../test/fixtures'
import { outlineToGraph } from './outlineToGraph'
import { layoutMindMapWithWorkerFallback } from './layoutWorkerScheduler'

describe('layoutMindMapWithWorkerFallback', () => {
  const root = createNode('root', 'Root', [
    createNode('a', 'A'),
  ])

  const input = {
    root,
    graphData: outlineToGraph(root, new Set()),
    collapsedNodeIds: new Set<string>(),
    strategy: 'classic-dagre' as const,
    nodeSizes: {},
    mode: 'persistent' as const,
  }

  it('uses the worker result when the worker finishes successfully', async () => {
    const workerLayout = await layoutMindMapWithWorkerFallback(input, {
      workerEnabled: true,
      timeoutMs: 50,
      runInWorker: async () => ({
        nodes: [],
        edges: [],
        diagnostics: {
          strategy: 'classic-dagre',
          durationMs: 1,
          nodeCount: 0,
          positionedCount: 0,
          missingPositionCount: 0,
          lockedCount: 0,
          overlapCount: 0,
          outOfBoundsCount: 0,
        },
      }),
    })

    expect(workerLayout.nodes).toEqual([])
    expect(workerLayout.diagnostics).toMatchObject({
      workerEnabled: true,
    })
  })

  it('falls back to the main thread when the worker fails', async () => {
    const result = await layoutMindMapWithWorkerFallback(input, {
      workerEnabled: true,
      timeoutMs: 50,
      runInWorker: async () => {
        throw new Error('worker crashed')
      },
    })

    expect(result.nodes).toHaveLength(2)
    expect(result.diagnostics).toMatchObject({
      workerEnabled: false,
      workerFallbackReason: 'worker crashed',
    })
  })

  it('falls back to the main thread when the worker times out', async () => {
    vi.useFakeTimers()
    const promise = layoutMindMapWithWorkerFallback(input, {
      workerEnabled: true,
      timeoutMs: 10,
      runInWorker: () => new Promise(() => undefined),
    })

    vi.advanceTimersByTime(10)
    const result = await promise
    vi.useRealTimers()

    expect(result.nodes).toHaveLength(2)
    expect(result.diagnostics?.workerFallbackReason).toBe('worker timeout')
  })
})
