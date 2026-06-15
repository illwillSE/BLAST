import { useEffect, useRef, useState } from 'react'
import { blocksByCategory, BLOCK_DEFS } from '../blocks/registry'
import { useClipboard } from '../state/clipboard'
import { CAT_STYLES } from './ui'

// `excludeKinds` hides whole block kinds. Sources are always excluded (a lane's
// source is switched in place on its card). The master chain also excludes
// `control` blocks — pitch/amp modulation is per-lane, not post-mix.
export default function AddBlockMenu({ onAdd, onPaste, excludeKinds = [], excludeTypes = [], label = 'Add Block', variant = 'box' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const hidden = new Set(['source', ...excludeKinds])
  const hiddenTypes = new Set(excludeTypes)
  const categories = blocksByCategory()
    .map((c) => ({ ...c, blocks: c.blocks.filter((def) => !hidden.has(def.kind) && !hiddenTypes.has(def.type)) }))
    .filter((c) => c.blocks.length > 0)

  // Offer "Paste" when a copied block fits this chain (its kind/type isn't hidden).
  const clip = useClipboard()
  const pasteDef = clip?.kind === 'block' ? BLOCK_DEFS[clip.block.type] : null
  const canPaste = onPaste && pasteDef && !hidden.has(pasteDef.kind) && !hiddenTypes.has(pasteDef.type)

  return (
    <div className="relative shrink-0 self-center" ref={ref}>
      {variant === 'chip' ? (
        <button
          onClick={() => setOpen((o) => !o)}
          title={label}
          className="flex items-center gap-1 rounded-lg border border-dashed border-edge px-2.5 py-1.5 text-[12px] text-muted transition-colors hover:border-accent-deep/50 hover:text-accent"
        >
          <span className="text-base leading-none">+</span>
          {label !== 'Add Block' && <span className="text-[10px] uppercase tracking-wider">{label.replace(/^Add /, '')}</span>}
        </button>
      ) : (
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex h-24 w-32 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-edge text-muted transition-colors hover:border-accent-deep/50 hover:text-accent"
        >
          <span className="text-xl leading-none">+</span>
          <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
        </button>
      )}

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 max-h-96 w-64 overflow-y-auto rounded-lg border border-edge bg-panel p-1.5 shadow-2xl">
          {canPaste && (
            <button
              onClick={() => { onPaste(); setOpen(false) }}
              className="mb-1.5 flex w-full items-baseline gap-2 rounded border border-accent-deep/40 px-1.5 py-1 text-left transition-colors hover:bg-surface"
            >
              <span className="self-center text-[12px] leading-none text-accent">⇲</span>
              <span className="text-[12px] font-medium text-ink">Paste {pasteDef.name}</span>
            </button>
          )}
          {categories.map((cat) => (
            <div key={cat.id} className="mb-1.5 last:mb-0">
              <div className="px-1.5 pb-0.5 pt-1 text-[10px] font-bold uppercase tracking-widest text-faint">
                {cat.label}
              </div>
              {cat.blocks.map((def) => (
                <button
                  key={def.type}
                  onClick={() => { onAdd(def.type); setOpen(false) }}
                  className="flex w-full items-baseline gap-2 rounded px-1.5 py-1 text-left transition-colors hover:bg-surface"
                >
                  <span className={`h-1.5 w-1.5 shrink-0 self-center rounded-full ${CAT_STYLES[def.category].dot}`} />
                  <span className="text-[12px] font-medium text-ink">{def.name}</span>
                  <span className="truncate text-[10px] text-muted">{def.description}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
