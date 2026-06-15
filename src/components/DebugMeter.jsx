import { useEffect, useRef } from 'react'
import { liveEngine } from '../audio/engine'

// Inline meter body for the Debug block. Reads the block's own analyser tap
// (signal at this point in the chain) every animation frame — same read pattern
// as OutputVisualizer — and shows live peak/RMS dB plus a held max that latches
// the loudest peak seen across plays until manually reset.

const FLOOR_DB = -100
const toDb = (a) => (a > 0 ? Math.max(FLOOR_DB, 20 * Math.log10(a)) : FLOOR_DB)
const fmtDb = (db) => (db <= FLOOR_DB ? '−∞ dB' : `${db.toFixed(1)} dB`)
// Map a dB level to a 0–100% bar width over a -60..0 dB window.
const barPct = (db) => `${Math.max(0, Math.min(1, (db + 60) / 60)) * 100}%`

// Held values live outside the component, keyed by block id, so they survive the
// card unmounting (the inspector only mounts the selected block) and the engine
// rebuilding when other blocks are added/removed — only an explicit reset clears
// them. peak = loudest amplitude, min/max = raw sample extremes.
const heldStore = new Map()
const getHeld = (id) => {
  let h = heldStore.get(id)
  if (!h) {
    h = { peak: 0, min: 0, max: 0 }
    heldStore.set(id, h)
  }
  return h
}

function Meter({ label, valRef, barRef, tickRef }) {
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className="w-8 uppercase tracking-wider text-faint">{label}</span>
      <span ref={valRef} className="w-16 font-mono text-ink-soft">−∞ dB</span>
      <div className="relative h-2 flex-1 overflow-hidden rounded bg-well">
        <div ref={barRef} className="h-full bg-accent-deep" style={{ width: '0%' }} />
        {tickRef && (
          <div ref={tickRef} className="absolute top-0 h-full w-0.5 bg-accent-bright" style={{ left: '0%' }} />
        )}
      </div>
    </div>
  )
}

export default function DebugMeter({ block }) {
  const peakValRef = useRef(null)
  const peakBarRef = useRef(null)
  const maxValRef = useRef(null)
  const maxTickRef = useRef(null)
  const rmsValRef = useRef(null)
  const rmsBarRef = useRef(null)
  const rangeRef = useRef(null)
  const dcRef = useRef(null)

  useEffect(() => {
    let raf
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const analyser = liveEngine.getAnalyser(block.id)
      if (!analyser) return
      const v = analyser.getValue()
      let peak = 0
      let min = 0
      let max = 0
      let sum = 0
      let sumSq = 0
      const n = v.length
      for (let i = 0; i < n; i++) {
        // A blown-up source can push NaN/Inf through the tap; clamp to 0 so a bad
        // signal can't poison the readout (same guard as OutputVisualizer).
        let s = v[i]
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
    <div className="flex w-full max-w-[420px] flex-col gap-2">
      <Meter label="peak" valRef={peakValRef} barRef={peakBarRef} tickRef={maxTickRef} />
      <Meter label="rms" valRef={rmsValRef} barRef={rmsBarRef} />

      <div className="flex items-center justify-between text-[10px]">
        <div className="flex items-center gap-2">
          <span className="uppercase tracking-wider text-faint">held max</span>
          <span ref={maxValRef} className="font-mono text-ink-soft">−∞ dB</span>
        </div>
        <button
          onClick={reset}
          title="Reset held max / min"
          className="rounded border border-edge px-2 py-0.5 text-text transition-colors hover:border-accent-deep/50 hover:text-accent-bright"
        >
          ↺ reset
        </button>
      </div>

      <div className="flex items-center gap-3 text-[10px]">
        <span className="uppercase tracking-wider text-faint">range</span>
        <span ref={rangeRef} className="font-mono text-ink-soft">0.000 / +0.000</span>
        <span ref={dcRef} className="ml-auto font-mono text-muted">DC ✓</span>
      </div>
    </div>
  )
}
