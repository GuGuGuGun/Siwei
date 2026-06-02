import React from 'react'
import { toast } from '../components/common/Toast'

interface AsyncOperationOptions {
  errorPrefix: string
}

export function useAsyncOperation({ errorPrefix }: AsyncOperationOptions) {
  return React.useCallback(async <T,>(operation: () => Promise<T>): Promise<T | null> => {
    try {
      return await operation()
    } catch (error) {
      toast.error(`${errorPrefix}: ${String(error)}`)
      return null
    }
  }, [errorPrefix])
}
