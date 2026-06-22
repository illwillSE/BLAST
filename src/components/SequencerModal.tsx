import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Slider, Button } from './ui'
import { useT } from '../state/uiPrefs'
import type { RangeParamDef } from '../blocks/registry'
import type { Sequencer, Sound } from '../types'
import { useModalAnimation, backdropAnim, panelAnim } from './useModalAnimation'
import { onPlay, emitPlay } from '../utils/bus'
import { liveEngine } from '../audio/engine'
import {
  newSequencer, stepSeconds, sequenceToNotes, SEQ_RANGE, SEQ_MIN_STEPS, SEQ_MAX_STEPS,
} from '../audio/sequencer'

const BPM_DEF: RangeParamDef = { key: 'bpm', label: 'Tempo', type: 'range', min: 40, max: 300, step: 1, default: 120, format: (v) => `${Math.round(v)} BPM` }
const GATE_DEF: RangeParamDef = { key: 'gate', label: 'Gate', type: 'range', min: 0.05, max: 1, step: 0.01, default: 0.9, percent: true, format: (v) => `${Math.round(v * 100)}%` }

// Grid cell geometry (px). PITCH is the per-column stride used to translate a
// horizontal drag into a step count.
const CELL_W = 24
const GAP = 2
const PITCH = CELL_W + GAP

// Row label for a semitone offset: 0 is the root, ±12 the octaves.
const rowLabel = (n: number) => (n === 0 ? '0' : `${n > 0 ? '+' : ''}${n}`)

interface ResizeDrag { pitch: number; start: number; startLen: number; maxLen: number; startX: number }

interface GridProps {
  seq: Sequencer
  playCol: number
  onAdd: (step: number, pitch: number) => void
  onRemove: (step: number, pitch: number) => void
  onSetLen: (step: number, pitch: number, len: number) => void
}

