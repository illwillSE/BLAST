import { useEffect, useRef } from 'react'
import WaveSurfer from 'wavesurfer.js'
import { onPlay } from '../utils/bus'
import { SampleLoadControls } from './ui'
import { useT } from '../state/uiPrefs'
import { useSampleLoader } from './useSampleLoader'
import SampleEditorModal from './SampleEditorModal'
import SampleLibraryModal from './SampleLibraryModal'
import { getColor } from '../theme/colors'

// Waveform display with playback cursor, trim region, edit tools, and the
// two ways to fill the sample buffer: file load (drop/browse) and mic.
export default function SampleEditor({ block, soundId, onParam }) {
  const t = useT()
  const containerRef = useRef(null)
  const cursorRef = useRef(null)
  const animRef = useRef(null)
  const paramsRef = useRef(block.params)
  paramsRef.current = block.params

  const {
    sample, dragOver, recording, error, dragProps,
    browse, loadBlob, startRecording, stopRecording,
    applyEdit, crop, undo, canUndo,
    editorOpen, setEditorOpen,
    libraryOpen, setLibraryOpen,
  } = useSampleLoader(block, onParam)

  // (Re)draw waveform when the sample changes.
  useEffect(() => {
    if (!containerRef.current || !sample?.blob) return
    const ws = WaveSurfer.create({
      container: containerRef.current,
      height: 64,
      waveColor: getColor('accent-deep', '88'),
      progressColor: getColor('accent-deep', '88'),
      cursorWidth: 0,
      interact: false,
      normalize: true,
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
    // A looping grain cloud has no single sweep — leave the cursor hidden.
    if (p.mode === 'granular' && p.loop) return
    // Granular speed is decoupled from pitch; normal mode is pitch-as-varispeed.
    const rate = p.mode === 'granular' ? Math.max(0.1, p.speed || 1) : Math.pow(2, (p.pitch || 0) / 12)
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
      className={`rounded border ${dragOver ? 'border-accent bg-accent-deep/10' : 'border-edge bg-surface/70'} p-2 transition-colors`}
    >
      {sample ? (
        <div>
          <div
            className="relative cursor-pointer"
            onClick={() => setEditorOpen(true)}
            title={t('sample.openEditor')}
          >
            <div ref={containerRef} />
            <div
              ref={cursorRef}
              className="pointer-events-none absolute top-0 z-10 h-full w-px bg-accent-bright opacity-0"
              style={{ left: 0 }}
            />
          </div>
          <div className="mt-1">
            <span className="truncate font-mono text-[10px] text-muted" title={sample.fileName}>
              {sample.fileName} · {sample.audioBuffer.duration.toFixed(2)}s
              {trimmed && ` · ${t('sample.trimmed')}`}
            </span>
          </div>
        </div>
      ) : (
        <div className="flex h-16 items-center justify-center text-center text-[11px] text-muted">
          {recording ? t('sample.recording') : t('sample.dropFile')}
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
