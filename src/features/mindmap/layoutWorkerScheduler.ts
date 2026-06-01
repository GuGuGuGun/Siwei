import type { MindMapLayoutInput, MindMapLayoutResult } from './layoutEngine'
import { layoutMindMap } from './layoutEngine'

interface LayoutWorkerSchedulerOptions {
  workerEnabled: boolean
  timeoutMs: number
  runInWorker?: (input: MindMapLayoutInput) => Promise<MindMapLayoutResult>
}

export async function layoutMindMapWithWorkerFallback(
  input: MindMapLayoutInput,
  options: LayoutWorkerSchedulerOptions,
): Promise<MindMapLayoutResult> {
  if (!options.workerEnabled || !options.runInWorker) {
    return withWorkerDiagnostic(layoutMindMap(input), false, undefined)
  }

  const startedAt = now()
  try {
    const result = await withTimeout(options.runInWorker(input), options.timeoutMs)
    return withWorkerDiagnostic(result, true, undefined, now() - startedAt)
  } catch (error) {
    const fallbackReason = error instanceof Error ? error.message : String(error)
    return withWorkerDiagnostic(layoutMindMap(input), false, fallbackReason)
  }
}

function withWorkerDiagnostic(
  result: MindMapLayoutResult,
  workerEnabled: boolean,
  workerFallbackReason?: string,
  workerDurationMs?: number,
): MindMapLayoutResult {
  return {
    ...result,
    diagnostics: result.diagnostics
      ? {
        ...result.diagnostics,
        workerEnabled,
        workerDurationMs,
        workerFallbackReason,
      }
      : result.diagnostics,
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error('worker timeout'))
    }, timeoutMs)

    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        window.clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}
