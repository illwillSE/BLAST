import { useEffect, useState } from 'react'
import { BLOCK_DEFS } from '../blocks/registry'
import { HELP } from '../blocks/help'
import { CAT_STYLES, formatValue } from './ui'

const LANG_KEY = 'blast-help-lang'

// Help window opened from the (i) icon in a block's title bar. Content is
// looked up by block type, so every block type gets this for free. The flag
// toggles English/Swedish; the choice is remembered across blocks/sessions.
export default function BlockHelpModal({ type, onClose }) {
  const def = BLOCK_DEFS[type]
  const cat = CAT_STYLES[def.category]
  const [lang, setLang] = useState(() => (localStorage.getItem(LANG_KEY) === 'sv' ? 'sv' : 'en'))

  const t = HELP[lang]
  const en = HELP.en
  const block = t.blocks[type] ?? {}
  const blockEn = en.blocks[type] ?? {}
  const paramHelp = (key) =>
    block.params?.[key] ?? t.common[key] ?? blockEn.params?.[key] ?? en.common[key] ?? null

  function toggleLang() {
    const next = lang === 'en' ? 'sv' : 'en'
    setLang(next)
    localStorage.setItem(LANG_KEY, next)
  }

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-xl border border-edge bg-panel shadow-2xl">
        <div className="flex items-center gap-2 border-b border-divider px-4 py-3">
          <span className={`h-2 w-2 rounded-full ${cat.dot}`} />
          <span className={`flex-1 text-[13px] font-semibold uppercase tracking-wider ${cat.text}`}>
            {def.name}
          </span>
          <button
            onClick={toggleLang}
            title={lang === 'en' ? 'Visa på svenska' : 'Show in English'}
            className="rounded px-1 text-[15px] leading-none transition-transform hover:scale-110"
          >
            {lang === 'en' ? '🇸🇪' : '🇬🇧'}
          </button>
          <button
            onClick={onClose}
            title="Close (Esc)"
            className="text-muted transition-colors hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-4 py-3">
          <p className="text-[13px] leading-relaxed text-text">
            {block.summary ?? blockEn.summary ?? def.description}
          </p>

          {def.params.length > 0 && (
            <div>
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-faint">
                {t.headings.controls}
              </div>
              <dl className="space-y-2.5">
                {def.params.map((p) => (
                  <div key={p.key}>
                    <dt className="flex items-baseline gap-2">
                      <span className="text-[12px] font-semibold text-ink">{p.label}</span>
                      {p.type === 'range' && (
                        <span className="font-mono text-[10px] text-faint">
                          {formatValue(p, p.min)} – {formatValue(p, p.max)}
                        </span>
                      )}
                    </dt>
                    <dd className="text-[12px] leading-relaxed text-muted">
                      {paramHelp(p.key) ?? p.label}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {(block.notes ?? blockEn.notes)?.length > 0 && (
            <div>
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-faint">
                {t.headings.notes}
              </div>
              <ul className="space-y-1.5">
                {(block.notes ?? blockEn.notes).map((note, i) => (
                  <li key={i} className="flex gap-1.5 text-[12px] leading-relaxed text-muted">
                    <span className="text-faint">·</span>
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
