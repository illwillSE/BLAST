import { useEffect, useRef, useState, useCallback } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'
import toWav from 'audiobuffer-to-wav'
import {
  getSample, setSample, onSampleChange, decodeBlob,
  pushHistory, undoSample, hasHistory,
} from '../audio/sampleCache'
import { cropBuffer, bufferToWavBlob } from '../audio/bufferOps'
import { onPlay } from '../utils/bus'
import { Button } from './ui'
import SampleEditorModal from './SampleEditorModal'

const ACCEPTED = /\.(wav|mp3|ogg|webm|m4a|flac|aiff?)$/i
const REGION_COLOR = 'rgba(245, 158, 11, 0.12)'

// Waveform display with playback cursor, trim region, edit tools, and the
// two ways to fill the sample buffer: file load (drop/browse) and mic.
export default function SampleEditor({ block, soundId, onParam }) {
  const containerRef = useRef(null)
  const cursorRef = useRef(null)
  const animRef = useRef(null)
  const paramsRef = useRef(block.params)
  paramsRef.current = block.params

  const [sample, setSampleState] = useState(() => getSample(block.id))
  const [dragOver, setDragOver] = useState(false)
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState(null)
  const [historyTick, setHistoryTick] = useState(0) // refresh undo-button state
  const [editorOpen, setEditorOpen] = useState(false)
  const recorderRef = useRef(null)

  useEffect(() => onSampleChange((id) => {
    if (id === block.id) setSampleState(getSample(block.id))
  }), [block.id])

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

  // ---- destructive edits --------------------------------------------------

  function applyEdit(fn) {
    const current = getSample(block.id)
    if (!current?.audioBuffer) return
    const next = fn(current.audioBuffer)
    if (!next) return
    pushHistory(block.id)
    setSample(block.id, {
      blob: bufferToWavBlob(next),
      fileName: current.fileName,
      audioBuffer: next,
    })
    setHistoryTick((t) => t + 1)
  }

  function crop() {
    const p = paramsRef.current
    const full = sample.audioBuffer.duration
    applyEdit((buf) => cropBuffer(buf, Math.max(0, p.trimStart ?? 0), Math.min(full, p.trimEnd ?? full)))
    onParam('trimStart', null)
    onParam('trimEnd', null)
  }

  function undo() {
    undoSample(block.id)
    setHistoryTick((t) => t + 1)
  }

  // ---- load & record ------------------------------------------------------

  const loadFile = useCallback(async (file) => {
    setError(null)
    if (!ACCEPTED.test(file.name) && !file.type.startsWith('audio/')) {
      setError('Not an audio file (use WAV, MP3 or OGG)')
      return
    }
    try {
      const audioBuffer = await decodeBlob(file)
      setSample(block.id, { blob: file, fileName: file.name, audioBuffer })
      onParam('trimStart', null)
      onParam('trimEnd', null)
    } catch {
      setError('Could not decode this audio file')
    }
  }, [block.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function startRecording() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const chunks = []
      recorder.ondataavailable = (e) => chunks.push(e.data)
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        try {
          const rawBlob = new Blob(chunks, { type: recorder.mimeType })
          const audioBuffer = await decodeBlob(rawBlob)
          // Store as WAV so saved projects replay identically everywhere.
          const wavBlob = new Blob([toWav(audioBuffer)], { type: 'audio/wav' })
          setSample(block.id, { blob: wavBlob, fileName: 'recording.wav', audioBuffer })
          onParam('trimStart', null)
          onParam('trimEnd', null)
        } catch {
          setError('Recording could not be decoded')
        }
        setRecording(false)
      }
      recorder.start()
      recorderRef.current = recorder
      setRecording(true)
    } catch {
      setError('Microphone access denied')
    }
  }

  function stopRecording() {
    recorderRef.current?.stop()
  }

  function onDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) loadFile(file)
  }

  function browse() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'audio/*,.wav,.mp3,.ogg'
    input.onchange = () => input.files?.[0] && loadFile(input.files[0])
    input.click()
  }

  const trimmed = sample && (block.params.trimStart != null || block.params.trimEnd != null)

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
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
      <div className="mt-2 flex gap-1.5">
        <Button onClick={browse} className="flex-1">Browse…</Button>
        {recording ? (
          <Button onClick={stopRecording} variant="danger" className="flex-1 animate-pulse">
            ■ Stop
          </Button>
        ) : (
          <Button onClick={startRecording} variant="danger" className="flex-1">● Record</Button>
        )}
      </div>
      {error && <div className="mt-1.5 text-[11px] text-red-400">{error}</div>}
      {editorOpen && sample && (
        <SampleEditorModal
          block={block}
          sample={sample}
          onParam={onParam}
          onApplyEdit={applyEdit}
          onCrop={crop}
          onUndo={undo}
          canUndo={hasHistory(block.id)}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </div>
  )
}
