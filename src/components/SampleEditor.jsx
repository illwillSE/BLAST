import { useEffect, useRef, useState, useCallback } from 'react'
import WaveSurfer from 'wavesurfer.js'
import toWav from 'audiobuffer-to-wav'
import { getSample, setSample, onSampleChange, decodeBlob } from '../audio/sampleCache'
import { onPlay } from '../utils/bus'
import { Button } from './ui'

const ACCEPTED = /\.(wav|mp3|ogg|webm|m4a|flac|aiff?)$/i

// Waveform display with playback cursor, plus the two ways to fill the
// sample buffer: file load (drop/browse) and microphone recording.
export default function SampleEditor({ block, soundId }) {
  const containerRef = useRef(null)
  const wavesurferRef = useRef(null)
  const cursorRef = useRef(null)
  const animRef = useRef(null)
  const [sample, setSampleState] = useState(() => getSample(block.id))
  const [dragOver, setDragOver] = useState(false)
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState(null)
  const recorderRef = useRef(null)

  useEffect(() => onSampleChange((id) => {
    if (id === block.id) setSampleState(getSample(block.id))
  }), [block.id])

  // (Re)draw waveform when the sample changes.
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
    ws.loadBlob(sample.blob)
    wavesurferRef.current = ws
    return () => {
      ws.destroy()
      wavesurferRef.current = null
    }
  }, [sample])

  // Animate the playback cursor when this sound is triggered.
  useEffect(() => onPlay(({ soundId: playedId }) => {
    if (playedId !== soundId || !sample?.audioBuffer || !cursorRef.current) return
    cancelAnimationFrame(animRef.current)
    const rate = Math.pow(2, (block.params.pitch || 0) / 12)
    const duration = sample.audioBuffer.duration / Math.max(0.05, rate)
    const start = performance.now()
    const step = (now) => {
      const t = (now - start) / 1000 / duration
      if (!cursorRef.current) return
      if (t >= 1) {
        cursorRef.current.style.opacity = '0'
        return
      }
      cursorRef.current.style.opacity = '1'
      cursorRef.current.style.left = `${(t * 100).toFixed(2)}%`
      animRef.current = requestAnimationFrame(step)
    }
    animRef.current = requestAnimationFrame(step)
  }), [soundId, sample, block.params.pitch])

  useEffect(() => () => cancelAnimationFrame(animRef.current), [])

  const loadFile = useCallback(async (file) => {
    setError(null)
    if (!ACCEPTED.test(file.name) && !file.type.startsWith('audio/')) {
      setError('Not an audio file (use WAV, MP3 or OGG)')
      return
    }
    try {
      const audioBuffer = await decodeBlob(file)
      setSample(block.id, { blob: file, fileName: file.name, audioBuffer })
    } catch {
      setError('Could not decode this audio file')
    }
  }, [block.id])

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
              className="pointer-events-none absolute top-0 h-full w-px bg-amber-300 opacity-0"
              style={{ left: 0 }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="truncate font-mono text-[10px] text-slate-500" title={sample.fileName}>
              {sample.fileName} · {sample.audioBuffer.duration.toFixed(2)}s
            </span>
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
    </div>
  )
}
