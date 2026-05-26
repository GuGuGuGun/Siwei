import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

Object.defineProperty(window, 'confirm', {
  configurable: true,
  value: vi.fn(() => true),
})
