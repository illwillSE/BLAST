import { BLOCK_DEFS } from '../blocks/registry'
import { HELP } from '../blocks/help'
import { useUIPrefs } from '../state/uiPrefs'
import { CAT_STYLES, formatValue } from './ui'
import type { BlockType } from '../types'
import HelpModal from './HelpModal'

interface BlockHelpModalProps {
  type: BlockType
  onParam?: (key: string, value: unknown) => void
  onClose: () => void
}

// Help window opened from the (i) icon in a block's title bar. Content is
// looked up by block type, so every block type gets this for free. The flag
// toggles English/Swedish via the shared UI-language preference, so it stays in
// sync with the rest of the app's language.
export default function BlockHelpModal({ type, onParam, onClose }: BlockHelpModalProps) {
  const def = BLOCK_DEFS[type]
  const cat = CAT_STYLES[def.category]
  const { lang, mode } = useUIPrefs()

  const t = HELP[lang]
  const en = HELP.en
  const block = t.blocks[type] ?? {}
  const blockEn = en.blocks[type] ?? {}
  const paramHelp = (key: string): string | null =>
    block.params?.[key] ?? t.common[key] ?? blockEn.params?.[key] ?? en.common[key] ?? null

  // Match the inspector: in Beginner mode, advanced params aren't listed here.
  const helpParams = def.params.filter((p) => mode === 'advanced' || !p.advanced)
  const notes = block.notes ?? blockEn.notes

  return (
    <HelpModal dot={cat.dot} title={def.name} titleClass={cat.text} onClose={onClose}>
        <div className="space-y-4 overflow-y-auto px-4 py-3">
          <p className="text-[13px] leading-relaxed text-text">
            {block.summary ?? blockEn.summary ?? def.description}
          </p>

          {def.examples && def.examples.length > 0 && onParam && (
            <div>
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-faint">
                {t.headings.examples}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {def.examples.map((ex) => (
                  <button
                    key={ex.label}
                    onClick={() => { Object.entries(ex.params).forEach(([k, v]) => onParam(k, v)); onClose() }}
                    title={ex.hint}
                    className="rounded border border-edge bg-surface px-2.5 py-1 text-[11px] font-medium text-ink-soft transition-colors hover:border-accent-deep/60 hover:text-accent-bright"
                  >
                    {ex.label}
                    {ex.hint && <span className="ml-1.5 text-[10px] font-normal text-faint">{ex.hint}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {helpParams.length > 0 && (
            <div>
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-faint">
                {t.headings.controls}
              </div>
              <dl className="space-y-2.5">
                {helpParams.map((p) => (
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

          {notes && notes.length > 0 && (
            <div>
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-faint">
                {t.headings.notes}
              </div>
              <ul className="space-y-1.5">
                {notes.map((note, i) => (
                  <li key={i} className="flex gap-1.5 text-[12px] leading-relaxed text-muted">
                    <span className="text-faint">·</span>
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
    </HelpModal>
  )
}
