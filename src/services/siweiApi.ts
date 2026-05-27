import { invoke } from '@tauri-apps/api/core'

import type { OutlineDocument, RecentDocItem, SearchResult } from '../types/document'
import type {
  LibraryDocumentItem,
  LibrarySearchResult,
  LibraryTagSummary,
  LibraryTaskSummary,
} from '../types/library'
import { browserInvokeFallback } from './browserInvokeFallback'

function callCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if ('__TAURI_INTERNALS__' in window) {
    return invoke<T>(command, args)
  }

  return browserInvokeFallback<T>(command, args)
}

export function newDocument(): Promise<OutlineDocument> {
  return callCommand('new_document')
}

export function saveDocument(path: string, doc: OutlineDocument): Promise<void> {
  return callCommand('save_document', { path, doc })
}

export function loadDocument(path: string): Promise<OutlineDocument> {
  return callCommand('load_document', { path })
}

export function exportMarkdown(path: string, doc: OutlineDocument): Promise<void> {
  return callCommand('export_markdown', { path, doc })
}

export function importMarkdown(path: string): Promise<OutlineDocument> {
  return callCommand('import_markdown', { path })
}

export function exportJson(path: string, doc: OutlineDocument): Promise<void> {
  return callCommand('export_json', { path, doc })
}

export function importJson(path: string): Promise<OutlineDocument> {
  return callCommand('import_json', { path })
}

export function getRecentDocs(): Promise<RecentDocItem[]> {
  return callCommand('get_recent_docs')
}

export function addRecentDoc(item: RecentDocItem): Promise<void> {
  return callCommand('add_recent_doc', { item })
}

export function removeRecentDoc(path: string): Promise<void> {
  return callCommand('remove_recent_doc', { path })
}

export function openFileDialog(filters: string[]): Promise<string | null> {
  return callCommand('open_file_dialog', { filters })
}

export function saveFileDialog(defaultName: string): Promise<string | null> {
  return callCommand('save_file_dialog', { defaultName })
}

export function searchDocument(
  doc: OutlineDocument,
  query: string,
): Promise<SearchResult[]> {
  return callCommand('search_document', { doc, query })
}

export function getLibraryDocs(): Promise<LibraryDocumentItem[]> {
  return callCommand('get_library_docs')
}

export function addLibraryDoc(path: string): Promise<LibraryDocumentItem> {
  return callCommand('add_library_doc', { path })
}

export function removeLibraryDoc(path: string): Promise<void> {
  return callCommand('remove_library_doc', { path })
}

export function refreshLibraryDoc(path: string): Promise<LibraryDocumentItem> {
  return callCommand('refresh_library_doc', { path })
}

export function refreshLibrary(): Promise<LibraryDocumentItem[]> {
  return callCommand('refresh_library')
}

export function searchLibrary(query: string): Promise<LibrarySearchResult[]> {
  return callCommand('search_library', { query })
}

export function getLibraryTags(): Promise<LibraryTagSummary[]> {
  return callCommand('get_library_tags')
}

export function getLibraryTasks(): Promise<LibraryTaskSummary[]> {
  return callCommand('get_library_tasks')
}

export function rebuildLibraryIndex(): Promise<LibraryDocumentItem[]> {
  return callCommand('rebuild_library_index')
}

export function toggleLibraryTask(
  documentPath: string,
  nodeId: string,
  checked: boolean,
): Promise<LibraryTaskSummary> {
  return callCommand('toggle_library_task', { documentPath, nodeId, checked })
}
