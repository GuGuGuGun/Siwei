import React from 'react'
import { parseInlineNodeContent } from './inlineContentParser'

interface OutlineInlineContentProps {
  text: string
}

export const OutlineInlineContent: React.FC<OutlineInlineContentProps> = ({ text }) => {
  const tokens = React.useMemo(() => parseInlineNodeContent(text), [text])

  return (
    <>
      {tokens.map((token, index) => {
        const key = `${token.kind}-${index}`

        switch (token.kind) {
          case 'bold':
            return <strong key={key}>{token.text}</strong>
          case 'italic':
            return <em key={key}>{token.text}</em>
          case 'code':
            return (
              <code
                key={key}
                className="rounded border border-amber-900/15 bg-amber-50 px-1 py-0.5 font-mono text-[0.85em] text-amber-950"
              >
                {token.text}
              </code>
            )
          case 'link':
            return (
              <a
                key={key}
                href={token.href}
                target="_blank"
                rel="noreferrer"
                className="text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-900"
                onClick={(event) => event.stopPropagation()}
              >
                {token.text}
              </a>
            )
          case 'latex':
            return (
              <span
                key={key}
                data-inline-latex
                className="rounded bg-zinc-100 px-1 font-serif text-[0.92em] text-zinc-800"
              >
                {token.text}
              </span>
            )
          default:
            return <React.Fragment key={key}>{token.text}</React.Fragment>
        }
      })}
    </>
  )
}