// ── The type-B piano roll. The ONLY layout-specific piece: it renders from (and
// edits) the flat `steps` model — each note a { pitch, len } bar that spans `len`
// columns with a right-edge resize handle. Columns are grouped in fours (beats).
function SequencerGrid({ seq, playCol, onAdd, onRemove, onSetLen }: GridProps) {
  const t = useT()
  const rows: number[] = []
  for (let n = SEQ_RANGE.hi; n >= SEQ_RANGE.lo; n--) rows.push(n)
  const cols = seq.steps.length

  // Drag-to-resize a note's length. We listen on window (not the handle) so the
  // drag survives the re-renders each length change triggers.
  const dragRef = useRef<ResizeDrag | null>(null)
  const startDrag = (e: React.PointerEvent, pitch: number, start: number, len: number, maxLen: number) => {
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = { pitch, start, startLen: len, maxLen, startX: e.clientX }
    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      const delta = Math.round((ev.clientX - d.startX) / PITCH)
      onSetLen(d.start, d.pitch, Math.max(1, Math.min(d.maxLen, d.startLen + delta)))
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div className="inline-block select-none">
      {rows.map((n) => {
        const octave = n !== 0 && n % 12 === 0
        // Lay the row out: where notes start (with clamped len) and which columns
        // they cover, so covered columns render nothing (the bar spans them).
        const starts: (number | null)[] = new Array(cols).fill(null)
        const covered: boolean[] = new Array(cols).fill(false)
        for (let i = 0; i < cols; i++) {
          for (const note of seq.steps[i]?.notes ?? []) {
            if (note.pitch !== n) continue
            const len = Math.max(1, Math.min(cols - i, note.len ?? 1))
            starts[i] = len
            for (let k = 0; k < len; k++) covered[i + k] = true
          }
        }

        const cells = []
        for (let i = 0; i < cols; i++) {
          const beat = i % 4 === 0 && i > 0 ? 'ml-1' : ''
          const sLen = starts[i]
          if (sLen != null) {
            const len = sLen
            let maxLen = cols - i // can't extend past a following note in this row
            for (let j = i + 1; j < cols; j++) if (starts[j] != null) { maxLen = j - i; break }
            cells.push(
              <div key={i} style={{ gridColumn: `${i + 1} / span ${len}` }}
                className={`relative flex h-4 items-center overflow-hidden rounded-sm border border-accent-bright bg-accent-deep ${beat}`}>
                <button onClick={() => onRemove(i, n)} className="h-full flex-1" title={t('sequencer.removeNote')} />
                <div
                  onPointerDown={(e) => startDrag(e, n, i, len, maxLen)}
                  title={t('sequencer.dragLength')}
                  className="absolute right-0 top-0 h-full w-2 cursor-ew-resize bg-accent-bright/70 hover:bg-accent-bright"
                />
              </div>,
            )
          } else if (!covered[i]) {
            cells.push(
              <button key={i} onClick={() => onAdd(i, n)} style={{ gridColumn: `${i + 1}` }}
                title={`${t('sequencer.step')} ${i + 1} · ${rowLabel(n)} st`}
                className={`h-4 rounded-sm border border-edge/60 hover:border-accent-deep/60 ${n === 0 ? 'bg-surface' : octave ? 'bg-surface/80' : 'bg-surface/40'} ${beat} ${playCol === i ? 'ring-1 ring-accent-bright/80' : ''}`} />,
            )
          }
        }
        return (
          <div key={n} className="flex items-center gap-1 py-px">
            <span className={`w-8 text-right font-mono text-[10px] tabular-nums ${n === 0 ? 'text-accent-bright' : octave ? 'text-ink-soft' : 'text-faint'}`}>
              {rowLabel(n)}
            </span>
            <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${cols}, ${CELL_W}px)` }}>
              {cells}
            </div>
          </div>
        )
      })}
      {/* step / beat numbers */}
      <div className="mt-1 flex items-center gap-1">
        <span className="w-8" />
        <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${cols}, ${CELL_W}px)` }}>
          {seq.steps.map((_, i) => (
            <span key={i} className={`text-center font-mono text-[10px] ${i % 4 === 0 ? 'ml-1 text-ink-soft' : 'text-faint'} ${playCol === i ? '!text-accent-bright' : ''}`}>
              {i + 1}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

interface SequencerModalProps {
  sound: Sound
  onChange: (patch: Partial<Sequencer>) => void
  onClose: () => void
}

export default function SequencerModal({ sound, onChange, onClose }: SequencerModalProps) {
  const t = useT()
  const seq = sound.sequencer ?? newSequencer()
  const cols = seq.steps.length

  const { entered, handleClose } = useModalAnimation(onClose)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleClose])

  // Playhead: animate a column highlight over one pass when this sound plays.
  const [playCol, setPlayCol] = useState(-1)
  const rafRef = useRef(0)
  useEffect(() => {
    const off = onPlay((info) => {
      if (info.soundId !== sound.id || !seq.enabled) return
      const stepMs = stepSeconds(seq) * 1000
      const start = performance.now()
      cancelAnimationFrame(rafRef.current)
      const tick = () => {
        const i = Math.floor((performance.now() - start) / stepMs)
        if (i >= seq.steps.length) { setPlayCol(-1); return }
        setPlayCol(i)
        rafRef.current = requestAnimationFrame(tick)
      }
      tick()
    })
    return () => { off(); cancelAnimationFrame(rafRef.current) }
  }, [sound.id, seq.enabled, seq.bpm, seq.steps.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Audition the sequence through the live engine (same path as the transport),
  // so the modal has its own Play without focus stealing Space on a grid cell.
  const preview = () => {
    liveEngine.play(sound, sequenceToNotes(sound.sequencer)).then(({ duration }) => {
      emitPlay({ soundId: sound.id, duration })
    })
  }

  // ── step edits (a step with several notes is a chord) ──────────────────────
  const addNote = (step: number, pitch: number) =>
    onChange({ steps: seq.steps.map((s, i) => (i === step ? { ...s, notes: [...(s.notes ?? []), { pitch, len: 1 }] } : s)) })
  const removeNote = (step: number, pitch: number) =>
    onChange({ steps: seq.steps.map((s, i) => (i === step ? { ...s, notes: (s.notes ?? []).filter((no) => no.pitch !== pitch) } : s)) })
  const setLen = (step: number, pitch: number, len: number) =>
    onChange({ steps: seq.steps.map((s, i) => (i === step ? { ...s, notes: (s.notes ?? []).map((no) => (no.pitch === pitch ? { ...no, len } : no)) } : s)) })
  const setStepCount = (next: number) => {
    const n = Math.max(SEQ_MIN_STEPS, Math.min(SEQ_MAX_STEPS, next))
    if (n === cols) return
    const steps = seq.steps.slice(0, n)
    while (steps.length < n) steps.push({ notes: [] })
    onChange({ steps })
  }

  return (
    <div
      className={`fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-6 ${backdropAnim(entered)}`}
      onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div className={`flex max-h-[88vh] w-full max-w-5xl flex-col gap-3 rounded-xl border border-edge bg-panel p-4 shadow-2xl ${panelAnim(entered)}`}>
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-semibold uppercase tracking-wider text-accent">{t('sequencer.title')}</span>
          <button
            onClick={() => onChange({ enabled: !seq.enabled })}
            className={`rounded border px-2 py-0.5 text-[10px] transition-colors ${
              seq.enabled ? 'border-on/50 bg-on/15 text-on-bright' : 'border-edge bg-surface text-muted'
            }`}
          >
            {seq.enabled ? t('sequencer.on') : t('sequencer.off')}
          </button>
          <span className="flex-1 truncate font-mono text-[11px] text-muted">{sound.name}</span>
          <button onClick={handleClose} title={t('common.close')} className="text-muted transition-colors hover:text-ink"><X size={14} /></button>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <Button onClick={preview} variant="primary">{t('sequencer.play')}</Button>
          <div className="w-32"><Slider def={BPM_DEF} value={seq.bpm} onChange={(v) => onChange({ bpm: v })} /></div>
          <div className="w-28"><Slider def={GATE_DEF} value={seq.gate} onChange={(v) => onChange({ gate: v })} /></div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] uppercase tracking-wide text-muted">{t('sequencer.steps')}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setStepCount(cols - 1)} disabled={cols <= SEQ_MIN_STEPS}
                className="flex h-6 w-6 items-center justify-center rounded border border-edge bg-surface text-text transition-colors hover:border-accent-deep/60 disabled:opacity-30">−</button>
              <span className="w-7 text-center font-mono text-[12px] tabular-nums text-ink">{cols}</span>
              <button onClick={() => setStepCount(cols + 1)} disabled={cols >= SEQ_MAX_STEPS}
                className="flex h-6 w-6 items-center justify-center rounded border border-edge bg-surface text-text transition-colors hover:border-accent-deep/60 disabled:opacity-30">+</button>
            </div>
          </div>
        </div>

        <div className="overflow-auto rounded border border-divider bg-well p-3">
          <SequencerGrid seq={seq} playCol={playCol} onAdd={addNote} onRemove={removeNote} onSetLen={setLen} />
        </div>
        <p className="text-[10px] text-faint">
          {t('sequencer.gridHelp')}
        </p>
      </div>
    </div>
  )
}
