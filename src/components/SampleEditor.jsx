import { useEffect, useRef } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'
import { onPlay } from '../utils/bus'
import { SampleLoadControls } from './ui'
import { useSampleLoader } from './useSampleLoader'
import SampleEditorModal from './SampleEditorModal'

const REGION_COLOR = 'rgba(245, 158, 11, 0.12)'

// Waveform display with playback cursor, trim region, edit tools, and the
// two ways to fill the sample buffer: file load (drop/browse) and mic.
export default function SampleEditor({ block, soundId, onParam }) {
  const containerRef = useRef(null)
  const cursorRef = useRef(null)
  const animRef = useRef(null)
  const paramsRef = useRef(block.params)
  paramsRef.current = block.params

  const {
    sample, dragOver, recording, error, dragProps,
    browse, startRecording, stopRecording,
    applyEdit, crop, undo, canUndo,
    editorOpen, setEditorOpen,
  } = useSampleLoader(block, onParam)

  // (Re)draw waveform + trim region when the sample changes.
  useEffect(() => {
    if (!containerRef.current || !sample?.blob) return
    const ws = WaveSurfer.create({
      container: containerRef.current,
      height: 64,
      waveColor: '#f59e0b88',
      progressColor: '#f59e0b88',
      cursorWidth: 0,
      interact: false,
      normalize: true,
    })
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
        // Full-width region means "no trim" — store nothing.
        const atFull = region.start < 0.005 && region.end > duration - 0.005
        onParam('trimStart', atFull ? null : region.start)
        onParam('trimEnd', atFull ? null : region.end)
      })
    })
    ws.loadBlob(sample.blob)
    return () => ws.destroy()
  }, [sample, block.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Animate the playback cursor across the trimmed range when triggered.
  useEffect(() => onPlay(({ soundId: playedId }) => {
    if (playedId !== soundId || !sample?.audioBuffer || !cursorRef.current) return
    cancelAnimationFrame(animRef.current)
    const p = paramsRef.current
    const full = sample.audioBuffer.duration
    const trimStart = Math.max(0, p.trimStart ?? 0)
    const trimEnd = Math.min(full, p.trimEnd ?? full)
    const rate = Math.pow(2, (p.pitch || 0) / 12)
    const duration = Math.max(0.01, (trimEnd - trimStart) / Math.max(0.05, rate))
    const start = performance.now()
    const step = (now) => {
      const t = (now - start) / 1000 / duration
      if (!cursorRef.current) return
      if (t >= 1) {
        cursorRef.current.style.opacity = '0'
        return
      }
      const posSec = trimStart + t * (trimEnd - trimStart)
      cursorRef.current.style.opacity = '1'
      cursorRef.current.style.left = `${((posSec / full) * 100).toFixed(2)}%`
      animRef.current = requestAnimationFrame(step)
    }
    animRef.current = requestAnimationFrame(step)
  }), [soundId, sample])

  useEffect(() => () => cancelAnimationFrame(animRef.current), [])

  const trimmed = sample && (block.params.trimStart != null || block.params.trimEnd != null)

  return (
    <div
      {...dragProps}
      className={`rounded border ${dragOver ? 'border-amber-400 bg-amber-500/10' : 'border-slate-700/80 bg-slate-900/60'} p-2 transition-colors`}
    >
      {sample ? (
        <div>
          <div className="relative">
            <div ref={containerRef} />
            <div
              ref={cursorRef}
              className="pointer-events-none absolute top-0 z-10 h-full w-px bg-amber-300 opacity-0"
              style={{ left: 0 }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="truncate font-mono text-[10px] text-slate-500" title={sample.fileName}>
              {sample.fileName} · {sample.audioBuffer.duration.toFixed(2)}s
              {trimmed && ' · trimmed'}
            </span>
            <button
              onClick={() => setEditorOpen(true)}
              title="Open the full-size editor — zoom, exact in/out points, edit tools"
              className="shrink-0 rounded border border-slate-700 px-1.5 py-0.5 text-[10px] font-medium text-slate-300 transition-colors hover:border-amber-500/50 hover:text-amber-300"
            >
              ✎ Edit
            </button>
          </div>
        </div>
      ) : (
        <div className="flex h-16 items-center justify-center text-center text-[11px] text-slate-500">
          {recording ? 'Recording…' : 'Drop an audio file here'}
        </div>
      )}
      <SampleLoadControls
        recording={recording}
        onBrowse={browse}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        error={error}
      />
      {editorOpen && sample && (
        <SampleEditorModal
          block={block}
          sample={sample}
          onParam={onParam}
          onApplyEdit={applyEdit}
          onCrop={crop}
          onUndo={undo}
          canUndo={canUndo}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </div>
  )
}
