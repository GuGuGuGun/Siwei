import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OutlineInlineContent } from './OutlineInlineContent'
import { parseInlineNodeContent } from './inlineContentParser'

describe('inlineContentParser', () => {
  it('parses bold, italic, inline code, markdown links, bare urls, and latex text', () => {
    expect(
      parseInlineNodeContent('**粗体** *斜体* `code` [站点](https://example.com) https://siwei.app $x^2$'),
    ).toEqual([
      { kind: 'bold', text: '粗体' },
      { kind: 'text', text: ' ' },
      { kind: 'italic', text: '斜体' },
      { kind: 'text', text: ' ' },
      { kind: 'code', text: 'code' },
      { kind: 'text', text: ' ' },
      { kind: 'link', text: '站点', href: 'https://example.com' },
      { kind: 'text', text: ' ' },
      { kind: 'link', text: 'https://siwei.app', href: 'https://siwei.app' },
      { kind: 'text', text: ' ' },
      { kind: 'latex', text: 'x^2' },
    ])
  })

  it('falls back to original text for malformed inline markup', () => {
    expect(parseInlineNodeContent('公式 $x^2 和 **粗体')).toEqual([
      { kind: 'text', text: '公式 $x^2 和 **粗体' },
    ])
  })

  it('renders parsed content without turning unsupported links into anchors', () => {
    render(<OutlineInlineContent text="[本地](file://demo) **重点** `code` $x^2$" />)

    expect(screen.getByText('[本地](file://demo)')).toBeInTheDocument()
    expect(screen.getByText('重点').tagName).toBe('STRONG')
    expect(screen.getByText('code').tagName).toBe('CODE')
    expect(screen.getByText('x^2')).toHaveAttribute('data-inline-latex')
  })
})
