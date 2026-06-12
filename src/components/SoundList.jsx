import { useState } from 'react'

function SoundRow({ sound, selected, onSelect, onPlay, onRename, onDuplicate, onDelete, canDelete }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(sound.name)

  function commit() {
    setEditing(false)
    const name = draft.trim()
    if (name && name !== sound.name) onRename(name)
    else setDraft(sound.name)
  }

  return (
    <div
      onClick={onSelect}
      className={`group flex cursor-pointer items-center gap-1.5 rounded px-2 py-1.5 transition-colors ${
        selected ? 'bg-amber-500/15 text-amber-200' : 'text-slate-300 hover:bg-slate-800'
      }`}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onPlay() }}
        title="Play"
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[9px] transition-colors ${
          selected
            ? 'border-amber-400/60 text-amber-300 hover:bg-amber-400/20'
            : 'border-slate-600 text-slate-400 hover:border-slate-400'
        }`}
      >
        ▶
      </button>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(sound.name); setEditing(false) } }}
          onClick={(e) => e.stopPropagation()}
          className="w-full rounded border border-amber-500/50 bg-slate-950 px-1 py-0.5 text-[12px] outline-none"
        />
      ) : (
        <span
          className="flex-1 truncate text-[12px]"
          onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); setDraft(sound.name) }}
          title="Double-click to rename"
        >
          {sound.name}
        </span>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onDuplicate() }}
        title="Duplicate"
        className="hidden text-[11px] text-slate-500 hover:text-slate-200 group-hover:block"
      >
        ⧉
      </button>
      {canDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          title="Delete sound"
          className="hidden text-[11px] text-slate-500 hover:text-red-400 group-hover:block"
        >
          ✕
        </button>
      )}
    </div>
  )
}

export default function SoundList({ sounds, selectedId, onSelect, onPlay, onAdd, onRename, onDuplicate, onDelete }) {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-slate-800 bg-slate-950/60">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
        <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Sounds</span>
        <button
          onClick={onAdd}
          title="Add sound"
          className="rounded border border-slate-700 px-1.5 text-[13px] leading-5 text-slate-400 transition-colors hover:border-amber-500/50 hover:text-amber-400"
        >
          +
        </button>
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto p-1.5">
        {sounds.map((s) => (
          <SoundRow
            key={s.id}
            sound={s}
            selected={s.id === selectedId}
            onSelect={() => onSelect(s.id)}
            onPlay={() => onPlay(s.id)}
            onRename={(name) => onRename(s.id, name)}
            onDuplicate={() => onDuplicate(s.id)}
            onDelete={() => onDelete(s.id)}
            canDelete={sounds.length > 1}
          />
        ))}
      </div>
      <div className="border-t border-slate-800 p-2 text-[10px] leading-relaxed text-slate-600">
        <kbd className="rounded border border-slate-700 px-1">Space</kbd> plays the selected sound
      </div>
    </aside>
  )
}
