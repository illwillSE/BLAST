import { useEffect, useRef } from 'react'
import { liveEngine } from '../audio/engine'
import { getColor } from '../theme/colors'

// Live view of the sound's final output. mode: 'wave' (oscilloscope),
// 'spectrum' (FFT bars) or 'fire' (mirrored gradient bars with falling
// peak caps). The analyser is retuned per mode in the draw loop since
// the engine may rebuild it at any time.
export default function OutputVisualizer({ mode }) {
  const canvasRef = useRef(null)
  const peaksRef = useRef([])

  useEffect(() => {
    let raf
    // Palette tokens resolved once (CSS is loaded by mount); used in the loop.
    const fireLo = getColor('fire-lo')
    const accentDeep = getColor('accent-deep')
    const fireHi = getColor('fire-hi')
    const firePeak = getColor('fire-peak')
    const spectrum = getColor('spectrum')
    const accent = getColor('accent')

    const draw = () => {
      raf = requestAnimationFrame(draw)
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      const { width, height } = canvas
      ctx.clearRect(0, 0, width, height)

      const analyser = liveEngine.getOutputAnalyser()
      if (!analyser) return

      const wantType = mode === 'wave' ? 'waveform' : 'fft'
      const wantSize = mode === 'wave' ? 1024 : mode === 'fire' ? 64 : 128
      if (analyser.type !== wantType || analyser.size !== wantSize) {
        analyser.type = wantType
        analyser.size = wantSize
        return // first read after retuning is garbage; skip a frame
      }

      const values = analyser.getValue()

      if (mode === 'fire') {
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
        ctx.strokeStyle = accent
        ctx.lineWidth = 1.5
        ctx.beginPath()
        for (let i = 0; i < values.length; i++) {
          const x = (i / (values.length - 1)) * width
          const y = height / 2 - values[i] * (height / 2 - 1)
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
    }

    draw()
    return () => cancelAnimationFrame(raf)
  }, [mode])

  return <canvas ref={canvasRef} width={184} height={64} className="w-full rounded bg-well" />
}
