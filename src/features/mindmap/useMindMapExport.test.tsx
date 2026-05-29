import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useToastStore } from '../../components/common/Toast'
import { exportMindMapAsset, saveFileDialog } from '../../services/siweiApi'
import { useMindMapExport } from './useMindMapExport'

vi.mock('html-to-image', () => ({
  toPng: vi.fn(() => Promise.resolve('data:image/png;base64,AQID')),
}))

vi.mock('jspdf', () => ({
  jsPDF: vi.fn().mockImplementation(() => ({
    addImage: vi.fn(),
    output: vi.fn(() => new Uint8Array([9, 8, 7]).buffer),
  })),
}))

vi.mock('../../services/siweiApi', () => ({
  exportMindMapAsset: vi.fn(),
  saveFileDialog: vi.fn(),
}))

const exportMindMapAssetMock = vi.mocked(exportMindMapAsset)
const saveFileDialogMock = vi.mocked(saveFileDialog)

describe('useMindMapExport', () => {
  let element: HTMLDivElement

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    useToastStore.setState({ toasts: [] })
    saveFileDialogMock.mockResolvedValue('C:\\demo\\导图.png')
    exportMindMapAssetMock.mockResolvedValue(undefined)
    element = document.createElement('div')
    Object.defineProperty(element, 'clientWidth', { configurable: true, value: 640 })
    Object.defineProperty(element, 'clientHeight', { configurable: true, value: 360 })
    Object.defineProperty(element, 'scrollWidth', { configurable: true, value: 640 })
    Object.defineProperty(element, 'scrollHeight', { configurable: true, value: 360 })
    document.body.appendChild(element)
    globalThis.fetch = vi.fn(() => Promise.resolve({
      arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
    } as Response))
  })

  it('shows an info toast when the mind map has no exportable content', async () => {
    const { result } = renderHook(() => useMindMapExport({
      documentTitle: '空导图',
      getExportElement: () => element,
      hasExportableContent: () => false,
    }))

    await act(async () => {
      await result.current.exportMindMap('png')
    })

    expect(saveFileDialogMock).not.toHaveBeenCalled()
    expect(useToastStore.getState().toasts[0]).toMatchObject({
      message: '当前没有可导出的导图内容',
      type: 'info',
    })
  })

  it('does nothing when the save dialog is cancelled', async () => {
    saveFileDialogMock.mockResolvedValueOnce(null)
    const { result } = renderHook(() => useMindMapExport({
      documentTitle: '测试导图',
      getExportElement: () => element,
      hasExportableContent: () => true,
    }))

    await act(async () => {
      await result.current.exportMindMap('png')
    })

    expect(exportMindMapAssetMock).not.toHaveBeenCalled()
    expect(useToastStore.getState().toasts).toEqual([])
  })

  it('exports generated png bytes through the Tauri wrapper', async () => {
    const { result } = renderHook(() => useMindMapExport({
      documentTitle: '测试:导图',
      getExportElement: () => element,
      hasExportableContent: () => true,
    }))

    await act(async () => {
      await result.current.exportMindMap('png')
    })

    expect(saveFileDialogMock).toHaveBeenCalledWith('测试_导图.png')
    expect(exportMindMapAssetMock).toHaveBeenCalledWith('C:\\demo\\导图.png', 'png', [1, 2, 3])
    expect(useToastStore.getState().toasts[0]).toMatchObject({
      message: '导图已导出',
      type: 'success',
    })
  })

  it('exports pdf bytes created from the clean png image', async () => {
    saveFileDialogMock.mockResolvedValueOnce('C:\\demo\\导图.pdf')
    const { result } = renderHook(() => useMindMapExport({
      documentTitle: '测试导图',
      getExportElement: () => element,
      hasExportableContent: () => true,
    }))

    await act(async () => {
      await result.current.exportMindMap('pdf')
    })

    expect(saveFileDialogMock).toHaveBeenCalledWith('测试导图.pdf')
    expect(exportMindMapAssetMock).toHaveBeenCalledWith('C:\\demo\\导图.pdf', 'pdf', [9, 8, 7])
  })

  it('reports generation failures and resets the export status', async () => {
    const { toPng } = await import('html-to-image')
    vi.mocked(toPng).mockRejectedValueOnce(new Error('render failed'))
    const { result } = renderHook(() => useMindMapExport({
      documentTitle: '测试导图',
      getExportElement: () => element,
      hasExportableContent: () => true,
    }))

    await act(async () => {
      await result.current.exportMindMap('png')
    })

    await waitFor(() => expect(result.current.status).toBe('idle'))
    expect(exportMindMapAssetMock).not.toHaveBeenCalled()
    expect(useToastStore.getState().toasts[0]).toMatchObject({
      message: '导出失败，请稍后重试',
      type: 'error',
    })
  })

  it('reports backend write failures and resets the export status', async () => {
    exportMindMapAssetMock.mockRejectedValueOnce(new Error('write failed'))
    const { result } = renderHook(() => useMindMapExport({
      documentTitle: '测试导图',
      getExportElement: () => element,
      hasExportableContent: () => true,
    }))

    await act(async () => {
      await result.current.exportMindMap('png')
    })

    await waitFor(() => expect(result.current.status).toBe('idle'))
    expect(useToastStore.getState().toasts[0]).toMatchObject({
      message: '导出失败，请稍后重试',
      type: 'error',
    })
  })
})
