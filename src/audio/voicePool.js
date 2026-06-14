import * as Tone from 'tone'

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
  // `gain` is the shared output level — set below unity to leave headroom so a
  // chord of stacked voices sums without slamming the master limiter (cleaner
  // chords at the cost of a slightly quieter single note).
  constructor(VoiceCtor, size, gain = 1) {
    this.output = new Tone.Gain(gain)
    this.voices = []
    for (let i = 0; i < size; i++) {
      const voice = new VoiceCtor()
      voice.connect(this.output)
      this.voices.push(voice)
    }
    this._next = 0
  }

  // Apply param options to every voice (oscillator, envelope, metal params…).
  set(options) {
    this.voices.forEach((v) => v.set(options))
    return this
  }

  // Hand out the next voice, round-robin; cycling back steals the oldest.
  allocate() {
    const voice = this.voices[this._next]
    this._next = (this._next + 1) % this.voices.length
    return voice
  }

  connect(dest) { this.output.connect(dest); return this }
  disconnect(dest) { this.output.disconnect(dest); return this }

  dispose() {
    this.voices.forEach((v) => { try { v.dispose() } catch { /* already gone */ } })
    this.output.dispose()
    return this
  }
}
