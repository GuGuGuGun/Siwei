import React from 'react'

export interface SlashCommand {
  key: string
  label: string
  desc: string
  shortcut: string
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { key: 'todo', label: '待办列表', desc: '添加或切换待办选项', shortcut: 'Ctrl+Enter' },
  { key: 'indent', label: '向内缩进', desc: '将节点向右缩进一级', shortcut: 'Tab' },
  { key: 'outdent', label: '向外缩进', desc: '将节点向左提升一级', shortcut: 'Shift+Tab' },
  { key: 'delete', label: '删除节点', desc: '完全移除此节点', shortcut: 'Backspace' },
]

export function useSlashCommandMenu() {
  const [isOpen, setIsOpen] = React.useState(false)
  const [activeIndex, setActiveIndex] = React.useState(0)

  const open = React.useCallback(() => {
    setIsOpen(true)
    setActiveIndex(0)
  }, [])

  const close = React.useCallback(() => {
    setIsOpen(false)
  }, [])

  const moveNext = React.useCallback(() => {
    setActiveIndex((prev) => (prev + 1) % SLASH_COMMANDS.length)
  }, [])

  const movePrevious = React.useCallback(() => {
    setActiveIndex((prev) => (prev - 1 + SLASH_COMMANDS.length) % SLASH_COMMANDS.length)
  }, [])

  const activeCommand = SLASH_COMMANDS[activeIndex]

  return {
    commands: SLASH_COMMANDS,
    isOpen,
    activeIndex,
    activeCommand,
    open,
    close,
    moveNext,
    movePrevious,
  }
}
