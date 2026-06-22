import * as Tone from 'tone'

// A voice is a monophonic Tone instrument the pool drives — Tone.Synth or
// Tone.MetalSynth. Both expose `.detune`, an amplitude `.envelope`, and
// triggerAttackRelease, which is all the engine's pitch/trigger path needs.
export type PoolVoice = Tone.Synth | Tone.MetalSynth

// A fixed pool of monophonic Tone voices (Synth / MetalSynth) sharing one
// output, so a single source can play chords and overlapping notes.
//
// We roll our own instead of using Tone.PolySynth because the engine needs to
// reach **each voice's `.detune` Signal** to wire the pitch LFO and schedule the
// pitch envelope per voice. PolySynth hides its voices (created lazily) and
// exposes `detune` only as a settable value, not a connectable Signal — so pitch
// modulation can't fan out to its voices.
//
// Voices are pre-allocated. A Tone.Synth/MetalSynth gates its oscillator with its
// own amplitude envelope and only starts it on triggerAttack, so idle voices cost
// nothing until played. `allocate()` hands them out round-robin, stealing the
// oldest when the index wraps.
export class VoicePool {
  readonly output: Tone.Gain
  readonly polyGain: number
  readonly voices: PoolVoice[]
  private _next: number

  // `gain` is the shared output level — set below unity to leave headroom so a
  // chord of stacked voices sums without slamming the master limiter (cleaner
  // chords at the cost of a slightly quieter single note).
  constructor(VoiceCtor: new () => PoolVoice, size: number, gain = 1) {
    this.output = new Tone.Gain(gain)
    // Remember the poly headroom so mono can drop it: in mono only one voice
    // ever sounds, so the chord-summing headroom is pure level loss.
    this.polyGain = gain
    this.voices = []
    for (let i = 0; i < size; i++) {
      const voice = new VoiceCtor()
      voice.connect(this.output)
      this.voices.push(voice)
    }
    this._next = 0
  }

  // Apply param options to every voice (oscillator, envelope, metal params…).
  // Options are a Synth/MetalSynth set() bag; the union of voice set() signatures
  // is too narrow to express, so this stays an opaque record bridged with a cast.
  set(options: Record<string, unknown>): this {
    this.voices.forEach((v) => v.set(options as never))
    return this
  }

  // Mono runs at full gain (single voice, no chord stacking); poly restores the
  // construction headroom. Called from the engine's build + apply, no rebuild.
  setVoicing(mono: boolean): this {
    this.output.gain.value = mono ? 1 : this.polyGain
    return this
  }

  // Hand out the next voice, round-robin; cycling back steals the oldest.
  allocate(): PoolVoice {
    const voice = this.voices[this._next]!
    this._next = (this._next + 1) % this.voices.length
    return voice
  }

  connect(dest: Tone.InputNode): this { this.output.connect(dest); return this }
  disconnect(dest: Tone.InputNode): this { this.output.disconnect(dest); return this }

  dispose(): this {
    this.voices.forEach((v) => { try { v.dispose() } catch { /* already gone */ } })
    this.output.dispose()
    return this
  }
}
