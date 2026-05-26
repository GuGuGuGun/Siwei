import { invoke } from '@tauri-apps/api/core'

import type { OutlineDocument, RecentDocItem, SearchResult } from '../types/document'

export function newDocument(): Promise<OutlineDocument> {
  return invoke('new_document')
}

export function saveDocument(path: string, doc: OutlineDocument): Promise<void> {
  return invoke('save_document', { path, doc })
}

export function loadDocument(path: string): Promise<OutlineDocument> {
  return invoke('load_document', { path })
}

export function exportMarkdown(path: string, doc: OutlineDocument): Promise<void> {
  return invoke('export_markdown', { path, doc })
}

export function importMarkdown(path: string): Promise<OutlineDocument> {
  return invoke('import_markdown', { path })
}

export function exportJson(path: string, doc: OutlineDocument): Promise<void> {
  return invoke('export_json', { path, doc })
}

export function importJson(path: string): Promise<OutlineDocument> {
  return invoke('import_json', { path })
}

export function getRecentDocs(): Promise<RecentDocItem[]> {
  return invoke('get_recent_docs')
}

export function addRecentDoc(item: RecentDocItem): Promise<void> {
  return invoke('add_recent_doc', { item })
}

export function removeRecentDoc(path: string): Promise<void> {
  return invoke('remove_recent_doc', { path })
}

export function openFileDialog(filters: string[]): Promise<string | null> {
  return invoke('open_file_dialog', { filters })
}

export function saveFileDialog(defaultName: string): Promise<string | null> {
  return invoke('save_file_dialog', { defaultName })
}

export function searchDocument(
  doc: OutlineDocument,
  query: string,
): Promise<SearchResult[]> {
  return invoke('search_document', { doc, query })
}
