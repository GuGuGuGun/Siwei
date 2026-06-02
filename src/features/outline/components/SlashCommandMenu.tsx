import React from 'react'
import type { SlashCommand } from '../hooks/useSlashCommandMenu'

interface SlashCommandMenuProps {
  commands: SlashCommand[]
  activeIndex: number
  onCommand: (key: string) => void
}

export const SlashCommandMenu: React.FC<SlashCommandMenuProps> = ({
  commands,
  activeIndex,
  onCommand,
}) => {
  return (
    <div className="absolute left-16 top-9 z-50 w-60 animate-scale-up rounded-xl bg-washed-paper p-1.5 font-sans text-xs">
      <div className="mb-1 border-b border-dashed border-amber-900/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
        织物指令
      </div>
      <div className="space-y-0.5">
        {commands.map((command, index) => (
          <button
            key={command.key}
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onCommand(command.key)
            }}
            className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left transition-colors focus:outline-none ${
              index === activeIndex
                ? 'bg-[#EFECE3] font-semibold text-amber-950'
                : 'text-zinc-600 hover:bg-[#FAF8F5]'
            }`}
          >
            <div>
              <div>{command.label}</div>
              <div className="mt-0.5 text-[10px] font-normal text-zinc-400">
                {command.desc}
              </div>
            </div>
            <kbd className="rounded border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 font-mono text-[9px] text-zinc-400">
              {command.shortcut}
            </kbd>
          </button>
        ))}
      </div>
    </div>
  )
}
