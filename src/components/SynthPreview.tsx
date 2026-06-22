import { useEffect, useRef } from 'react'
import { getColor } from '../theme/colors'
import type { SynthParams } from '../types'

// Size the backing store to the element's real pixel size so lines stay crisp
// on hi-dpi / when CSS stretches the canvas. Returns a context already scaled to
// CSS-pixel coordinates plus the CSS width/height to draw against.
function setupCanvas(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; width: number; height: number } {
  const dpr = window.devicePixelRatio || 1
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  return { ctx, width, height }
}

// Amplitude (-1..1) of the oscillator at `phase` (0..1 = one cycle), mirroring
// the wave types `oscillatorOptions` maps to in registry.js. The band-limited
// `partials` count is intentionally ignored here — the preview draws the ideal
// shape, which is close enough to read at a glance.
function waveAt(p: SynthParams, phase: number): number {
  switch (p.wave) {
    case 'sine':
      return Math.sin(2 * Math.PI * phase)
    case 'triangle':
      return 2 * Math.abs(2 * (phase - Math.floor(phase + 0.5))) - 1
    case 'square':
      return phase < 0.5 ? 1 : -1
    case 'pulse':
      // width shifts the duty cycle the same way Tone's pulse does (-0.95..0.95).
      return phase < 0.5 + (p.width ?? 0) / 2 ? 1 : -1
    case 'custom': {
      const h = Array.isArray(p.harmonics) && p.harmonics.length ? p.harmonics : [1]
      let v = 0
      for (let k = 0; k < h.length; k++) v += h[k]! * Math.sin(2 * Math.PI * (k + 1) * phase)
      return v
    }
    case 'sawtooth':
    default:
      return 2 * (phase - Math.floor(phase + 0.5))
  }
}

function drawWave(canvas: HTMLCanvasElement, p: SynthParams): void {
  const { ctx, width, height } = setupCanvas(canvas)
  const mid = height / 2
  const amp = mid - 1.5
  // Two cycles for readability; normalize custom waves so the spectrum peak fills.
  const cycles = 2
  let peak = 1
  if (p.wave === 'custom') {
    for (let i = 0; i <= 128; i++) peak = Math.max(peak, Math.abs(waveAt(p, i / 128)))
  }
  ctx.beginPath()
  for (let x = 0; x <= width; x++) {
    const phase = ((x / width) * cycles) % 1
    const y = mid - (waveAt(p, phase) / peak) * amp
    if (x === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.strokeStyle = getColor('accent')
  ctx.lineWidth = 1
  ctx.stroke()
}

function drawEnv(canvas: HTMLCanvasElement, p: SynthParams): void {
  const { ctx, width, height } = setupCanvas(canvas)
  const pad = 1
  const top = pad
  const bottom = height - pad
  const span = bottom - top
  const a = p.attack ?? 0
  const d = p.decay ?? 0
  const s = Math.min(1, Math.max(0, p.sustain ?? 0))
  const r = p.release ?? 0
  // The note is gated on for `duration` (Length), then released — so the sustain
  // is held for whatever's left of the note after attack+decay.
  const hold = Math.max(0, (p.duration ?? 0) - a - d)
  const total = a + d + hold + r || 1
  const xAt = (t: number) => (t / total) * width
  const yAt = (lvl: number) => bottom - lvl * span

  // Faint sustain-level guide.
  ctx.strokeStyle = getColor('accent', '33')
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, yAt(s))
  ctx.lineTo(width, yAt(s))
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(xAt(0), yAt(0))
  ctx.lineTo(xAt(a), yAt(1))
  ctx.lineTo(xAt(a + d), yAt(s))
  ctx.lineTo(xAt(a + d + hold), yAt(s))
  ctx.lineTo(xAt(a + d + hold + r), yAt(0))
  ctx.strokeStyle = getColor('accent')
  ctx.lineWidth = 1
  ctx.stroke()
}

// Read-only preview of one synth facet — `which` 'wave' draws the oscillator
// cycle, 'env' draws the ADSR envelope. Redraws from `params` on every tweak
// (and on resize, to stay crisp) — pure math, no audio nodes.
export default function SynthPreview({ params, which }: { params: SynthParams; which: 'wave' | 'env' }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const draw = () => {
      if (!ref.current) return
      if (which === 'env') drawEnv(ref.current, params)
      else drawWave(ref.current, params)
    }
    draw()
    const ro = new ResizeObserver(draw)
    if (ref.current) ro.observe(ref.current)
    return () => ro.disconnect()
  }, [params, which])

  return <canvas ref={ref} className="h-9 w-full rounded bg-well ring-1 ring-divider/60" />
}
