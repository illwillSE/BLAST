import { useEffect, useRef, useState } from 'react'
import { blocksByCategory } from '../blocks/registry'
import { CAT_STYLES } from './ui'

export default function AddBlockMenu({ onAdd }) {
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

  // Sources are excluded: each sound has one source block, switched
  // in place on the source card itself.
  const categories = blocksByCategory().filter((c) => c.id !== 'source')

  return (
    <div className="relative shrink-0 self-start" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-24 w-32 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-700 text-slate-500 transition-colors hover:border-amber-500/50 hover:text-amber-400"
      >
        <span className="text-xl leading-none">+</span>
        <span className="text-[11px] font-semibold uppercase tracking-wider">Add Block</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 max-h-96 w-64 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 p-1.5 shadow-2xl">
          {categories.map((cat) => (
            <div key={cat.id} className="mb-1.5 last:mb-0">
              <div className="px-1.5 pb-0.5 pt-1 text-[10px] font-bold uppercase tracking-widest text-slate-600">
                {cat.label}
              </div>
              {cat.blocks.map((def) => (
                <button
                  key={def.type}
                  onClick={() => { onAdd(def.type); setOpen(false) }}
                  className="flex w-full items-baseline gap-2 rounded px-1.5 py-1 text-left transition-colors hover:bg-slate-800"
                >
                  <span className={`h-1.5 w-1.5 shrink-0 self-center rounded-full ${CAT_STYLES[def.category].dot}`} />
                  <span className="text-[12px] font-medium text-slate-200">{def.name}</span>
                  <span className="truncate text-[10px] text-slate-500">{def.description}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
