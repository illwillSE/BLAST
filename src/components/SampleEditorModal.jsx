import { useEffect, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'
import ZoomPlugin from 'wavesurfer.js/dist/plugins/zoom.esm.js'
import { reverseBuffer, normalizeBuffer, fadeBuffer } from '../audio/bufferOps'
import { Button } from './ui'

const REGION_COLOR = 'rgba(245, 158, 11, 0.14)'

function ToolButton({ children, onClick, disabled, title }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="rounded border border-slate-700 bg-slate-800/80 px-2 py-1 text-[11px] font-medium text-slate-300 transition-colors hover:border-slate-500 hover:text-slate-100 disabled:cursor-default disabled:opacity-30"
    >
      {children}
    </button>
  )
}

function TimeField({ label, value, onCommit }) {
  const [draft, setDraft] = useState(value.toFixed(3))
  useEffect(() => setDraft(value.toFixed(3)), [value])

  function commit() {
    const parsed = parseFloat(draft.replace(',', '.'))
    if (!Number.isNaN(parsed)) onCommit(parsed)
    else setDraft(value.toFixed(3))
  }

  return (
    <label className="flex items-center gap-1.5">
      <span className="text-[11px] uppercase tracking-wide text-slate-500">{label}</span>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setDraft(value.toFixed(3))
          e.stopPropagation() // keep Esc-in-field from closing the modal
        }}
        className="w-20 rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 font-mono text-[12px] text-slate-200 outline-none focus:border-amber-500/60"
      />
      <span className="text-[10px] text-slate-600">s</span>
    </label>
  )
}

// Full-screen sample editor: zoomable waveform (mouse wheel), draggable
// trim region with exact in/out fields, edit tools, region audition.
export default function SampleEditorModal({
  block, sample, onParam, onApplyEdit, onCrop, onUndo, canUndo, onClose,
}) {
  const containerRef = useRef(null)
  const wsRef = useRef(null)
  const regionRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const paramsRef = useRef(block.params)
  paramsRef.current = block.params

  const full = sample.audioBuffer.duration
  const trimStart = Math.max(0, block.params.trimStart ?? 0)
  const trimEnd = Math.min(full, block.params.trimEnd ?? full)
  const trimmed = block.params.trimStart != null || block.params.trimEnd != null

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!containerRef.current) return
    const ws = WaveSurfer.create({
      container: containerRef.current,
      height: 200,
      waveColor: '#f59e0b88',
      progressColor: '#fbbf24',
      cursorColor: '#fde047',
      cursorWidth: 1,
      interact: false,
      normalize: true,
      autoScroll: true,
      autoCenter: true,
    })
    ws.registerPlugin(ZoomPlugin.create({ scale: 0.35, maxZoom: 2000 }))
    const regions = ws.registerPlugin(RegionsPlugin.create())

    ws.on('decode', (duration) => {
      const p = paramsRef.current
      const start = Math.min(Math.max(0, p.trimStart ?? 0), duration)
      const end = Math.min(p.trimEnd ?? duration, duration)
      const region = regions.addRegion({
        start,
        end: end > start ? end : duration,
        color: REGION_COLOR,
        drag: true,
        resize: true,
      })
      region.on('update-end', () => {
        const atFull = region.start < 0.005 && region.end > duration - 0.005
        onParam('trimStart', atFull ? null : region.start)
        onParam('trimEnd', atFull ? null : region.end)
      })
      regionRef.current = region
    })

    // Stop audition when playback leaves the region.
    ws.on('timeupdate', (t) => {
      const region = regionRef.current
      if (region && ws.isPlaying() && t >= region.end) {
        ws.pause()
        ws.setTime(region.start)
      }
    })
    ws.on('pause', () => setPlaying(false))
    ws.on('play', () => setPlaying(true))

    ws.loadBlob(sample.blob)
    wsRef.current = ws
    return () => {
      ws.destroy()
      wsRef.current = null
      regionRef.current = null
    }
  }, [sample]) // eslint-disable-line react-hooks/exhaustive-deps

  function setTrim(start, end) {
    const s = Math.max(0, Math.min(start, full))
    const e = Math.max(s + 0.002, Math.min(end, full))
    regionRef.current?.setOptions({ start: s, end: e })
    const atFull = s < 0.005 && e > full - 0.005
    onParam('trimStart', atFull ? null : s)
    onParam('trimEnd', atFull ? null : e)
  }

  function audition() {
    const ws = wsRef.current
    if (!ws) return
    if (ws.isPlaying()) {
      ws.pause()
      return
    }
    ws.setTime(regionRef.current?.start ?? 0)
    ws.play()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="flex w-full max-w-5xl flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-2xl">
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-semibold uppercase tracking-wider text-amber-400">
            Sample Editor
          </span>
          <span className="flex-1 truncate font-mono text-[11px] text-slate-500">
            {sample.fileName} · {full.toFixed(2)}s
          </span>
          <button
            onClick={onClose}
            title="Close (Esc)"
            className="text-slate-500 transition-colors hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        <div ref={containerRef} className="rounded border border-slate-800 bg-slate-950/60" />
        <div className="text-[10px] text-slate-600">
          Mouse wheel to zoom · drag the highlighted region's edges to set in/out points
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <Button onClick={audition} variant="primary">
            {playing ? '■ Stop' : '▶ Play region'}
          </Button>
          <TimeField label="In" value={trimStart} onCommit={(v) => setTrim(v, trimEnd)} />
          <TimeField label="Out" value={trimEnd} onCommit={(v) => setTrim(trimStart, v)} />
          <div className="ml-auto flex flex-wrap gap-1.5">
            <ToolButton onClick={onUndo} disabled={!canUndo} title="Undo last edit">↩ Undo</ToolButton>
            <ToolButton onClick={() => onApplyEdit(reverseBuffer)} title="Reverse the sample">Reverse</ToolButton>
            <ToolButton onClick={() => onApplyEdit(normalizeBuffer)} title="Boost to full volume">Normalize</ToolButton>
            <ToolButton onClick={() => onApplyEdit((b) => fadeBuffer(b, 'in'))} title="Fade in the start">Fade in</ToolButton>
            <ToolButton onClick={() => onApplyEdit((b) => fadeBuffer(b, 'out'))} title="Fade out the end">Fade out</ToolButton>
            <ToolButton onClick={onCrop} disabled={!trimmed} title="Cut the sample down to the selected region">
              ✂ Crop
            </ToolButton>
          </div>
        </div>
      </div>
    </div>
  )
}
