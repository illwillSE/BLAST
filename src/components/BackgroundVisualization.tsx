import { useEffect, useRef } from 'react'
import { liveEngine } from '../audio/engine'
import { getColor } from '../theme/colors'

const AUDIO_SIZE = 2048
const MAX_DOTS = 1550
const TAU = Math.PI * 2
const WORD_SCHEDULE = [
  { word: 'BLAST', end: 12000 },
  { word: 'ELLIOT', end: 17000 },
  { word: 'BLAST', end: 29000 },
  { word: 'JACK', end: 34000 },
]

interface Target { x: number; y: number; z: number; phase: number; layer: number; dir: number }
interface Dot { x: number; y: number; z: number; alpha: number; phase: number; layer: number; dir: number; target: Target | null }

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const smooth = (cur: number, target: number, amount: number) => cur + (target - cur) * amount
const ease = (v: number) => v * v * (3 - 2 * v)

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  return () => {
    let t = seed += 0x6D2B79F5
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function resizeCanvas(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; width: number; height: number } {
  const rect = canvas.getBoundingClientRect()
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const w = Math.max(1, Math.round(rect.width * dpr))
  const h = Math.max(1, Math.round(rect.height * dpr))
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { ctx, width: rect.width, height: rect.height }
}

function readOutput(values: Float32Array<ArrayBuffer>): number {
  const meterValue = liveEngine.getOutputLevel()
  const meterLevel = Array.isArray(meterValue) ? Math.max(...meterValue) : meterValue
  const analyser = liveEngine.getNativeOutputAnalyser()
  if (!analyser) return clamp01(Math.pow(clamp01(meterLevel || 0), 0.42))
  analyser.getFloatTimeDomainData(values)
  let sum = 0
  let peak = 0
  for (let i = 0; i < values.length; i++) {
    const raw = values[i] ?? 0
    const v = Number.isFinite(raw) ? raw : 0
    sum += v * v
    const abs = Math.abs(v)
    if (abs > peak) peak = abs
  }
  const rms = Math.sqrt(sum / Math.max(1, values.length))
  const level = clamp01(rms * 12 + peak * 0.65)
  return clamp01(Math.pow(Math.max(level, meterLevel || 0), 0.42))
}

function currentWord(now: number): string {
  const cycle = WORD_SCHEDULE[WORD_SCHEDULE.length - 1]!.end
  const t = now % cycle
  return WORD_SCHEDULE.find((item) => t < item.end)?.word ?? 'BLAST'
}

function buildTextTargets(width: number, height: number, word: string): Target[] {
  const off = document.createElement('canvas')
  off.width = Math.max(1, Math.round(width))
  off.height = Math.max(1, Math.round(height))
  const ctx = off.getContext('2d')!
  const fontFamily = '"Inter", "SF Pro Display", "Arial Black", system-ui, sans-serif'
  let size = Math.min(height * 0.42, width * 0.2)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#fff'
  for (let i = 0; i < 18; i++) {
    ctx.font = `900 ${size}px ${fontFamily}`
    const metrics = ctx.measureText(word)
    const textHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent
    if (metrics.width <= width * 0.78 && textHeight <= height * 0.48) break
    size *= 0.92
  }

  ctx.clearRect(0, 0, off.width, off.height)
  ctx.font = `900 ${size}px ${fontFamily}`
  ctx.fillText(word, width / 2, height * 0.48)

  const data = ctx.getImageData(0, 0, off.width, off.height).data
  const step = Math.max(4, Math.min(7, Math.round(Math.min(width, height) / 95)))
  const candidates: Target[] = []
  const rnd = mulberry32(hashString(`${Math.round(width)}:${Math.round(height)}:${word}`))
  for (let y = 0; y < off.height; y += step) {
    const offset = ((y / step) % 2) * Math.floor(step / 2)
    for (let x = offset; x < off.width; x += step) {
      const idx = ((y * off.width + x) * 4) + 3
      if ((data[idx] ?? 0) > 96) {
        candidates.push({
          x: x - width / 2,
          y: y - height * 0.48,
          z: (rnd() - 0.5) * Math.min(width, height) * 0.1,
          phase: rnd(),
          layer: rnd(),
          dir: rnd() * TAU,
        })
      }
    }
  }
  if (candidates.length <= MAX_DOTS) return candidates
  const stride = candidates.length / MAX_DOTS
  return Array.from({ length: MAX_DOTS }, (_, i) => candidates[Math.floor(i * stride)]!)
}

function syncDots(dots: Dot[], targets: Target[], nearest = false): void {
  if (nearest && dots.length && targets.length) {
    const xs = targets.map((t) => t.x)
    const ys = targets.map((t) => t.y)
    const span = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
    const maxTravel = Math.max(42, span * 0.12)
    const maxTravelSq = maxTravel * maxTravel
    const active = dots
      .map((dot, index) => ({ dot, index }))
      .filter(({ dot }) => dot.alpha > 0.01)
    const assignedDots = new Set<number>()
    const assignedTargets = new Set<number>()
    for (const { dot, index } of active) {
      let best = -1
      let bestD = Infinity
      for (let i = 0; i < targets.length; i++) {
        if (assignedTargets.has(i)) continue
        const t = targets[i]!
        const dx = (dot.x ?? 0) - t.x
        const dy = (dot.y ?? 0) - t.y
        const d = dx * dx + dy * dy
        if (d < bestD) {
          bestD = d
          best = i
        }
      }
      if (best !== -1 && bestD <= maxTravelSq) {
        dot.target = targets[best]!
        assignedDots.add(index)
        assignedTargets.add(best)
      } else {
        dot.target = null
      }
    }

    for (const { dot, index } of active) {
      if (!assignedDots.has(index)) dot.target = null
    }

    const inactive = dots
      .map((dot, index) => ({ dot, index }))
      .filter(({ dot }) => dot.alpha <= 0.01)
    let targetIndex = 0
    let inactiveIndex = 0
    while (targetIndex < targets.length) {
      while (assignedTargets.has(targetIndex) && targetIndex < targets.length) targetIndex++
      if (targetIndex >= targets.length) break
      const t = targets[targetIndex]!
      const reusable = inactive[inactiveIndex]?.dot
      if (reusable) {
        reusable.x = t.x
        reusable.y = t.y
        reusable.z = t.z
        reusable.phase = t.phase
        reusable.layer = t.layer
        reusable.dir = t.dir
        reusable.target = t
        inactiveIndex++
      } else {
        dots.push({
          x: t.x,
          y: t.y,
          z: t.z,
          alpha: 0,
          phase: t.phase,
          layer: t.layer,
          dir: t.dir,
          target: t,
        })
      }
      assignedTargets.add(targetIndex)
    }

    for (const { dot } of inactive.slice(inactiveIndex)) dot.target = null
    return
  }
  while (dots.length < targets.length) {
    const t = targets[dots.length]!
    dots.push({
      x: t.x,
      y: t.y,
      z: t.z,
      alpha: 0,
      phase: t.phase,
      layer: t.layer,
      dir: t.dir,
      target: t,
    })
  }
  for (let i = 0; i < dots.length; i++) {
    dots[i]!.target = targets[i] ?? null
  }
}

export default function BackgroundVisualization({ enabled, onBackgroundClick }: { enabled: boolean; onBackgroundClick?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const draggedRef = useRef(false)
  const audioValuesRef = useRef(new Float32Array(AUDIO_SIZE))
  const dotsRef = useRef<Dot[]>([])
  const targetsRef = useRef<Target[]>([])
  const sizeRef = useRef({ width: 0, height: 0 })
  const wordRef = useRef('')
  const levelRef = useRef(0)
  const fadeRef = useRef(0)
  const zoomLevelRef = useRef(0)
  const rotationRef = useRef({ yaw: 0, pitch: 0 })
  const dragRef = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!enabled) {
      // Off: clear any last-painted frame once and skip the rAF loop entirely,
      // so a disabled visualization costs nothing per frame.
      const { ctx, width, height } = resizeCanvas(canvas)
      ctx.clearRect(0, 0, width, height)
      return
    }
    let raf: number
    const dotColor = getColor('viz-soft')
    const dimColor = getColor('viz-sharp')

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)
      const { ctx, width, height } = resizeCanvas(canvas)
      ctx.clearRect(0, 0, width, height)

      const word = currentWord(now)
      if (
        word !== wordRef.current ||
        Math.abs(width - sizeRef.current.width) > 1 ||
        Math.abs(height - sizeRef.current.height) > 1
      ) {
        const previousWord = wordRef.current
        sizeRef.current = { width, height }
        wordRef.current = word
        targetsRef.current = buildTextTargets(width, height, word)
        syncDots(dotsRef.current, targetsRef.current, !!previousWord && word !== previousWord)
      }

      const audioNow = readOutput(audioValuesRef.current)
      levelRef.current = smooth(levelRef.current, audioNow, audioNow > levelRef.current ? 0.34 : 0.032)
      const audioLevel = levelRef.current
      fadeRef.current = smooth(fadeRef.current, audioNow, audioNow > fadeRef.current ? 0.28 : 0.018)
      const targetZoomLevel = audioLevel > 0.025 ? audioLevel : 0
      zoomLevelRef.current = smooth(
        zoomLevelRef.current,
        targetZoomLevel,
        targetZoomLevel > zoomLevelRef.current ? 0.18 : 0.045,
      )
      const level = 0.025 + audioLevel * 0.975
      const fadeLevel = ease(clamp01(fadeRef.current))
      const audioValues = audioValuesRef.current
      const yaw = Math.sin(now * 0.00024) * 0.36 + rotationRef.current.yaw
      const pitch = Math.sin(now * 0.00017) * 0.12 + rotationRef.current.pitch
      const cosY = Math.cos(yaw)
      const sinY = Math.sin(yaw)
      const cosX = Math.cos(pitch)
      const sinX = Math.sin(pitch)
      const perspective = Math.min(width, height) * 2.4
      const cx = width / 2
      const cy = height * 0.48
      const zoom = 1 + Math.sin(now * 0.0018) * zoomLevelRef.current * 0.055

      for (let i = 0; i < dotsRef.current.length; i++) {
        const dot = dotsRef.current[i]!
        const t = dot.target
        const targetAlpha = t ? 1 : 0
        dot.alpha = smooth(dot.alpha, targetAlpha, targetAlpha ? 0.045 : 0.025)
        if (dot.alpha < 0.01) continue

        if (t) {
          dot.x = smooth(dot.x, t.x, 0.045)
          dot.y = smooth(dot.y, t.y, 0.045)
          dot.z = smooth(dot.z, t.z, 0.045)
          dot.dir = t.dir
        }

        const sampleIndexX = (i * 31 + ((now * 0.1) | 0)) & (AUDIO_SIZE - 1)
        const sampleIndexY = (i * 47 + ((now * 0.073) | 0) + 191) & (AUDIO_SIZE - 1)
        const sampleIndexZ = (i * 19 + ((now * 0.057) | 0) + 389) & (AUDIO_SIZE - 1)
        const rawX = audioValues[sampleIndexX] ?? 0
        const rawY = audioValues[sampleIndexY] ?? 0
        const rawZ = audioValues[sampleIndexZ] ?? 0
        const sampleX = Number.isFinite(rawX) ? rawX : 0
        const sampleY = Number.isFinite(rawY) ? rawY : 0
        const sampleZ = Number.isFinite(rawZ) ? rawZ : 0
        const shimmer = Math.sin(now * 0.0012 + dot.phase * TAU) * (0.45 + level * 1.6)
        const amp = 2.5 + level * 13
        const dir = dot.dir ?? 0
        const x3 = dot.x * zoom + Math.cos(dir) * sampleX * amp * 0.45 + shimmer * 0.08
        const y3 = dot.y * zoom + Math.sin(dir) * sampleY * amp * 0.75 + shimmer
        const z3 = dot.z + sampleZ * (2.5 + level * 9)
        const ry = y3 * cosX - z3 * sinX
        const rzPitch = z3 * cosX + y3 * sinX
        const rx = x3 * cosY + rzPitch * sinY
        const rz = rzPitch * cosY - x3 * sinY
        const scale = perspective / (perspective + rz)
        const x = cx + rx * scale
        const y = cy + ry * scale
        const dotSize = 1

        ctx.globalAlpha = (0.26 + fadeLevel * 0.6) * dot.alpha * (0.75 + dot.layer * 0.25)
        ctx.fillStyle = rz > 0 ? dotColor : dimColor
        ctx.fillRect(Math.round(x), Math.round(y), dotSize, dotSize)
      }
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [enabled])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      onClick={() => { if (!draggedRef.current) onBackgroundClick?.() }}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        draggedRef.current = false
        dragRef.current = {
          x: e.clientX,
          y: e.clientY,
          yaw: rotationRef.current.yaw,
          pitch: rotationRef.current.pitch,
        }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        const drag = dragRef.current
        if (!drag) return
        const dx = e.clientX - drag.x
        const dy = e.clientY - drag.y
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) draggedRef.current = true
        rotationRef.current.yaw = drag.yaw + dx * 0.008
        rotationRef.current.pitch = Math.max(-0.75, Math.min(0.75, drag.pitch - dy * 0.008))
      }}
      onPointerUp={(e) => {
        dragRef.current = null
        try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* not captured */ }
      }}
      onPointerCancel={(e) => {
        dragRef.current = null
        try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* not captured */ }
      }}
      className="absolute inset-0 h-full w-full cursor-grab opacity-80 active:cursor-grabbing"
    />
  )
}
