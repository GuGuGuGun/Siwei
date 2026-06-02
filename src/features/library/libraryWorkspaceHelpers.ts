import type { LibraryRefreshStatus } from '../../types/library'

export function isLibraryRefreshFinished(status: LibraryRefreshStatus['status']) {
  return status === 'completed' ||
    status === 'completedWithErrors' ||
    status === 'cancelled' ||
    status === 'failed'
}
