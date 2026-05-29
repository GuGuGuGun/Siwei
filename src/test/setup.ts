import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

Object.defineProperty(window, 'confirm', {
  configurable: true,
  value: vi.fn(() => true),
})

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})
