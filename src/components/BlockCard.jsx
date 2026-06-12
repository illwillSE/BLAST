import { useEffect, useRef, useState } from 'react'
import { BLOCK_DEFS } from '../blocks/registry'
import { liveEngine } from '../audio/engine'
import { CAT_STYLES, ParamControl, formatValue } from './ui'
import SampleEditor from './SampleEditor'

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
          const values = analyser.getValue() // dB, -Infinity..0
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
  return <canvas ref={canvasRef} width={192} height={64} className="w-full rounded bg-slate-950" />
}

function SourceTypeSwitch({ block, onSwapSource }) {
  return (
    <div className="mb-2 grid grid-cols-2 gap-1 rounded bg-slate-950/60 p-0.5">
      {['synth', 'sample'].map((t) => (
        <button
          key={t}
          onClick={() => t !== block.type && onSwapSource(t)}
          className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
            block.type === t ? 'bg-amber-500/20 text-amber-300' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  )
}

export default function BlockCard({
  block, soundId, isSource, onParam, onToggle, onRemove, onSwapSource,
  dragProps,
}) {
  const def = BLOCK_DEFS[block.type]
  const cat = CAT_STYLES[def.category]
  const [expanded, setExpanded] = useState(true)
  const disabled = !isSource && !block.enabled

  const summary = def.params.slice(0, 2)
    .map((p) => `${p.label} ${formatValue(p, block.params[p.key])}`)
    .join(' · ')

  return (
    <div
      className={`shrink-0 self-start rounded-lg border bg-slate-900/80 shadow-lg transition-opacity ${cat.border} ${cat.glow} ${
        disabled ? 'opacity-45' : ''
      } ${block.type === 'sample' ? 'w-72' : 'w-52'}`}
      {...dragProps}
    >
      <div
        className="flex cursor-pointer items-center gap-1.5 border-b border-slate-800 px-2.5 py-1.5"
        onClick={() => setExpanded((e) => !e)}
        title={def.description}
      >
        <span className="cursor-grab text-slate-600" title="Drag to reorder">⠿</span>
        <span className={`h-1.5 w-1.5 rounded-full ${cat.dot}`} />
        <span className={`flex-1 truncate text-[12px] font-semibold uppercase tracking-wider ${cat.text}`}>
          {def.name}
        </span>
        {!isSource && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); onToggle() }}
              title={block.enabled ? 'Bypass' : 'Enable'}
              className={`flex h-4 w-4 items-center justify-center rounded-full border text-[9px] leading-none transition-colors ${
                block.enabled
                  ? 'border-emerald-400/60 bg-emerald-400/20 text-emerald-300'
                  : 'border-slate-600 text-slate-600'
              }`}
            >
              ⏻
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onRemove() }}
              title="Remove block"
              className="text-slate-600 transition-colors hover:text-red-400"
            >
              ✕
            </button>
          </>
        )}
      </div>

      {expanded ? (
        <div className="space-y-2 p-2.5">
          {isSource && <SourceTypeSwitch block={block} onSwapSource={onSwapSource} />}
          {block.type === 'sample' && <SampleEditor block={block} soundId={soundId} onParam={onParam} />}
          {block.type === 'analyzer' && <SpectrumCanvas blockId={block.id} />}
          {def.params.map((p) => (
            <ParamControl
              key={p.key}
              def={p}
              value={block.params[p.key]}
              onChange={(v) => onParam(p.key, v)}
            />
          ))}
        </div>
      ) : (
        <div className="truncate px-2.5 py-1.5 font-mono text-[10px] text-slate-500">
          {summary || 'click to expand'}
        </div>
      )}
    </div>
  )
}
