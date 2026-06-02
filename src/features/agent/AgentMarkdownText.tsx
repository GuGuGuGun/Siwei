import React from 'react'

import { OutlineInlineContent } from '../outline/OutlineInlineContent'

interface AgentMarkdownTextProps {
  text: string
}

type MarkdownBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'ordered-list'; items: string[] }
  | { kind: 'unordered-list'; items: string[] }

export const AgentMarkdownText: React.FC<AgentMarkdownTextProps> = ({ text }) => {
  const blocks = React.useMemo(() => parseAgentMarkdownBlocks(text), [text])

  return (
    <div className="space-y-1.5">
      {blocks.map((block, index) => {
        const key = `${block.kind}-${index}`

        if (block.kind === 'ordered-list') {
          return (
            <ol key={key} className="list-decimal space-y-1 pl-4">
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`}>
                  <OutlineInlineContent text={item} />
                </li>
              ))}
            </ol>
          )
        }

        if (block.kind === 'unordered-list') {
          return (
            <ul key={key} className="list-disc space-y-1 pl-4">
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`}>
                  <OutlineInlineContent text={item} />
                </li>
              ))}
            </ul>
          )
        }

        return (
          <p key={key}>
            <OutlineInlineContent text={block.text} />
          </p>
        )
      })}
    </div>
  )
}

export function parseAgentMarkdownBlocks(text: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = []
  const lines = normalizeInlineOrderedListBreaks(text).replace(/\r\n/g, '\n').split('\n')
  let paragraphLines: string[] = []
  let orderedItems: string[] = []
  let unorderedItems: string[] = []

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return
    blocks.push({ kind: 'paragraph', text: paragraphLines.join(' ') })
    paragraphLines = []
  }

  const flushOrdered = () => {
    if (orderedItems.length === 0) return
    blocks.push({ kind: 'ordered-list', items: orderedItems })
    orderedItems = []
  }

  const flushUnordered = () => {
    if (unorderedItems.length === 0) return
    blocks.push({ kind: 'unordered-list', items: unorderedItems })
    unorderedItems = []
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      flushParagraph()
      flushOrdered()
      flushUnordered()
      continue
    }

    const orderedMatch = trimmed.match(/^\d+[.)]\s+(.+)$/)
    if (orderedMatch) {
      flushParagraph()
      flushUnordered()
      orderedItems.push(orderedMatch[1])
      continue
    }

    const unorderedMatch = trimmed.match(/^[-*]\s+(.+)$/)
    if (unorderedMatch) {
      flushParagraph()
      flushOrdered()
      unorderedItems.push(unorderedMatch[1])
      continue
    }

    flushOrdered()
    flushUnordered()
    paragraphLines.push(trimmed)
  }

  flushParagraph()
  flushOrdered()
  flushUnordered()

  return blocks.length > 0 ? blocks : [{ kind: 'paragraph', text }]
}

function normalizeInlineOrderedListBreaks(text: string): string {
  return text.replace(/\s+(\d+[.)]\s+)/g, '\n$1').trimStart()
}
