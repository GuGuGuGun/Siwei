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
  const isComposingRef = React.useRef(false)
  const [isComposing, setIsComposing] = React.useState(false)
  const [draftValue, setDraftValue] = React.useState(value)
  const [lastCommittedValue, setLastCommittedValue] = React.useState(value)

  React.useEffect(() => {
    if (!isComposing && value !== lastCommittedValue) {
      setDraftValue(value)
      setLastCommittedValue(value)
    }
  }, [isComposing, lastCommittedValue, value])

  React.useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const commitDraft = React.useCallback((nextValue = draftValue) => {
    onChange(nextValue)
    setLastCommittedValue(nextValue)
    onCommit()
  }, [draftValue, onChange, onCommit])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation()
    if (isComposingRef.current) return

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
        onChange(draftValue)
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
        if (draftValue.length === 0) {
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

  const keepMouseEventInsideEditor = (event: React.MouseEvent<HTMLInputElement>) => {
    event.stopPropagation()
  }

  return (
    <input
      ref={inputRef}
      aria-label="编辑节点文本"
      className="nodrag nopan w-full min-w-0 rounded-md border border-amber-700/30 bg-white/80 px-2 py-1 text-center text-xs font-semibold leading-relaxed text-zinc-800 shadow-inner outline-none focus:border-amber-700"
      value={draftValue}
      placeholder="空白节点"
      onChange={(event) => {
        setDraftValue(event.target.value)
        if (!isComposingRef.current) {
          onChange(event.target.value)
          setLastCommittedValue(event.target.value)
        }
      }}
      onBlur={() => commitDraft()}
      onCompositionStart={() => {
        isComposingRef.current = true
        setIsComposing(true)
      }}
      onCompositionEnd={(event) => {
        const committedValue = event.currentTarget.value
        isComposingRef.current = false
        setIsComposing(false)
        setDraftValue(committedValue)
        onChange(committedValue)
        setLastCommittedValue(committedValue)
      }}
      onPointerDown={keepMouseEventInsideEditor}
      onMouseDown={keepMouseEventInsideEditor}
      onClick={keepMouseEventInsideEditor}
      onKeyDown={handleKeyDown}
    />
  )
}
