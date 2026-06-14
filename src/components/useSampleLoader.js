import { useCallback, useEffect, useRef, useState } from 'react'
import toWav from 'audiobuffer-to-wav'
import {
  getSample, setSample, onSampleChange, decodeBlob,
  pushHistory, undoSample, hasHistory,
} from '../audio/sampleCache'
import { cropBuffer, bufferToWavBlob } from '../audio/bufferOps'

const ACCEPTED = /\.(wav|mp3|ogg|webm|m4a|flac|aiff?)$/i

// Shared sample plumbing for the source-sample and sample-envelope blocks:
// the two ways to fill the buffer (file load + mic), the destructive edit
// tools, and undo — all keyed by block id in the sample cache so save/load is
// free. Each block layers its own preview (waveform vs amplitude curve) and
// the optional full editor on top.
export function useSampleLoader(block, onParam) {
  const [sample, setSampleState] = useState(() => getSample(block.id))
  const [dragOver, setDragOver] = useState(false)
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState(null)
  const [historyTick, setHistoryTick] = useState(0) // refresh undo-button state
  const [editorOpen, setEditorOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const recorderRef = useRef(null)
  const paramsRef = useRef(block.params)
  paramsRef.current = block.params

  useEffect(() => onSampleChange((id) => {
    if (id === block.id) setSampleState(getSample(block.id))
  }), [block.id])

  // A fresh sample replaces the buffer outright — drop any stale trim region.
  const resetTrim = useCallback(() => {
    onParam('trimStart', null)
    onParam('trimEnd', null)
  }, [onParam])

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
      resetTrim()
    } catch {
      setError('Could not decode this audio file')
    }
  }, [block.id, resetTrim])

  const startRecording = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const chunks = []
      recorder.ondataavailable = (e) => chunks.push(e.data)
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        try {
          const audioBuffer = await decodeBlob(new Blob(chunks, { type: recorder.mimeType }))
          // Store as WAV so saved projects replay identically everywhere.
          const wavBlob = new Blob([toWav(audioBuffer)], { type: 'audio/wav' })
          setSample(block.id, { blob: wavBlob, fileName: 'recording.wav', audioBuffer })
          resetTrim()
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
  }, [block.id, resetTrim])

  const stopRecording = useCallback(() => recorderRef.current?.stop(), [])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) loadFile(file)
  }, [loadFile])

  const loadBlob = useCallback(async (blob, fileName) => {
    try {
      const audioBuffer = await decodeBlob(blob)
      setSample(block.id, { blob, fileName, audioBuffer })
      resetTrim()
    } catch {
      setError('Could not decode this audio file')
    }
  }, [block.id, resetTrim])

  const browse = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'audio/*,.wav,.mp3,.ogg'
    input.onchange = () => input.files?.[0] && loadFile(input.files[0])
    input.click()
  }, [loadFile])

  // Props for the dropzone wrapper, identical across blocks.
  const dragProps = {
    onDragOver: (e) => { e.preventDefault(); setDragOver(true) },
    onDragLeave: () => setDragOver(false),
    onDrop,
  }

  // ---- destructive edits --------------------------------------------------

  const applyEdit = useCallback((fn) => {
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
  }, [block.id])

  const crop = useCallback(() => {
    const p = paramsRef.current
    const current = getSample(block.id)
    if (!current?.audioBuffer) return
    const full = current.audioBuffer.duration
    applyEdit((buf) => cropBuffer(buf, Math.max(0, p.trimStart ?? 0), Math.min(full, p.trimEnd ?? full)))
    resetTrim()
  }, [block.id, applyEdit, resetTrim])

  const undo = useCallback(() => {
    undoSample(block.id)
    setHistoryTick((t) => t + 1)
  }, [block.id])

  return {
    sample, dragOver, recording, error, dragProps,
    browse, loadBlob, startRecording, stopRecording,
    applyEdit, crop, undo, canUndo: hasHistory(block.id),
    editorOpen, setEditorOpen,
    libraryOpen, setLibraryOpen,
    historyTick, // exposed so consumers re-render on edit/undo
  }
}
