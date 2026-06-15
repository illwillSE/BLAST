import { useEffect, useRef } from 'react'
import { liveEngine } from '../audio/engine'
import { getColor } from '../theme/colors'

// Live view of the signal at one block's tap. mode: 'wave' (oscilloscope),
// 'spectrum' (FFT bars), 'fire' (mirrored gradient bars with falling
// peak caps) or 'waterfall' (scrolling spectrogram — frequency across,
// time falling downward, magnitude as color). The analyser is retuned
// per mode in the draw loop since the engine may rebuild it at any time.

// Clip indicator: in the oscilloscope view, a sample from this tap at/above
// 0 dBFS means the signal is hitting the ceiling (being limited / would clip).
// We light the graph red and hold it briefly so a transient clip stays visible.
const CLIP_THRESHOLD = 1.0
const CLIP_HOLD_MS = 700
const CLIP_COLOR = '#ff3b30'

// Waterfall dB window: FFT bin levels span roughly this range during normal
// playback, so map [WF_MIN_DB, WF_MAX_DB] → [0, 1] (then gamma-brighten the
// quiet end) instead of the full -100..0, which left everything near-black.
const WF_MIN_DB = -85
const WF_MAX_DB = -25
const WF_GAMMA = 0.6
export default function OutputVisualizer({ blockId, mode }) {
  const canvasRef = useRef(null)
  const peaksRef = useRef([])
  const clipUntilRef = useRef(0) // timestamp the clip indicator stays lit until

  useEffect(() => {
    let raf
    // Palette tokens resolved once (CSS is loaded by mount); used in the loop.
    const fireLo = getColor('fire-lo')
    const accentDeep = getColor('accent-deep')
    const fireHi = getColor('fire-hi')
    const firePeak = getColor('fire-peak')
    const spectrum = getColor('spectrum')
    const accent = getColor('accent')

    // Waterfall color LUT: magnitude 0..1 → fire gradient, the quiet floor
    // fading into the canvas background. Built lazily on first waterfall frame
    // (not at mount — the palette tokens aren't resolvable until CSS applies,
    // and addColorStop throws on an empty color string).
    let lut = null
    const buildLut = () => {
      const off = document.createElement('canvas')
      off.width = 256
      off.height = 1
      const octx = off.getContext('2d')
      const g = octx.createLinearGradient(0, 0, 256, 0)
      g.addColorStop(0, getColor('well'))
      g.addColorStop(0.15, fireLo)
      g.addColorStop(0.5, accentDeep)
      g.addColorStop(0.8, fireHi)
      g.addColorStop(1, firePeak)
      octx.fillStyle = g
      octx.fillRect(0, 0, 256, 1)
      return octx.getImageData(0, 0, 256, 1).data
    }

    const draw = () => {
      raf = requestAnimationFrame(draw)
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      const { width, height } = canvas
      // The waterfall keeps prior frames and scrolls them; every other mode
      // repaints from scratch.
      if (mode !== 'waterfall') ctx.clearRect(0, 0, width, height)
      if (mode === 'off') return // cleared above — show nothing

      const analyser = liveEngine.getAnalyser(blockId)
      if (!analyser) return

      const wantType = mode === 'wave' ? 'waveform' : 'fft'
      const wantSize = mode === 'wave' ? 1024 : mode === 'fire' ? 64 : 128
      if (analyser.type !== wantType || analyser.size !== wantSize) {
        analyser.type = wantType
        analyser.size = wantSize
        return // first read after retuning is garbage; skip a frame
      }

      const values = analyser.getValue()
      // A blown-up source (e.g. an overdriven Metal hit) can push NaN/Inf
      // through the analyser; clamp non-finite samples to 0 so a bad signal
      // can never blank the display.
      for (let i = 0; i < values.length; i++) {
        if (!Number.isFinite(values[i])) values[i] = 0
      }

      // Clip detection from this tap's own waveform: peak |sample| at/above
      // 0 dBFS lights the indicator, held briefly so brief clips don't flash
      // past. Only meaningful in the time-domain (wave) view.
      if (mode === 'wave') {
        let peak = 0
        for (let i = 0; i < values.length; i++) {
          const a = Math.abs(values[i])
          if (a > peak) peak = a
        }
        if (peak >= CLIP_THRESHOLD) clipUntilRef.current = performance.now() + CLIP_HOLD_MS
      }
      const clipping = performance.now() < clipUntilRef.current

      if (mode === 'waterfall') {
        if (!lut) lut = buildLut()
        // Scroll the existing image down one row, then paint the new spectrum
        // as the top row: frequency across X, magnitude as color.
        ctx.drawImage(canvas, 0, 0, width, height - 1, 0, 1, width, height - 1)
        const n = values.length
        const barW = width / n
        for (let i = 0; i < n; i++) {
          const t = (values[i] - WF_MIN_DB) / (WF_MAX_DB - WF_MIN_DB)
          const norm = Math.max(0, Math.min(1, t)) ** WF_GAMMA // dB window → 0..1, brightened
          const idx = ((norm * 255) | 0) * 4
          ctx.fillStyle = `rgb(${lut[idx]},${lut[idx + 1]},${lut[idx + 2]})`
          ctx.fillRect(i * barW, 0, Math.max(1, barW), 1)
        }
      } else if (mode === 'fire') {
        const peaks = peaksRef.current
        const n = values.length
        const barW = width / n
        const mid = height / 2
        const gradient = ctx.createLinearGradient(0, height, 0, 0)
        gradient.addColorStop(0, fireLo)
        gradient.addColorStop(0.5, accentDeep)
        gradient.addColorStop(1, fireHi)
        ctx.shadowColor = accentDeep
        ctx.shadowBlur = 6
        for (let i = 0; i < n; i++) {
          const norm = Math.max(0, (values[i] + 100) / 100) // dB → 0..1
          peaks[i] = Math.max(norm, (peaks[i] ?? 0) - 0.012) // caps fall slowly
          const h = Math.max(1, norm * mid)
          ctx.fillStyle = gradient
          // mirrored around the center line
          ctx.fillRect(i * barW + 0.5, mid - h, Math.max(1, barW - 1.5), h * 2)
          const peakY = peaks[i] * mid
          if (peakY > 1) {
            ctx.fillStyle = firePeak
            ctx.fillRect(i * barW + 0.5, mid - peakY - 1.5, Math.max(1, barW - 1.5), 1.5)
            ctx.fillRect(i * barW + 0.5, mid + peakY, Math.max(1, barW - 1.5), 1.5)
          }
        }
        ctx.shadowBlur = 0
      } else if (mode === 'spectrum') {
        const barW = width / values.length
        ctx.fillStyle = spectrum
        for (let i = 0; i < values.length; i++) {
          const norm = Math.max(0, (values[i] + 100) / 100) // dB → 0..1
          const h = norm * height
          ctx.fillRect(i * barW, height - h, Math.max(1, barW - 1), h)
        }
      } else {
        ctx.strokeStyle = clipping ? CLIP_COLOR : accent
        ctx.lineWidth = 1.5
        ctx.beginPath()
        const halfH = height / 2 - 1
        for (let i = 0; i < values.length; i++) {
          const x = (i / (values.length - 1)) * width
          const y = height / 2 - values[i] * halfH
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
      }

      // Clip indicator: a red dot + outline so it's obvious the moment the
      // output hits the ceiling. Skipped for the waterfall — that view scrolls
      // its bitmap, so a held/redrawn overlay would smear into a falling red
      // block; clipping there reads as the hottest (near-white) spectrogram rows.
      if (clipping && mode !== 'waterfall') {
        ctx.strokeStyle = CLIP_COLOR
        ctx.lineWidth = 1.5
        ctx.strokeRect(0.75, 0.75, width - 1.5, height - 1.5)
        ctx.fillStyle = CLIP_COLOR
        ctx.beginPath()
        ctx.arc(width - 7, 7, 3.5, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    draw()
    return () => cancelAnimationFrame(raf)
  }, [mode, blockId])

  return <canvas ref={canvasRef} width={184} height={64} className="w-full rounded bg-well" />
}
