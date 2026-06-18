import { useState } from 'react'
import { Copy, ClipboardPaste, Power, X } from 'lucide-react'
import { BLOCK_DEFS } from '../blocks/registry'
import { useClipboard, copyBlock } from '../state/clipboard'
import { useUIPrefs, useT } from '../state/uiPrefs'
import { CAT_STYLES, ParamControl, InfoDot } from './ui'
import SampleEditor from './SampleEditor'
import ConfirmButton from './ConfirmButton'
import EnvelopeSampleLoader from './EnvelopeSampleLoader'
import SynthPreview from './SynthPreview'
import BlockHelpModal from './BlockHelpModal'

// `metal` is an advanced source — hidden from the in-place source switch in
// Beginner mode (still selectable in Advanced). Keeping the current type listed
// means a sound that already uses Metal still shows it as the active choice.
function SourceTypeSwitch({ block, onSwapSource }) {
  const { mode } = useUIPrefs()
  const types = ['synth', 'metal', 'noise', 'sample'].filter(
    (t) => mode === 'advanced' || t !== 'metal' || block.type === 'metal',
  )
  return (
    <div className="inline-flex gap-1 rounded bg-well p-0.5">
      {types.map((t) => (
        <button
          key={t}
          onClick={() => t !== block.type && onSwapSource(t)}
          className={`rounded px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
            block.type === t ? 'bg-accent-deep/20 text-accent-bright' : 'text-muted hover:text-ink-soft'
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  )
}

const NOISE_COLORS = [
  { value: 'white', bg: '#c8c8c8', label: 'white' },
  { value: 'pink',  bg: '#d4708a', label: 'pink'  },
  { value: 'brown', bg: '#7a4728', label: 'brown' },
]

function NoiseColorPicker({ value, onChange }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-faint">Color</span>
      <div className="flex gap-2">
        {NOISE_COLORS.map(({ value: v, bg, label }) => (
          <button
            key={v}
            title={label}
            onClick={() => onChange(v)}
            style={{ backgroundColor: bg, outlineColor: bg }}
            className={`h-6 w-6 rounded transition-all ${
              value === v
                ? 'scale-110 outline outline-2 outline-offset-2'
                : 'opacity-50 hover:opacity-80'
            }`}
          />
        ))}
      </div>
    </div>
  )
}

// Header for a grouped control panel. When an override block (Sample Envelope /
// Vocoder) has taken over one of the panel's params, a badge names it so the
// greyed controls read as deliberate, not broken — the same info the per-control
// hover tooltip carries, surfaced at a glance.
function PanelHeader({ label, titleKey, textKey, params, disabledParams, onSelect }) {
  const t = useT()
  const lockedBy = params.map((p) => disabledParams?.get(p.key)).find(Boolean)
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-wide text-faint">{label}</span>
      {textKey && <InfoDot titleKey={titleKey} textKey={textKey} />}
      {lockedBy && (
        <button
          onClick={() => onSelect?.(lockedBy.id)}
          title={t('block.setByTitle')}
          className="rounded bg-well px-1.5 py-0.5 text-[9px] normal-case tracking-normal text-muted transition-colors hover:text-accent-bright"
        >
          {t('block.setBy')} {lockedBy.name} ↗
        </button>
      )}
    </div>
  )
}

function ParamsGrid({ visibleParams, blockParams, disabledParams, onParam }) {
  return (
    <div className="grid gap-x-8 gap-y-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
      {visibleParams.map((p) => {
        const lockedBy = disabledParams?.get(p.key)
        // A param can mark itself inert for the current settings (e.g. noise
        // Length while Sustain is 0). Unlike an override it stays interactive —
        // just dimmed, with the reason on hover.
        const inertReason = !lockedBy && p.inactive ? p.inactive(blockParams) : null
        return (
          <div
            key={p.key}
            style={p.type === 'harmonics' ? { gridColumn: 'span 2' } : undefined}
            className={lockedBy ? 'pointer-events-none opacity-40' : inertReason ? 'opacity-50' : undefined}
            title={lockedBy ? `Overridden by the ${lockedBy.name} block` : inertReason || undefined}
          >
            <ParamControl def={p} value={blockParams[p.key]} onChange={(v) => onParam(p.key, v)} />
          </div>
        )
      })}
    </div>
  )
}

// Full controls for one block, rendered in the inspector dock. Params lay out
// in a responsive 2-column grid; the rich editors (sample waveform, harmonics)
// span the full width above the grid.
export default function BlockControls({
  block, sound, soundId, isSource, canRemoveLane, onParam, onToggle, onRemove, onSwapSource, onPasteValues, disabledParams, onSelect,
}) {
  const def = BLOCK_DEFS[block.type]
  const cat = CAT_STYLES[def.category]
  const { mode } = useUIPrefs()
  const t = useT()
  const [helpOpen, setHelpOpen] = useState(false)
  const clip = useClipboard()
  const canPasteValues = clip?.kind === 'block' && clip.block.type === block.type

  const shown = def.params.filter((p) =>
    (!p.show || p.show(block.params, sound)) && !(block.type === 'noise' && p.key === 'color')
    && !(block.type === 'monitor' && p.key === 'mode')
  )
  // Beginner mode hides params tagged `advanced`. If that would empty the
  // inspector for this block, fall back to showing all its params so the user
  // never lands on a blank panel.
  const curated = shown.filter((p) => mode === 'advanced' || !p.advanced)
  const visibleParams = curated.length > 0 ? curated : shown

  return (
    <div data-tut="block-controls" className="min-w-[280px] w-full">
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${cat.dot}`} />
        <span className={`text-[12px] font-semibold uppercase tracking-wider ${cat.text}`}>{def.name}</span>
        <button
          onClick={() => setHelpOpen(true)}
          title={t('help.whatDoes')}
          className="flex h-4 w-4 items-center justify-center rounded-full border border-edge-2 font-serif text-[9px] italic leading-none text-muted transition-colors hover:border-info/60 hover:text-info-bright"
        >
          i
        </button>
        {isSource && <span data-tut="source-swap" className="ml-1"><SourceTypeSwitch block={block} onSwapSource={onSwapSource} /></span>}
        <div className="ml-auto flex items-center gap-1.5 text-[10px]">
          <button
            onClick={() => copyBlock(block)}
            title={t('block.copyTitle')}
            className="flex items-center gap-1 rounded border border-edge px-2 py-0.5 text-text transition-colors hover:border-accent-deep/50 hover:text-accent-bright"
          >
            <Copy size={11} className="shrink-0" /> {t('block.copy')}
          </button>
          {canPasteValues && (
            <button
              onClick={onPasteValues}
              title={t('block.pasteValuesTitle')}
              className="flex items-center gap-1 rounded border border-edge px-2 py-0.5 text-text transition-colors hover:border-accent-deep/50 hover:text-accent-bright"
            >
              <ClipboardPaste size={11} className="shrink-0" /> {t('block.pasteValues')}
            </button>
          )}
          {/* Analyzers are passive taps — nothing to bypass, so no on/off toggle. */}
          {!isSource && def.kind !== 'analyzer' && (
            <button
              data-tut="block-bypass"
              onClick={onToggle}
              title={block.enabled ? t('block.bypass') : t('block.enable')}
              className={`flex items-center gap-1 rounded border px-2 py-0.5 transition-colors ${
                block.enabled
                  ? 'border-on/50 bg-on/15 text-on-bright'
                  : 'border-edge-2 text-muted'
              }`}
            >
              <Power size={11} className="shrink-0" /> {block.enabled ? t('block.on') : t('block.bypassed')}
            </button>
          )}
          {(!isSource || canRemoveLane) && (
            <ConfirmButton
              onConfirm={onRemove}
              className="flex items-center gap-1 rounded border border-edge px-2 py-0.5 text-text transition-colors hover:border-danger/50 hover:text-danger-bright"
            >
              <X size={11} className="shrink-0" /> {isSource ? t('block.removeLane') : t('block.remove')}
            </ConfirmButton>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-3">
        {block.type === 'sample' && <SampleEditor block={block} soundId={soundId} onParam={onParam} />}
        {block.type === 'samplenv' && <EnvelopeSampleLoader block={block} soundId={soundId} onParam={onParam} />}
        {def.presets && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-faint">{t('block.presets')}</span>
            {def.presets.map((preset) => (
              <button
                key={preset.label}
                onClick={() => Object.entries(preset.params).forEach(([k, v]) => onParam(k, v))}
                className="rounded border border-edge px-2 py-0.5 text-[10px] text-text transition-colors hover:border-edge-hover hover:text-ink"
              >
                {preset.label}
              </button>
            ))}
          </div>
        )}
        {/* Beginner-friendly one-click examples, surfaced from the registry so
            kids can learn by clicking without opening the help modal. */}
        {def.examples?.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-faint">{t('block.examples')}</span>
            {def.examples.map((ex) => (
              <button
                key={ex.label}
                onClick={() => Object.entries(ex.params).forEach(([k, v]) => onParam(k, v))}
                title={ex.hint}
                className="rounded border border-edge px-2 py-0.5 text-[10px] text-text transition-colors hover:border-accent-deep/60 hover:text-accent-bright"
              >
                {ex.label}
              </button>
            ))}
          </div>
        )}

        {/* Synth: two grouped panels (Oscillator | Envelope), each headed by its
            preview canvas. Vocoder: sample loader left, params right. All others:
            params grid alone. */}
        {block.type === 'synth' ? (
          <div className="grid gap-x-8 gap-y-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
            {[['osc', t('block.oscillator'), 'wave'], ['env', t('block.envelope'), 'env']].map(([group, label, which]) => (
              <div key={group} data-tut={group === 'osc' ? 'source-osc' : 'source-env'} className="rounded-lg border border-edge/60 p-3">
                <PanelHeader label={label} titleKey={which === 'wave' ? 'block.oscillator' : 'block.envelope'} textKey={which === 'wave' ? 'block.oscInfo' : 'block.envInfo'} params={visibleParams.filter((p) => p.group === group)} disabledParams={disabledParams} onSelect={onSelect} />
                <SynthPreview params={block.params} which={which} />
                <div className="mt-3">
                  <ParamsGrid visibleParams={visibleParams.filter((p) => p.group === group)} blockParams={block.params} disabledParams={disabledParams} onParam={onParam} />
                </div>
              </div>
            ))}
          </div>
        ) : block.type === 'noise' ? (
          <div className="grid gap-x-8 gap-y-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
            <div className="rounded-lg border border-edge/60 p-3">
              <NoiseColorPicker value={block.params.color} onChange={(v) => onParam('color', v)} />
            </div>
            <div className="rounded-lg border border-edge/60 p-3">
              <PanelHeader label={t('block.envelope')} titleKey="block.envelope" textKey="block.envInfo" params={visibleParams} disabledParams={disabledParams} onSelect={onSelect} />
              <SynthPreview params={block.params} which="env" />
              <div className="mt-3">
                <ParamsGrid visibleParams={visibleParams} blockParams={block.params} disabledParams={disabledParams} onParam={onParam} />
              </div>
            </div>
          </div>
        ) : block.type === 'vocoder' ? (
          <div className="flex w-full items-start gap-6">
            <div className="w-64 shrink-0">
              <EnvelopeSampleLoader block={block} soundId={soundId} onParam={onParam} />
            </div>
            <ParamsGrid visibleParams={visibleParams} blockParams={block.params} disabledParams={disabledParams} onParam={onParam} />
          </div>
        ) : (
          <ParamsGrid visibleParams={visibleParams} blockParams={block.params} disabledParams={disabledParams} onParam={onParam} />
        )}
      </div>

      {helpOpen && <BlockHelpModal type={block.type} onParam={onParam} onClose={() => setHelpOpen(false)} />}
    </div>
  )
}
