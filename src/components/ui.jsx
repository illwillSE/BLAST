import { useEffect, useRef, useState } from 'react'

// Shared control primitives — every control always shows its current value.

export const CAT_STYLES = {
  source: { text: 'text-amber-400', border: 'border-amber-400/30', dot: 'bg-amber-400', glow: 'shadow-amber-500/10' },
  dynamics: { text: 'text-sky-400', border: 'border-sky-400/30', dot: 'bg-sky-400', glow: 'shadow-sky-500/10' },
  filter: { text: 'text-emerald-400', border: 'border-emerald-400/30', dot: 'bg-emerald-400', glow: 'shadow-emerald-500/10' },
  time: { text: 'text-violet-400', border: 'border-violet-400/30', dot: 'bg-violet-400', glow: 'shadow-violet-500/10' },
  pitch: { text: 'text-rose-400', border: 'border-rose-400/30', dot: 'bg-rose-400', glow: 'shadow-rose-500/10' },
  distortion: { text: 'text-orange-400', border: 'border-orange-400/30', dot: 'bg-orange-400', glow: 'shadow-orange-500/10' },
  utility: { text: 'text-slate-400', border: 'border-slate-400/30', dot: 'bg-slate-400', glow: 'shadow-slate-500/10' },
}

function toPos(value, def) {
  if (def.scale === 'log') return Math.log(value / def.min) / Math.log(def.max / def.min)
  return (value - def.min) / (def.max - def.min)
}

function toValue(pos, def) {
  let v
  if (def.scale === 'log') v = def.min * Math.pow(def.max / def.min, pos)
  else v = def.min + (def.max - def.min) * pos
  v = Math.round(v / def.step) * def.step
  return Math.min(def.max, Math.max(def.min, v))
}

export function formatValue(def, value) {
  if (def.format) return def.format(value)
  return `${value}${def.unit || ''}`
}

function stepDecimals(step) {
  const s = String(step)
  return s.includes('.') ? s.split('.')[1].length : 0
}

function ValueEntry({ def, value, onChange, onClose }) {
  // Percent params are edited as whole 0–100 numbers, stored as 0–1.
  const factor = def.percent ? 100 : 1
  const decimals = Math.max(0, stepDecimals(def.step) - (def.percent ? 2 : 0))
  const [draft, setDraft] = useState(String(Number((value * factor).toFixed(decimals))))

  function commit() {
    const parsed = parseFloat(draft.replace(',', '.'))
    if (!Number.isNaN(parsed)) {
      const snapped = Math.round(parsed / factor / def.step) * def.step
      onChange(Math.min(def.max, Math.max(def.min, snapped)))
    }
    onClose()
  }

  return (
    <div className="absolute bottom-full right-0 z-40 mb-1 rounded border border-amber-500/60 bg-slate-950 p-1 shadow-xl">
      <input
        autoFocus
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') onClose()
        }}
        className="w-20 bg-transparent px-1 font-mono text-[12px] text-amber-200 outline-none"
      />
      <div className="px-1 font-mono text-[9px] text-slate-600">
        {Number((def.min * factor).toFixed(decimals))}–{Number((def.max * factor).toFixed(decimals))}
        {def.percent ? '%' : ''}
      </div>
    </div>
  )
}

export function Slider({ def, value, onChange }) {
  const pos = toPos(value, def)
  const fillPct = `${(pos * 100).toFixed(1)}%`
  const [editing, setEditing] = useState(false)
  return (
    <div className="block select-none" title="Double-click slider to reset · double-click value to type it">
      <div className="mb-0.5 flex items-baseline justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wide text-slate-500">{def.label}</span>
        <span className="relative">
          {editing && (
            <ValueEntry def={def} value={value} onChange={onChange} onClose={() => setEditing(false)} />
          )}
          <span
            className="cursor-text font-mono text-[11px] text-slate-200 hover:text-amber-300"
            onDoubleClick={(e) => { e.preventDefault(); setEditing(true) }}
            title="Double-click to enter an exact value"
          >
            {formatValue(def, value)}
          </span>
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={1000}
        value={Math.round(pos * 1000)}
        onChange={(e) => onChange(toValue(e.target.value / 1000, def))}
        onDoubleClick={() => onChange(def.default)}
        onKeyDown={(e) => {
          // The native 1/1000-track nudge rounds away to nothing for coarse
          // steps — make arrows move exactly one parameter step instead.
          const dir = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key]
          if (!dir) return
          e.preventDefault()
          const stepped = (e.shiftKey ? 10 : 1) * dir * def.step + value
          onChange(Math.min(def.max, Math.max(def.min, Math.round(stepped / def.step) * def.step)))
        }}
        className="blast-slider w-full"
        style={{ '--fill': fillPct }}
      />
    </div>
  )
}

