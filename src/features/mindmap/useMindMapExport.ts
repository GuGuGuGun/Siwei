import React from 'react'
import { toPng } from 'html-to-image'
import { jsPDF } from 'jspdf'
import { toast } from '../../components/common/Toast'
import { exportMindMapAsset, saveFileDialog } from '../../services/siweiApi'
import type { MindMapExportFormat } from './MindMapExportMenu'

interface UseMindMapExportOptions {
  documentTitle: string
  getExportElement: () => HTMLElement | null
  hasExportableContent: () => boolean
}

export function useMindMapExport({
  documentTitle,
  getExportElement,
  hasExportableContent,
}: UseMindMapExportOptions) {
  const [status, setStatus] = React.useState<'idle' | 'exporting'>('idle')

  const exportMindMap = React.useCallback(async (format: MindMapExportFormat) => {
    if (status === 'exporting') return
    if (!hasExportableContent()) {
      toast.info('当前没有可导出的导图内容')
      return
    }

    const extension = format === 'png' ? 'png' : 'pdf'
    const targetPath = await saveFileDialog(`${sanitizeFileName(documentTitle || '未命名文档')}.${extension}`)
    if (!targetPath) return

    const element = getExportElement()
    if (!element) {
      toast.error('导出失败，请稍后重试')
      return
    }

    setStatus('exporting')
    try {
      const dataUrl = await toPng(element, {
        backgroundColor: '#FAF8F4',
        cacheBust: true,
        pixelRatio: 2,
        filter: (node) => {
          if (!(node instanceof HTMLElement)) return true
          return node.dataset.exportExclude !== 'true'
        },
      })
      const bytes = format === 'png'
        ? await dataUrlToBytes(dataUrl)
        : await imageDataUrlToPdfBytes(dataUrl, element)

      await exportMindMapAsset(targetPath, format, bytes)
      toast.success('导图已导出')
    } catch (error) {
      console.error('Mind map export failed:', error)
      toast.error('导出失败，请稍后重试')
    } finally {
      setStatus('idle')
    }
  }, [documentTitle, getExportElement, hasExportableContent, status])

  return { status, exportMindMap }
}

function sanitizeFileName(value: string): string {
  return value.replace(/[<>:"/\\|?*]/g, '_').trim() || '未命名文档'
}

async function dataUrlToBytes(dataUrl: string): Promise<number[]> {
  const response = await fetch(dataUrl)
  const buffer = await response.arrayBuffer()
  return [...new Uint8Array(buffer)]
}

async function imageDataUrlToPdfBytes(dataUrl: string, element: HTMLElement): Promise<number[]> {
  const width = Math.max(element.scrollWidth, element.clientWidth, 1)
  const height = Math.max(element.scrollHeight, element.clientHeight, 1)
  const pdf = new jsPDF({
    orientation: width >= height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [width, height],
  })
  pdf.addImage(dataUrl, 'PNG', 0, 0, width, height)
  const buffer = pdf.output('arraybuffer')
  return [...new Uint8Array(buffer)]
}
