import { useState } from 'react'
import { newSequencer } from '../audio/sequencer'
import SequencerModal from './SequencerModal'

// Dock panel for the sound-level sequencer: a compact summary + a one-line
// pattern strip, with the full piano-roll editor in a pop-out modal (the dock is
// too short for a two-octave grid). On/off lives here for quick toggling.
export default function SequencerEditor({ sound, onChange }) {
  const seq = sound.sequencer ?? newSequencer()
  const [open, setOpen] = useState(false)
  const noteCount = seq.steps.reduce((n, s) => n + (s.notes?.length ?? 0), 0)

  return (
    <div className="min-w-[240px]">
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-wider text-ink-soft">Sequencer</span>
        <button
          onClick={() => onChange({ enabled: !seq.enabled })}
          className={`ml-auto rounded border px-2 py-0.5 text-[10px] transition-colors ${
            seq.enabled ? 'border-on/50 bg-on/15 text-on-bright' : 'border-edge bg-surface text-muted'
          }`}
        >
          {seq.enabled ? '⏻ on' : '⏻ off'}
        </button>
      </div>

      <div className="mt-3 font-mono text-[11px] text-muted">
        {seq.bpm} BPM · {seq.steps.length} steps · {noteCount} note{noteCount === 1 ? '' : 's'}
      </div>

      {/* one-line pattern strip: which steps carry notes (read-only preview) */}
      <div className="mt-2 flex gap-0.5">
        {seq.steps.map((s, i) => (
          <span
            key={i}
            className={`h-3 flex-1 rounded-sm ${i % 4 === 0 && i > 0 ? 'ml-1' : ''} ${
              (s.notes?.length ?? 0) > 0 ? 'bg-accent-deep' : 'bg-surface'
            }`}
          />
        ))}
      </div>

      <button
        onClick={() => setOpen(true)}
        className="mt-3 flex items-center gap-1.5 rounded-lg border border-edge bg-surface px-3 py-1.5 text-[11px] font-semibold text-ink-soft transition-colors hover:border-accent-deep/60 hover:text-ink"
      >
        Edit pattern ↗
      </button>

      {open && <SequencerModal sound={sound} onChange={onChange} onClose={() => setOpen(false)} />}
    </div>
  )
}
