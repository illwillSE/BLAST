import { useEffect, useMemo, useRef } from 'react'
import { extractEnvelope } from '../audio/envelope'
import { SampleLoadControls, InfoDot } from './ui'
import { useT } from '../state/uiPrefs'
import { useSampleLoader } from './useSampleLoader'
import SampleEditorModal from './SampleEditorModal'
import SampleLibraryModal from './SampleLibraryModal'
import { getColor } from '../theme/colors'

// Draws the full amplitude curve with the trimmed region dimmed, so you can see
// the contour the source follows. Clicking opens the full editor — where the
// in/out points are dragged — the same interaction as the Sample source card.
function EnvelopePreview({ audioBuffer, smoothing, amount, trimStart, trimEnd, onOpen }) {
  const t = useT()
  const canvasRef = useRef(null)
  const full = audioBuffer.duration
  const start = Math.max(0, trimStart ?? 0)
  const end = Math.min(full, trimEnd ?? full)

  // The contour depends only on the sample and Amount/Smooth — not the trim —
  // so dragging a handle just repaints the dimming, never re-extracts.
  const curve = useMemo(
    () => extractEnvelope(audioBuffer, { smoothing, amount }),
    [audioBuffer, smoothing, amount],
  )

  // Redraw crisply at the device pixel ratio. A ResizeObserver keeps the
  // backing store matched to the displayed CSS size, so the curve never blurs
  // (DPR) or balloons (the canvas has a fixed CSS height, like the source's
  // WaveSurfer waveform) when the panel width changes.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const draw = () => {
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (!width || !height) return
      const dpr = window.devicePixelRatio || 1
      canvas.width = width * dpr
      canvas.height = height * dpr
      const ctx = canvas.getContext('2d')
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)
      ctx.beginPath()
      for (let i = 0; i < curve.length; i++) {
        const x = (i / (curve.length - 1)) * width
        const y = height - Math.min(1, curve[i]) * (height - 2) - 1
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.strokeStyle = getColor('info')
      ctx.lineWidth = 1.5
      ctx.stroke()
      // Dim everything outside the trim selection.
      const x0 = (start / full) * width
      const x1 = (end / full) * width
      ctx.fillStyle = getColor('well', '9e') // ≈ rgba(2,6,23,0.62)
      ctx.fillRect(0, 0, x0, height)
      ctx.fillRect(x1, 0, width - x1, height)
      // Handle lines at in/out.
      ctx.strokeStyle = getColor('info-bright')
      ctx.lineWidth = 2
      for (const x of [x0, x1]) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
        ctx.stroke()
      }
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [curve, start, end, full])

  return (
    <div className="relative">
      <div
        className="cursor-pointer"
        onClick={onOpen}
        title={t('sample.openEditor')}
      >
        <canvas ref={canvasRef} className="block h-16 w-full rounded bg-well" />
      </div>
      <div className="absolute right-1 top-1">
        <InfoDot text={t('block.sampleEnvInfo')} align="right" />
      </div>
    </div>
  )
}

// File load (drop/browse) and mic recording for the Sample Envelope block,
// plus the shared full editor (zoom, trim, crop/reverse/normalize). Stores
// into the same sample cache keyed by block id, so save/load is free.
export default function EnvelopeSampleLoader({ block, soundId, onParam }) {
  const t = useT()
  const {
    sample, dragOver, recording, error, dragProps,
    browse, loadBlob, startRecording, stopRecording,
    applyEdit, crop, undo, remove, canUndo,
    editorOpen, setEditorOpen,
    libraryOpen, setLibraryOpen,
  } = useSampleLoader(block, onParam)

  const trimmed = sample && (block.params.trimStart != null || block.params.trimEnd != null)

  return (
    <div
      {...dragProps}
      className={`rounded border ${dragOver ? 'border-info bg-info-deep/10' : 'border-edge bg-surface/70'} p-2 transition-colors`}
    >
      {sample ? (
        <div>
          <EnvelopePreview
            audioBuffer={sample.audioBuffer}
            smoothing={block.params.smoothing}
            amount={block.params.amount}
            trimStart={block.params.trimStart}
            trimEnd={block.params.trimEnd}
            onOpen={() => setEditorOpen(true)}
          />
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="truncate font-mono text-[10px] text-muted" title={sample.fileName}>
              {sample.fileName} · {sample.audioBuffer.duration.toFixed(2)}s
              {trimmed && ` · ${t('sample.trimmed')}`}
            </span>
            <button
              onClick={remove}
              title={t('sample.removeEnv')}
              className="shrink-0 text-muted transition-colors hover:text-danger"
            >
              ✕
            </button>
          </div>
        </div>
      ) : (
        <div className="flex h-16 items-center justify-center gap-3 text-center text-[11px] text-muted">
          {recording ? t('sample.recording') : (
            <>
              <span>{t('sample.dropFile')}</span>
              {canUndo && (
                <button
                  onClick={undo}
                  title={t('sample.restoreEnv')}
                  className="rounded border border-edge px-1.5 py-0.5 text-[10px] font-medium text-ink-soft transition-colors hover:border-info-deep/50 hover:text-info-bright"
                >
                  {t('sample.restoreUndo')}
                </button>
              )}
            </>
          )}
        </div>
      )}
      <SampleLoadControls
        block={block}
        recording={recording}
        onBrowse={browse}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        onOpenLibrary={() => setLibraryOpen(true)}
        error={error}
      />
      {editorOpen && sample && (
        <SampleEditorModal
          block={block}
          sample={sample}
          soundId={soundId}
          onParam={onParam}
          onApplyEdit={applyEdit}
          onCrop={crop}
          onUndo={undo}
          canUndo={canUndo}
          onClose={() => setEditorOpen(false)}
        />
      )}
      {libraryOpen && (
        <SampleLibraryModal
          sample={sample}
          onLoad={loadBlob}
          onClose={() => setLibraryOpen(false)}
        />
      )}
    </div>
  )
}
