import { useEffect, useMemo, useRef, useState } from 'react'
import { removeSample } from '../audio/sampleCache'
import { extractEnvelope } from '../audio/envelope'
import { SampleLoadControls } from './ui'
import { useSampleLoader } from './useSampleLoader'
import SampleEditorModal from './SampleEditorModal'

const GRAB_PX = 10 // how close to a handle a click counts as grabbing it

// Draws the full amplitude curve with draggable start/end handles so you can
// trim the contour the source follows — drag a handle to set in/out, the area
// outside the selection is dimmed. Updates live as Amount/Smooth change.
function EnvelopePreview({ audioBuffer, smoothing, amount, trimStart, trimEnd, onParam }) {
  const canvasRef = useRef(null)
  const full = audioBuffer.duration
  // While dragging we hold the in/out locally so we don't thrash app state on
  // every mouse move — committed to params on release.
  const [drag, setDrag] = useState(null) // { side, start, end } | null
  const start = drag ? drag.start : Math.max(0, trimStart ?? 0)
  const end = drag ? drag.end : Math.min(full, trimEnd ?? full)

  // The contour depends only on the sample and Amount/Smooth — not the trim —
  // so dragging a handle just repaints the dimming, never re-extracts.
  const curve = useMemo(
    () => extractEnvelope(audioBuffer, { smoothing, amount }),
    [audioBuffer, smoothing, amount],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const { width, height } = canvas
    ctx.clearRect(0, 0, width, height)
    ctx.beginPath()
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * width
      const y = height - Math.min(1, curve[i]) * (height - 2) - 1
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.strokeStyle = '#38bdf8'
    ctx.lineWidth = 1.5
    ctx.stroke()
    // Dim everything outside the trim selection.
    const x0 = (start / full) * width
    const x1 = (end / full) * width
    ctx.fillStyle = 'rgba(2, 6, 23, 0.62)'
    ctx.fillRect(0, 0, x0, height)
    ctx.fillRect(x1, 0, width - x1, height)
    // Handle lines at in/out.
    ctx.strokeStyle = '#7dd3fc'
    ctx.lineWidth = 2
    for (const x of [x0, x1]) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
    }
  }, [curve, start, end, full])

  function secAt(clientX) {
    const rect = canvasRef.current.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return frac * full
  }

  function onPointerDown(e) {
    const rect = canvasRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const xStart = (start / full) * rect.width
    const xEnd = (end / full) * rect.width
    const side = Math.abs(x - xStart) <= Math.abs(x - xEnd) ? 'start' : 'end'
    // Ignore clicks far from either handle so a stray click can't yank a handle.
    if (Math.abs(x - (side === 'start' ? xStart : xEnd)) > GRAB_PX) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ side, start, end })
  }

  function onPointerMove(e) {
    if (!drag) return
    const sec = secAt(e.clientX)
    setDrag(drag.side === 'start'
      ? { ...drag, start: Math.min(sec, end - 0.02) }
      : { ...drag, end: Math.max(sec, start + 0.02) })
  }

  function onPointerUp() {
    if (!drag) return
    const atFull = drag.start < 0.005 && drag.end > full - 0.005
    onParam('trimStart', atFull ? null : drag.start)
    onParam('trimEnd', atFull ? null : drag.end)
    setDrag(null)
  }

  return (
    <canvas
      ref={canvasRef}
      width={256}
      height={48}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      title="Drag the start / end lines to trim the envelope"
      className="w-full cursor-ew-resize rounded bg-slate-950 touch-none"
    />
  )
}

// File load (drop/browse) and mic recording for the Sample Envelope block,
// plus the shared full editor (zoom, trim, crop/reverse/normalize). Stores
// into the same sample cache keyed by block id, so save/load is free.
export default function EnvelopeSampleLoader({ block, onParam }) {
  const {
    sample, dragOver, recording, error, dragProps,
    browse, startRecording, stopRecording,
    applyEdit, crop, undo, canUndo,
    editorOpen, setEditorOpen,
  } = useSampleLoader(block, onParam)

  const trimmed = sample && (block.params.trimStart != null || block.params.trimEnd != null)

  return (
    <div
      {...dragProps}
      className={`rounded border ${dragOver ? 'border-sky-400 bg-sky-500/10' : 'border-slate-700/80 bg-slate-900/60'} p-2 transition-colors`}
    >
      {sample ? (
        <div>
          <EnvelopePreview
            audioBuffer={sample.audioBuffer}
            smoothing={block.params.smoothing}
            amount={block.params.amount}
            trimStart={block.params.trimStart}
            trimEnd={block.params.trimEnd}
            onParam={onParam}
          />
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="truncate font-mono text-[10px] text-slate-500" title={sample.fileName}>
              {sample.fileName} · {sample.audioBuffer.duration.toFixed(2)}s
              {trimmed && ' · trimmed'}
            </span>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                onClick={() => setEditorOpen(true)}
                title="Open the full-size editor — zoom, exact in/out points, edit tools"
                className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] font-medium text-slate-300 transition-colors hover:border-sky-500/50 hover:text-sky-300"
              >
                ✎ Edit
              </button>
              <button
                onClick={() => removeSample(block.id)}
                title="Remove the envelope sample"
                className="text-slate-600 transition-colors hover:text-red-400"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex h-12 items-center justify-center text-center text-[11px] text-slate-500">
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
