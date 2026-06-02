import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AgentMarkdownText, parseAgentMarkdownBlocks } from './AgentMarkdownText'

describe('AgentMarkdownText', () => {
  it('parses paragraphs and markdown lists', () => {
    expect(parseAgentMarkdownBlocks([
      '你想怎么调整当前思维导图？',
      '',
      '1. **新增节点**：添加内容',
      '2. **改名节点**：修改标题',
    ].join('\n'))).toEqual([
      { kind: 'paragraph', text: '你想怎么调整当前思维导图？' },
      {
        kind: 'ordered-list',
        items: ['**新增节点**：添加内容', '**改名节点**：修改标题'],
      },
    ])
  })

  it('splits inline numbered examples into an ordered list', () => {
    expect(parseAgentMarkdownBlocks(
      '你想怎么调整当前思维导图？请告诉我具体操作，例如： 1. **新增节点**：添加内容 2. **改名节点**：修改标题',
    )).toEqual([
      { kind: 'paragraph', text: '你想怎么调整当前思维导图？请告诉我具体操作，例如：' },
      {
        kind: 'ordered-list',
        items: ['**新增节点**：添加内容', '**改名节点**：修改标题'],
      },
    ])
  })

  it('renders bold text inside ordered lists without exposing markdown markers', () => {
    render(
      <AgentMarkdownText
        text={[
          '你想怎么调整当前思维导图？',
          '1. **新增节点**：添加内容',
          '2. **整体优化结构**：细化复习框架',
        ].join('\n')}
      />,
    )

    const list = screen.getByRole('list')
    expect(list.tagName).toBe('OL')
    expect(within(list).getByText('新增节点').tagName).toBe('STRONG')
    expect(within(list).getByText('整体优化结构').tagName).toBe('STRONG')
    expect(screen.queryByText(/\*\*新增节点\*\*/)).not.toBeInTheDocument()
  })
})
