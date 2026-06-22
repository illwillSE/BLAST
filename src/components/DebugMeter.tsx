import { useEffect, useRef } from 'react'
import { liveEngine } from '../audio/engine'
import type { Block } from '../types'

// Numeric level readout for the Monitor block's `meter` view. Reads the block's
// own analyser tap (signal at this point in the chain) every animation frame —
// same read pattern as OutputVisualizer — and shows live peak/RMS dB plus a held
// max that latches the loudest peak seen across plays until manually reset. The
// `compact` prop tightens the layout for the narrow chain card.

const FLOOR_DB = -100
const toDb = (a: number) => (a > 0 ? Math.max(FLOOR_DB, 20 * Math.log10(a)) : FLOOR_DB)
const fmtDb = (db: number) => (db <= FLOOR_DB ? '−∞ dB' : `${db.toFixed(1)} dB`)
// Map a dB level to a 0–100% bar width over a -60..0 dB window.
const barPct = (db: number) => `${Math.max(0, Math.min(1, (db + 60) / 60)) * 100}%`

interface Held { peak: number; min: number; max: number }

// Held values live outside the component, keyed by block id, so they survive the
// card unmounting (the inspector only mounts the selected block) and the engine
// rebuilding when other blocks are added/removed — only an explicit reset clears
// them. peak = loudest amplitude, min/max = raw sample extremes.
const heldStore = new Map<string, Held>()
const getHeld = (id: string): Held => {
  let h = heldStore.get(id)
  if (!h) {
    h = { peak: 0, min: 0, max: 0 }
    heldStore.set(id, h)
  }
  return h
}

type SpanRef = React.RefObject<HTMLSpanElement>
type DivRef = React.RefObject<HTMLDivElement>

function Meter({ label, valRef, barRef, tickRef, compact }: {
  label: string
  valRef: SpanRef
  barRef: DivRef
  tickRef?: DivRef
  compact: boolean
}) {
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className={`${compact ? 'w-7' : 'w-8'} uppercase tracking-wider text-faint`}>{label}</span>
      <span ref={valRef} className={`${compact ? 'w-14' : 'w-16'} whitespace-nowrap font-mono tabular-nums text-ink-soft`}>−∞ dB</span>
      <div className="relative h-2 flex-1 overflow-hidden rounded bg-well">
        <div ref={barRef} className="h-full bg-accent-deep" style={{ width: '0%' }} />
        {tickRef && (
          <div ref={tickRef} className="absolute top-0 h-full w-0.5 bg-accent-bright" style={{ left: '0%' }} />
        )}
      </div>
    </div>
  )
}

export default function DebugMeter({ block, compact = false }: { block: Block; compact?: boolean }) {
  const peakValRef = useRef<HTMLSpanElement>(null)
  const peakBarRef = useRef<HTMLDivElement>(null)
  const maxValRef = useRef<HTMLSpanElement>(null)
  const maxTickRef = useRef<HTMLDivElement>(null)
  const rmsValRef = useRef<HTMLSpanElement>(null)
  const rmsBarRef = useRef<HTMLDivElement>(null)
  const rangeRef = useRef<HTMLSpanElement>(null)
  const dcRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let raf: number
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const analyser = liveEngine.getAnalyser(block.id)
      if (!analyser) return
      // The Monitor's analyser is shared with the canvas views, which switch it to
      // FFT / smaller sizes. Restore waveform/1024 before reading sample stats; the
      // first frame after retuning is garbage, so skip it (same as OutputVisualizer).
      if (analyser.type !== 'waveform' || analyser.size !== 1024) {
        analyser.type = 'waveform'
        analyser.size = 1024
        return
      }
      const v = analyser.getValue() as Float32Array
      let peak = 0
      let min = 0
      let max = 0
      let sum = 0
      let sumSq = 0
      const n = v.length
      for (let i = 0; i < n; i++) {
        // A blown-up source can push NaN/Inf through the tap; clamp to 0 so a bad
        // signal can't poison the readout (same guard as OutputVisualizer).
        let s = v[i] ?? 0
        if (!Number.isFinite(s)) s = 0
        if (s < min) min = s
        if (s > max) max = s
        const abs = s < 0 ? -s : s
        if (abs > peak) peak = abs
        sum += s
        sumSq += s * s
      }
      const rms = Math.sqrt(sumSq / n)
      const dc = sum / n
      const held = getHeld(block.id)
      held.peak = Math.max(held.peak, peak)
      held.min = Math.min(held.min, min)
      held.max = Math.max(held.max, max)

      const peakDb = toDb(peak)
      if (peakValRef.current) peakValRef.current.textContent = fmtDb(peakDb)
      if (peakBarRef.current) peakBarRef.current.style.width = barPct(peakDb)

      const maxDb = toDb(held.peak)
      if (maxValRef.current) maxValRef.current.textContent = fmtDb(maxDb)
      if (maxTickRef.current) maxTickRef.current.style.left = barPct(maxDb)

      const rmsDb = toDb(rms)
      if (rmsValRef.current) rmsValRef.current.textContent = fmtDb(rmsDb)
      if (rmsBarRef.current) rmsBarRef.current.style.width = barPct(rmsDb)

      if (rangeRef.current) {
        const hi = held.max
        rangeRef.current.textContent = `${held.min.toFixed(3)} / ${hi >= 0 ? '+' : ''}${hi.toFixed(3)}`
      }
      if (dcRef.current) {
        dcRef.current.textContent = Math.abs(dc) > 0.02 ? `DC ${dc >= 0 ? '+' : ''}${dc.toFixed(3)}` : 'DC ✓'
      }
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [block.id])

  const reset = () => {
    const held = getHeld(block.id)
    held.peak = 0
    held.min = 0
    held.max = 0
  }

  return (
    <div className={`flex flex-col ${compact ? 'w-[184px] gap-1.5' : 'w-full max-w-[420px] gap-2'}`}>
      <Meter label="peak" valRef={peakValRef} barRef={peakBarRef} tickRef={maxTickRef} compact={compact} />
      <Meter label="rms" valRef={rmsValRef} barRef={rmsBarRef} compact={compact} />

      <div className="flex items-center justify-between text-[10px]">
        <div className="flex items-center gap-2">
          <span className="uppercase tracking-wider text-faint">held max</span>
          <span ref={maxValRef} className="whitespace-nowrap font-mono tabular-nums text-ink-soft">−∞ dB</span>
        </div>
        <button
          onClick={reset}
          title="Reset held max / min"
          className="rounded border border-edge px-2 py-0.5 text-text transition-colors hover:border-accent-deep/50 hover:text-accent-bright"
        >
          ↺ reset
        </button>
      </div>

      <div className={`text-[10px] ${compact ? 'flex flex-col gap-1' : 'flex items-center gap-3'}`}>
        <div className="flex items-center gap-3">
          <span className="uppercase tracking-wider text-faint">range</span>
          <span ref={rangeRef} className="whitespace-nowrap font-mono tabular-nums text-ink-soft">0.000 / +0.000</span>
        </div>
        <span ref={dcRef} className={`whitespace-nowrap font-mono tabular-nums text-muted ${compact ? '' : 'ml-auto'}`}>DC ✓</span>
      </div>
    </div>
  )
}
