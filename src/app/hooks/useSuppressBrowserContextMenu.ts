import React from 'react'

export function useSuppressBrowserContextMenu() {
  React.useEffect(() => {
    const suppressBrowserContextMenu = (event: MouseEvent) => {
      event.preventDefault()
    }

    window.addEventListener('contextmenu', suppressBrowserContextMenu)
    return () => window.removeEventListener('contextmenu', suppressBrowserContextMenu)
  }, [])
}
