import React from 'react'

export const ButtonToggle: React.FC<{ isCollapsed: boolean; onClick: () => void }> = ({
  isCollapsed,
  onClick,
}) => {
  return (
    <button
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className="relative flex h-4 w-4 items-center justify-center rounded-full border border-amber-900/25 bg-[#FAF6EC] shadow-sm transition-all hover:scale-105 active:scale-95 focus:outline-none"
      title={isCollapsed ? '展开' : '折叠'}
    >
      <span className="absolute inset-0 flex flex-wrap items-center justify-center gap-1.5 p-0.5 opacity-40">
        <span className="h-0.5 w-0.5 rounded-full bg-amber-950" />
        <span className="h-0.5 w-0.5 rounded-full bg-amber-950" />
        <span className="h-0.5 w-0.5 rounded-full bg-amber-950" />
        <span className="h-0.5 w-0.5 rounded-full bg-amber-950" />
      </span>
      <span className={`absolute h-[1px] w-2 bg-amber-850/80 transition-transform duration-200 ${isCollapsed ? 'rotate-45' : '-rotate-45'}`} />
      <span className={`absolute h-[1px] w-2 bg-amber-850/80 transition-transform duration-200 ${isCollapsed ? '-rotate-45' : 'rotate-45'}`} />
    </button>
  )
}

export const KnitGrip: React.FC = () => {
  return (
    <div className="grid grid-cols-2 gap-[2px] p-0.5 opacity-30 transition-opacity group-hover:opacity-60">
      <div className="h-0.5 w-0.5 rounded-full bg-amber-900" />
      <div className="h-0.5 w-0.5 rounded-full bg-amber-900" />
      <div className="h-0.5 w-0.5 rounded-full bg-amber-900" />
      <div className="h-0.5 w-0.5 rounded-full bg-amber-900" />
      <div className="h-0.5 w-0.5 rounded-full bg-amber-900" />
      <div className="h-0.5 w-0.5 rounded-full bg-amber-900" />
    </div>
  )
}