export function Select({ def, value, onChange }) {
  return (
    <label className="block select-none">
      <div className="mb-0.5 text-[11px] uppercase tracking-wide text-slate-500">{def.label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-slate-700 bg-slate-900 px-1.5 py-1 font-mono text-[12px] text-slate-200 outline-none focus:border-amber-500/60"
      >
        {def.options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  )
}

// "Draw your own waveform" — a row of draggable bars, one per harmonic, each
// the relative level (0..1) of that partial. The array feeds the synth's
// custom OmniOscillator partials. Drag up/down on a bar to set its level.
export function HarmonicsEditor({ def, value, onChange }) {
  const partials = Array.isArray(value) && value.length ? value : [1]
  const canvasRef = useRef(null)
  const draggingRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const { width, height } = canvas
    ctx.clearRect(0, 0, width, height)
    const slot = width / partials.length
    for (let i = 0; i < partials.length; i++) {
      const v = Math.min(1, Math.max(0, partials[i]))
      const barH = v * (height - 2)
      ctx.fillStyle = i === 0 ? '#fbbf24' : '#d97706' // fundamental brighter than overtones
      ctx.fillRect(i * slot + 1, height - barH, slot - 2, barH)
    }
  }, [partials])

  function setAt(e) {
    const rect = canvasRef.current.getBoundingClientRect()
    const n = partials.length
    const i = Math.min(n - 1, Math.max(0, Math.floor(((e.clientX - rect.left) / rect.width) * n)))
    const v = Math.min(1, Math.max(0, 1 - (e.clientY - rect.top) / rect.height))
    const next = partials.slice()
    next[i] = Math.round(v * 100) / 100
    onChange(next)
  }

  return (
    <div className="block select-none">
      <div className="mb-0.5 text-[11px] uppercase tracking-wide text-slate-500">{def.label}</div>
      <canvas
        ref={canvasRef}
        width={208}
        height={56}
        onPointerDown={(e) => { draggingRef.current = true; e.currentTarget.setPointerCapture(e.pointerId); setAt(e) }}
        onPointerMove={(e) => { if (draggingRef.current) setAt(e) }}
        onPointerUp={() => { draggingRef.current = false }}
        onPointerCancel={() => { draggingRef.current = false }}
        title="Drag the bars to set each harmonic’s level — draw your own waveform"
        className="w-full cursor-crosshair rounded bg-slate-950 touch-none"
      />
    </div>
  )
}

export function ParamControl({ def, value, onChange }) {
  if (def.type === 'select') return <Select def={def} value={value} onChange={onChange} />
  if (def.type === 'harmonics') return <HarmonicsEditor def={def} value={value} onChange={onChange} />
  return <Slider def={def} value={value} onChange={onChange} />
}

// Browse / Record button row + error line, shared by the sample blocks.
export function SampleLoadControls({ recording, onBrowse, onStartRecording, onStopRecording, error }) {
  return (
    <>
      <div className="mt-2 flex gap-1.5">
        <Button onClick={onBrowse} className="flex-1">Browse…</Button>
        {recording ? (
          <Button onClick={onStopRecording} variant="danger" className="flex-1 animate-pulse">■ Stop</Button>
        ) : (
          <Button onClick={onStartRecording} variant="danger" className="flex-1">● Record</Button>
        )}
      </div>
      {error && <div className="mt-1.5 text-[11px] text-red-400">{error}</div>}
    </>
  )
}

export function Button({ children, onClick, variant = 'default', className = '', ...rest }) {
  const variants = {
    default: 'border-slate-700 bg-slate-800/80 text-slate-200 hover:border-slate-500 hover:bg-slate-700/80',
    primary: 'border-amber-500/60 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25',
    danger: 'border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20',
  }
  return (
    <button
      onClick={onClick}
      className={`rounded border px-2.5 py-1 text-[12px] font-medium tracking-wide transition-colors ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
