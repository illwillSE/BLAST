// A small melodic step sequencer that *drives the sound's trigger*. It is NOT an
// audio node and lives at the sound level (one per sound, conceptually "at the
// chain end"). Instead of changing the graph, it flattens to the note-event
// list the engine's `trigger()` already understands:
//   a step's chord  → several events at the SAME offset
//   successive steps → events at RISING offsets
// — exactly the shape the polyphony foundation was built for, so chords ring out
// on the Synth/Metal VoicePool for free.
//
// The data model is deliberately layout-agnostic: a flat `steps` array, each
//   step.notes = [{ pitch, len }]   pitch = semitones from the source pitch,
//                                   len   = how many steps the note is held.
// The piano-roll grid (the type-B editor) and any future editor (a step table,
// etc.) render from this same shape, so the UI can be swapped without touching
// playback or persistence.

export const SEQ_MIN_STEPS = 2
export const SEQ_MAX_STEPS = 16

// Visible pitch range of the grid, as semitone offsets from the source's own
// Pitch (0 = the root): two octaves centred on the root. The editor renders rows
// top-to-bottom from `hi` down to `lo`. A constant (not per-sound) so every
// sequencer shows the same range; widen here if more reach is ever needed.
export const SEQ_RANGE = { lo: -12, hi: 12 }

export function newSequencer() {
  return {
    enabled: false,
    bpm: 120, // quarter-note tempo; each step is a 16th note (see stepSeconds)
    gate: 0.9, // note length as a fraction of its span (0–1)
    // A gentle default arpeggio so an enabled-but-untouched sequencer does
    // something musical. Offsets are semitones from the source pitch.
    steps: [
      { notes: [{ pitch: 0, len: 1 }] },
      { notes: [{ pitch: 4, len: 1 }] },
      { notes: [{ pitch: 7, len: 1 }] },
      { notes: [{ pitch: 12, len: 1 }] },
    ],
  }
}

// Seconds per step. Each step is a 16th note (4 per beat), so a 16-step grid is
// exactly one bar at the given quarter-note BPM — the standard sequencer layout.
export function stepSeconds(seq) {
  return (60 / Math.max(1, seq?.bpm ?? 120)) * 0.25
}

// A note's pitch/length, tolerant of the old v1 shape (a bare semitone number)
// in case a project was saved before per-note length existed.
const notePitch = (note) => (typeof note === 'number' ? note : note.pitch)
const noteLen = (note) => (typeof note === 'number' ? 1 : note.len ?? 1)

// Wall-clock end of the sequence (last note's offset + its sounding length), so
// the render / duration window covers a long final note. Zero when inactive.
export function sequenceSpan(seq) {
  if (!seq?.enabled || !seq.steps?.length) return 0
  const step = stepSeconds(seq)
  const gate = seq.gate ?? 0.9
  let end = 0
  seq.steps.forEach((s, i) => {
    for (const note of s.notes ?? []) {
      end = Math.max(end, i * step + Math.max(0.02, noteLen(note) * step * gate))
    }
  })
  return end
}

// Flatten the sequence to the note-event list engine `trigger()` consumes.
// `transpose` (e.g. a held QWERTY-piano key) shifts the WHOLE sequence. When the
// sequencer is disabled we return the bare `transpose` number, so the legacy
// single-note play path (and back-compat in the engine) is untouched.
//
// A note held for `len` steps plays for `len × step × gate`; overlapping notes
// (a long note ringing into later steps) stack on the VoicePool. Rests (steps
// with no notes) contribute no events; several notes in one step form a chord.
export function sequenceToNotes(seq, transpose = 0) {
  if (!seq?.enabled || !seq.steps?.length) return transpose
  const step = stepSeconds(seq)
  const gate = seq.gate ?? 0.9
  const events = []
  seq.steps.forEach((s, i) => {
    for (const note of s.notes ?? []) {
      const duration = Math.max(0.02, noteLen(note) * step * gate)
      events.push({ transpose: notePitch(note) + transpose, offset: i * step, duration })
    }
  })
  return events
}
