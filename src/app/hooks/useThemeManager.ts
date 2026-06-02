import React from 'react'
import { useSettingsStore } from '../../features/settings/settingsStore'

export function useThemeManager() {
  const theme = useSettingsStore((s) => s.settings.theme)

  React.useEffect(() => {
    const root = window.document.documentElement
    const applyTheme = (nextTheme: 'light' | 'dark' | 'system') => {
      root.classList.remove('light', 'dark')
      if (nextTheme === 'system') {
        const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
        root.classList.add(systemTheme)
      } else {
        root.classList.add(nextTheme)
      }
    }

    applyTheme(theme)
    if (theme !== 'system') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleSystemThemeChange = () => applyTheme('system')
    mediaQuery.addEventListener('change', handleSystemThemeChange)
    return () => mediaQuery.removeEventListener('change', handleSystemThemeChange)
  }, [theme])
}
