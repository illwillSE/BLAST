import { useState } from 'react'
import { Play, Copy, ClipboardPaste, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { useClipboard } from '../state/clipboard'
import { useT } from '../state/uiPrefs'
import type { Sound } from '../types'
import ConfirmButton from './ConfirmButton'

interface SoundRowProps {
  sound: Sound
  selected: boolean
  onSelect: () => void
  onPlay: () => void
  onRename: (name: string) => void
  onDuplicate: () => void
  onDelete: () => void
  canDelete: boolean
}

function SoundRow({ sound, selected, onSelect, onPlay, onRename, onDuplicate, onDelete, canDelete }: SoundRowProps) {
  const t = useT()
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
        selected ? 'bg-accent-deep/15 text-accent-soft' : 'text-text hover:bg-surface/70'
      }`}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onPlay() }}
        title={t('soundList.play')}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
          selected
            ? 'border-accent/60 text-accent-bright hover:bg-accent/20'
            : 'border-edge-2 text-text hover:border-text'
        }`}
      >
        <Play size={9} />
      </button>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(sound.name); setEditing(false) } }}
          onClick={(e) => e.stopPropagation()}
          className="w-full rounded border border-accent-deep/50 bg-well px-1 py-0.5 text-[12px] text-ink outline-none"
        />
      ) : (
        <span
          className="flex-1 truncate text-[12px]"
          onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); setDraft(sound.name) }}
          title={t('soundList.renameHint')}
        >
          {sound.name}
        </span>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onDuplicate() }}
        title={t('soundList.duplicate')}
        className="hidden items-center text-muted hover:text-ink group-hover:flex"
      >
        <Copy size={12} />
      </button>
      {canDelete && (
        <ConfirmButton
          onConfirm={onDelete}
          className="hidden items-center text-muted hover:text-danger group-hover:flex"
          armedClassName="text-[11px] rounded border border-danger bg-danger px-1 text-white transition-colors"
        >
          <X size={12} />
        </ConfirmButton>
      )}
    </div>
  )
}

interface SoundListProps {
  sounds: Sound[]
  selectedId: string
  onSelect: (id: string) => void
  onPlay: (id: string) => void
  onAdd: () => void
  onRename: (id: string, name: string) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
  onPasteAsNewSound: () => void
}

export default function SoundList({ sounds, selectedId, onSelect, onPlay, onAdd, onRename, onDuplicate, onDelete, onPasteAsNewSound }: SoundListProps) {
  const clip = useClipboard()
  const t = useT()
  const [collapsed, setCollapsed] = useState(false)

  if (collapsed) {
    return (
      <aside className="flex w-8 shrink-0 flex-col items-center border-r border-divider bg-panel pt-2 gap-2">
        <button
          onClick={() => setCollapsed(false)}
          title={t('soundList.show')}
          className="text-muted hover:text-ink"
        >
          <ChevronRight size={14} />
        </button>
        <span
          className="text-[11px] font-bold uppercase tracking-widest text-muted"
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        >
          {t('soundList.title')}
        </span>
      </aside>
    )
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-divider bg-panel">
      <div className="flex items-center justify-between border-b border-divider px-3 py-2">
        <span className="text-[11px] font-bold uppercase tracking-widest text-muted">{t('soundList.title')}</span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setCollapsed(true)}
            title={t('soundList.collapse')}
            className="flex items-center rounded border border-edge px-1.5 py-0.5 text-text transition-colors hover:border-accent-deep/50 hover:text-accent"
          >
            <ChevronLeft size={13} />
          </button>
          {clip?.kind === 'sample' && (
            <button
              onClick={onPasteAsNewSound}
              title={t('soundList.pasteAsSound')}
              className="flex items-center rounded border border-edge px-1.5 py-0.5 text-text transition-colors hover:border-accent-deep/50 hover:text-accent"
            >
              <ClipboardPaste size={13} />
            </button>
          )}
          <button
            onClick={onAdd}
            title={t('soundList.add')}
            className="rounded border border-edge px-1.5 text-[13px] leading-5 text-text transition-colors hover:border-accent-deep/50 hover:text-accent"
          >
            +
          </button>
        </div>
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
      <div className="border-t border-divider p-2 text-[10px] leading-relaxed text-faint">
        <kbd className="rounded border border-edge px-1">Space</kbd> {t('soundList.spacePlays')}
      </div>
    </aside>
  )
}
