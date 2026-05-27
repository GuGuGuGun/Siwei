import React from 'react'

interface MindMapInlineEditorProps {
  value: string
  onChange: (value: string) => void
  onCommit: () => void
  onCancel: () => void
  onDeleteEmpty: () => void
  onInsertSibling: () => void
  onInsertChild: () => void
  onIndent: () => void
  onOutdent: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onToggleChecked: () => void
}

export const MindMapInlineEditor: React.FC<MindMapInlineEditorProps> = ({
  value,
  onChange,
  onCommit,
  onCancel,
  onDeleteEmpty,
  onInsertSibling,
  onInsertChild,
  onIndent,
  onOutdent,
  onMoveUp,
  onMoveDown,
  onToggleChecked,
}) => {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [isComposing, setIsComposing] = React.useState(false)

  React.useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (isComposing) return

    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      onToggleChecked()
      return
    }

    if ((event.ctrlKey || event.metaKey) && event.key === 'ArrowUp') {
      event.preventDefault()
      onMoveUp()
      return
    }

    if ((event.ctrlKey || event.metaKey) && event.key === 'ArrowDown') {
      event.preventDefault()
      onMoveDown()
      return
    }

    switch (event.key) {
      case 'Enter':
        event.preventDefault()
        if (event.shiftKey) {
          onInsertChild()
        } else {
          onInsertSibling()
        }
        break
      case 'Tab':
        event.preventDefault()
        if (event.shiftKey) {
          onOutdent()
        } else {
          onIndent()
        }
        break
      case 'Backspace':
        if (value.length === 0) {
          event.preventDefault()
          onDeleteEmpty()
        }
        break
      case 'Escape':
        event.preventDefault()
        onCancel()
        break
    }
  }

  return (
    <input
      ref={inputRef}
      aria-label="编辑节点文本"
      className="w-full min-w-0 rounded-md border border-amber-700/30 bg-white/80 px-2 py-1 text-center text-xs font-semibold leading-relaxed text-zinc-800 shadow-inner outline-none focus:border-amber-700"
      value={value}
      placeholder="空白节点"
      onChange={(event) => onChange(event.target.value)}
      onBlur={onCommit}
      onCompositionStart={() => setIsComposing(true)}
      onCompositionEnd={() => setIsComposing(false)}
      onKeyDown={handleKeyDown}
    />
  )
}
