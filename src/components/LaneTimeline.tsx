import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { laneDuration } from '../audio/engine'
import { useT } from '../state/uiPrefs'
import { onPlay } from '../utils/bus'
import { CAT_STYLES } from './ui'
import type { Lane, Sound } from '../types'

// A time-domain view of the lanes, stacked to align with the chain rows below.
// The chain editor's x-axis means signal flow; this strip's x-axis means time.
// Each lane is a bar: left edge = its start `delay` (drag to change), width =
// its computed playing length (read-only). Purely an editing surface for the
// per-lane `delay` param.
const PX_PER_SEC = 200
const SNAP = 0.005

const fmt = (v: number) => (v < 0.001 ? '0' : v < 1 ? `${Math.round(v * 1000)}ms` : `${v.toFixed(2)}s`)

interface DragState { id: string; startX: number; startDelay: number }

export default function LaneTimeline({ sound, onLaneProp }: { sound: Sound; onLaneProp: (laneId: string, key: string, value: number) => void }) {
  const t = useT()
  const [open, setOpen] = useState(true)
  const drag = useRef<DragState | null>(null)

  // Playhead: animate across the timeline over the most recently played sound's
  // duration. Non-interactive (pointer-events-none); a new play cancels and
  // restarts the animation, so only the latest trigger is ever shown.
  const [playheadX, setPlayheadX] = useState<number | null>(null)
  const rafRef = useRef(0)
  useEffect(() => {
    const off = onPlay((info) => {
      if (info.soundId !== sound.id) return
      const durationMs = info.duration * 1000
      const start = performance.now()
      cancelAnimationFrame(rafRef.current)
      const tick = () => {
        const elapsed = performance.now() - start
        if (elapsed >= durationMs) { setPlayheadX(null); return }
        setPlayheadX(elapsed / 1000)
        rafRef.current = requestAnimationFrame(tick)
      }
      tick()
    })
    return () => { off(); cancelAnimationFrame(rafRef.current) }
  }, [sound.id])

  const lanes = sound.sources ?? []
  const spans = lanes.map((lane) => ({ lane, len: laneDuration(lane), delay: lane.delay ?? 0 }))
  const maxEnd = Math.max(1, ...spans.map((s) => s.delay + s.len))
  const width = (maxEnd + 0.25) * PX_PER_SEC

  function onBarDown(e: React.MouseEvent, lane: Lane) {
    e.preventDefault()
    drag.current = { id: lane.id, startX: e.clientX, startDelay: lane.delay ?? 0 }
    const move = (ev: MouseEvent) => {
      if (!drag.current) return
      const dx = (ev.clientX - drag.current.startX) / PX_PER_SEC
      let v = Math.max(0, drag.current.startDelay + dx)
      v = Math.round(v / SNAP) * SNAP
      onLaneProp(drag.current.id, 'delay', v)
    }
    const up = () => {
      drag.current = null
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  // Second tick marks for the ruler.
  const ticks: number[] = []
  for (let tk = 0; tk <= maxEnd + 0.25; tk += 0.5) ticks.push(tk)

  return (
    <div className="border-b border-divider bg-panel/60">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 px-4 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-text hover:text-ink"
      >
        {open ? <ChevronDown size={12} className="shrink-0 text-faint" /> : <ChevronRight size={12} className="shrink-0 text-faint" />}
        {t('laneTimeline.heading')}
      </button>

      {open && (
        <div className="overflow-x-auto px-4 pb-3">
          <div className="relative" style={{ width }}>
            {/* ruler */}
            <div className="relative mb-1 h-4 border-b border-divider">
              {ticks.map((tk) => (
                <div key={tk} className="absolute top-0 text-[9px] text-faint" style={{ left: tk * PX_PER_SEC }}>
                  <div className="h-2 w-px bg-edge" />
                  <span className="absolute left-0.5 top-0">{tk === 0 ? '0' : `${tk.toFixed(1)}s`}</span>
                </div>
              ))}
            </div>

            {/* one bar per lane */}
            <div className="space-y-1">
              {spans.map(({ lane, len, delay }, i) => {
                const cat = CAT_STYLES.source
                const muted = !lane.enabled
                return (
                  <div key={lane.id} className="relative h-6">
                    <div
                      onMouseDown={(e) => onBarDown(e, lane)}
                      title={`${t('laneTimeline.lane')} ${i + 1} — ${t('laneTimeline.start')} ${fmt(delay)}, ${t('laneTimeline.length')} ${fmt(len)}. ${t('laneTimeline.dragOffset')}`}
                      className={`absolute top-0 flex h-6 cursor-ew-resize items-center overflow-hidden rounded border ${cat.border} bg-accent-deep/15 px-1.5 ${
                        muted ? 'opacity-40' : ''
                      }`}
                      style={{ left: delay * PX_PER_SEC, width: Math.max(8, len * PX_PER_SEC) }}
                    >
                      <span className="truncate text-[10px] font-medium text-accent-soft">
                        {i + 1} · {lane.type}{delay > 0.001 ? ` @${fmt(delay)}` : ''}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            {playheadX !== null && (
              <div
                className="pointer-events-none absolute top-0 bottom-0 w-px bg-accent-deep"
                style={{ left: playheadX * PX_PER_SEC }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
