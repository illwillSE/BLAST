import { useEffect, useRef, useState } from 'react'
import { BLOCK_DEFS } from '../blocks/registry'
import { liveEngine } from '../audio/engine'
import { CAT_STYLES, ParamControl } from './ui'
import SampleEditor from './SampleEditor'
import EnvelopeSampleLoader from './EnvelopeSampleLoader'
import BlockHelpModal from './BlockHelpModal'
import { getColor } from '../theme/colors'

// Live FFT bars for the Spectrum analyzer block, shown in the dock.
function SpectrumCanvas({ blockId }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    let raf
    const spectrum = getColor('spectrum')
    const draw = () => {
      const canvas = canvasRef.current
      const analyser = liveEngine.getAnalyser(blockId)
      if (canvas) {
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        if (analyser) {
          const values = analyser.getValue()
          const barW = canvas.width / values.length
          ctx.fillStyle = spectrum
          for (let i = 0; i < values.length; i++) {
            const norm = Math.max(0, (values[i] + 100) / 100)
            const h = norm * canvas.height
            ctx.fillRect(i * barW, canvas.height - h, Math.max(1, barW - 1), h)
          }
        }
      }
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [blockId])
  return <canvas ref={canvasRef} width={256} height={72} className="w-full rounded bg-well" />
}

function SourceTypeSwitch({ block, onSwapSource }) {
  return (
    <div className="inline-grid grid-cols-3 gap-1 rounded bg-well p-0.5">
      {['synth', 'metal', 'sample'].map((t) => (
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

function ParamsGrid({ visibleParams, blockParams, disabledParams, onParam }) {
  return (
    <div className="grid gap-x-8 gap-y-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
      {visibleParams.map((p) => {
        const lockedBy = disabledParams?.get(p.key)
        return (
          <div
            key={p.key}
            style={p.type === 'harmonics' ? { gridColumn: 'span 2' } : undefined}
            className={lockedBy ? 'pointer-events-none opacity-40' : undefined}
            title={lockedBy ? `Overridden by the ${lockedBy} block` : undefined}
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
  block, soundId, isSource, onParam, onToggle, onRemove, onSwapSource, disabledParams,
}) {
  const def = BLOCK_DEFS[block.type]
  const cat = CAT_STYLES[def.category]
  const [helpOpen, setHelpOpen] = useState(false)

  const visibleParams = def.params.filter((p) => !p.show || p.show(block.params))

  return (
    <div className="min-w-[280px] w-full">
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${cat.dot}`} />
        <span className={`text-[12px] font-semibold uppercase tracking-wider ${cat.text}`}>{def.name}</span>
        <button
          onClick={() => setHelpOpen(true)}
          title={`What does ${def.name} do?`}
          className="flex h-4 w-4 items-center justify-center rounded-full border border-edge-2 font-serif text-[9px] italic leading-none text-muted transition-colors hover:border-info/60 hover:text-info-bright"
        >
          i
        </button>
        {isSource && <span className="ml-1"><SourceTypeSwitch block={block} onSwapSource={onSwapSource} /></span>}
        {!isSource && (
          <div className="ml-auto flex items-center gap-1.5 text-[10px]">
            <button
              onClick={onToggle}
              title={block.enabled ? 'Bypass' : 'Enable'}
              className={`rounded border px-2 py-0.5 transition-colors ${
                block.enabled
                  ? 'border-on/50 bg-on/15 text-on-bright'
                  : 'border-edge-2 text-muted'
              }`}
            >
              ⏻ {block.enabled ? 'on' : 'bypassed'}
            </button>
            <button
              onClick={onRemove}
              title="Remove block"
              className="rounded border border-edge px-2 py-0.5 text-text transition-colors hover:border-danger/50 hover:text-danger-bright"
            >
              ✕ remove
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 space-y-3">
        {block.type === 'sample' && <SampleEditor block={block} soundId={soundId} onParam={onParam} />}
        {block.type === 'samplenv' && <EnvelopeSampleLoader block={block} onParam={onParam} />}
        {block.type === 'analyzer' && <SpectrumCanvas blockId={block.id} />}
        {def.presets && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-faint">Presets</span>
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

        {/* Vocoder: sample loader left, params right. All others: params grid alone. */}
        {block.type === 'vocoder' ? (
          <div className="flex w-full items-start gap-6">
            <div className="w-64 shrink-0">
              <EnvelopeSampleLoader block={block} onParam={onParam} />
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
