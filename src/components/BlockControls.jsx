import { useEffect, useRef, useState } from 'react'
import { BLOCK_DEFS } from '../blocks/registry'
import { liveEngine } from '../audio/engine'
import { CAT_STYLES, ParamControl } from './ui'
import SampleEditor from './SampleEditor'
import EnvelopeSampleLoader from './EnvelopeSampleLoader'
import BlockHelpModal from './BlockHelpModal'

// Live FFT bars for the Spectrum analyzer block, shown in the dock.
function SpectrumCanvas({ blockId }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    let raf
    const draw = () => {
      const canvas = canvasRef.current
      const analyser = liveEngine.getAnalyser(blockId)
      if (canvas) {
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        if (analyser) {
          const values = analyser.getValue()
          const barW = canvas.width / values.length
          ctx.fillStyle = '#34d399'
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
  return <canvas ref={canvasRef} width={256} height={72} className="w-full rounded bg-slate-950" />
}

function SourceTypeSwitch({ block, onSwapSource }) {
  return (
    <div className="inline-grid grid-cols-2 gap-1 rounded bg-slate-950/60 p-0.5">
      {['synth', 'sample'].map((t) => (
        <button
          key={t}
          onClick={() => t !== block.type && onSwapSource(t)}
          className={`rounded px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
            block.type === t ? 'bg-amber-500/20 text-amber-300' : 'text-slate-500 hover:text-slate-300'
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
          className="flex h-4 w-4 items-center justify-center rounded-full border border-slate-600 font-serif text-[9px] italic leading-none text-slate-500 transition-colors hover:border-sky-400/60 hover:text-sky-300"
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
                  ? 'border-emerald-400/50 bg-emerald-400/15 text-emerald-300'
                  : 'border-slate-600 text-slate-500'
              }`}
            >
              ⏻ {block.enabled ? 'on' : 'bypassed'}
            </button>
            <button
              onClick={onRemove}
              title="Remove block"
              className="rounded border border-slate-700 px-2 py-0.5 text-slate-400 transition-colors hover:border-red-400/50 hover:text-red-300"
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
            <span className="text-[10px] uppercase tracking-wider text-slate-600">Presets</span>
            {def.presets.map((preset) => (
              <button
                key={preset.label}
                onClick={() => Object.entries(preset.params).forEach(([k, v]) => onParam(k, v))}
                className="rounded border border-slate-700 px-2 py-0.5 text-[10px] text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-200"
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

      {helpOpen && <BlockHelpModal type={block.type} onClose={() => setHelpOpen(false)} />}
    </div>
  )
}
