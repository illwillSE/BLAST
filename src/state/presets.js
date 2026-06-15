import { newLane, newBlock, uid } from './model'
import { DEFAULT_EXPORT } from '../audio/render'

// Demo sounds that exercise every block type and the polyphonic voice pool, so a
// quick listen across the sound list catches regressions after engine changes.
// Built from the model helpers (newLane/newBlock) so params always match the
// registry defaults — each preset just overrides the few values that matter.
//
// Not covered automatically: the three sample-carrying blocks (Sample source,
// Sample Envelope, Vocoder) need actual audio. The "Sample Slot" preset wires
// them up empty so the load UI is one click away.

// A chain/master block with a few params overridden.
const blk = (type, params) => {
  const b = newBlock(type)
  if (params) Object.assign(b.params, params)
  return b
}

// A single-lane sound: one source (with overridden params) + its effects chain,
// plus an optional master chain.
const sound = (name, srcType, srcParams, chain = [], master = []) => {
  const lane = newLane(srcType)
  if (srcParams) Object.assign(lane.params, srcParams)
  lane.chain = chain
  return { id: uid('snd'), name, outputVolume: 0, sources: [lane], master }
}

export function presetSounds() {
  return [
    // — Polyphony: long release, so tapping q/w/e/r in quick succession stacks
    // into a chord instead of cutting off. The headline test for the voice pool.
    sound('Poly Pad — Hold a Chord', 'synth',
      { wave: 'sawtooth', freq: 196, attack: 0.35, decay: 0.3, sustain: 0.8, release: 1.6, duration: 1.2 },
      [blk('visualizer', { mode: 'wave' })],
      [blk('reverb', { decay: 2.5, preDelay: 0.03, wet: 0.38 })]),

    // — Clipping probe: a pure sine has no harmonics, so any clipping/limiter
    // distortion is obvious the moment voices stack. Long release + high sustain
    // so quickly tapping several keys piles up overlapping voices.
    sound('Sine Stack — Clipping Test', 'synth',
      { wave: 'sine', freq: 220, attack: 0.01, decay: 0.1, sustain: 0.9, release: 2.0, duration: 1.5 }),

    // — Pitch Envelope (per-voice): a downward sweep on every note. Overlapping
    // notes should each sweep independently now.
    sound('Laser Zap — Pitch Envelope', 'synth',
      { wave: 'sawtooth', freq: 880, attack: 0.001, decay: 0.12, sustain: 0, release: 0.1, duration: 0.2 },
      [blk('pitchenv', { start: 1200, end: -1200, time: 0.22 })]),

    // — Pitch LFO: vibrato on a sustained lead.
    sound('Siren Lead — Pitch LFO', 'synth',
      { wave: 'triangle', freq: 440, attack: 0.04, decay: 0.2, sustain: 0.85, release: 0.4, duration: 1.4 },
      [blk('pitchlfo', { rate: 6, depth: 90, wave: 'sine' })]),

    // — Detune (unison, structural rebuild) + Filter low-pass.
    sound('Super Saw — Detune + Filter', 'synth',
      { wave: 'sawtooth', freq: 110, attack: 0.02, decay: 0.3, sustain: 0.75, release: 0.6, duration: 1.0 },
      [blk('detune', { amount: 18, count: 6, wet: 0.85 }),
       blk('filter', { filterType: 'lowpass', cutoff: 1600, resonance: 3 })]),

    // — Custom harmonic spectrum (the additive "draw your own wave" path).
    sound('Additive Organ — Custom Harmonics', 'synth',
      { wave: 'custom', harmonics: [1, 0.5, 0.8, 0.25, 0.6, 0.15, 0.35, 0.1],
        freq: 220, attack: 0.02, decay: 0.2, sustain: 0.85, release: 0.4, duration: 1.0 },
      [blk('reverb', { decay: 1.6, preDelay: 0.01, wet: 0.25 })]),

    // — Pulse-width oscillator + ping-pong Delay (structural) + Pan.
    sound('Ping-Pong Keys — Delay + Pan', 'synth',
      { wave: 'pulse', width: 0.3, freq: 330, attack: 0.001, decay: 0.18, sustain: 0.2, release: 0.3, duration: 0.3 },
      [blk('pan', { pan: -0.3 }),
       blk('delay', { time: 0.22, feedback: 0.38, pingpong: true, wet: 0.45 })]),

    // — Bitcrusher + an upward pitch blip: the classic coin/power-up.
    sound('8-Bit Coin — Bitcrusher', 'synth',
      { wave: 'square', freq: 660, attack: 0.001, decay: 0.08, sustain: 0, release: 0.05, duration: 0.12 },
      [blk('pitchenv', { start: 0, end: 700, time: 0.06 }),
       blk('bitcrusher', { bits: 4, wet: 1 })]),

    // — Overdrive + low-pass on a low saw: a dirty bass growl.
    sound('Dirty Bass — Overdrive', 'synth',
      { wave: 'sawtooth', freq: 65, attack: 0.005, decay: 0.25, sustain: 0.7, release: 0.4, duration: 0.8 },
      [blk('overdrive', { drive: 0.6, wet: 1 }),
       blk('filter', { filterType: 'lowpass', cutoff: 1200, resonance: 2 })]),

    // — Dynamics: Compressor then Gate on a short pluck.
    sound('Tight Pluck — Compressor + Gate', 'synth',
      { wave: 'triangle', freq: 330, attack: 0.001, decay: 0.3, sustain: 0.1, release: 0.3, duration: 0.4 },
      [blk('compressor', { threshold: -24, ratio: 4, attack: 0.005, release: 0.15 }),
       blk('gate')]),

    // — Pitch Shift insert (+1 octave, parallel) + a Volume trim + EQ.
    sound('Octave Stack — Pitch Shift + EQ', 'synth',
      { wave: 'triangle', freq: 220, attack: 0.005, decay: 0.3, sustain: 0.6, release: 0.5, duration: 0.9 },
      [blk('pitchshift', { pitch: 12, wet: 0.5 }),
       blk('eq', { low: 2, mid: 0, high: 3 }),
       blk('volume', { volume: -2 })]),

    // — Metal (polyphonic): play bell chords; reverb for air.
    sound('Glass Bell — Metal', 'metal',
      { freq: 440, harmonicity: 3, modIndex: 8, resonance: 1500, octaves: 1, attack: 0.001, decay: 1.2, release: 0.6 },
      [],
      [blk('reverb', { decay: 3, preDelay: 0.02, wet: 0.4 })]),

    // — Metal, noisy + EQ: a trashy cymbal.
    sound('Trash Cymbal — Metal + EQ', 'metal',
      { freq: 300, harmonicity: 5.1, modIndex: 40, resonance: 6000, octaves: 1.5, attack: 0.001, decay: 0.5, release: 0.3 },
      [blk('eq', { low: -8, mid: -2, high: 6 })]),

    // — Noise, percussive: a tight snare.
    sound('Tight Snare — Noise', 'noise',
      { color: 'white', duration: 0.12, attack: 0.001, decay: 0.15, sustain: 0, release: 0.12 }),

    // — Noise, sustained + band-pass + reverb: ocean wind.
    sound('Ocean Wind — Noise + Band-pass', 'noise',
      { color: 'pink', duration: 2.5, attack: 0.6, decay: 0.3, sustain: 0.6, release: 1.5 },
      [blk('filter', { filterType: 'bandpass', cutoff: 600, resonance: 1.5 })],
      [blk('reverb', { decay: 3.5, preDelay: 0.04, wet: 0.4 })]),

    // — Sample chain, wired empty: load a file in the Sample block, then the
    // Sample Envelope and Vocoder blocks are ready to load their own audio too.
    sound('Sample Slot — Load a File', 'sample',
      {},
      [blk('samplenv'), blk('vocoder')]),
  ]
}

export function presetProject() {
  return { name: 'BLAST Presets', version: 1, export: { ...DEFAULT_EXPORT }, sounds: presetSounds() }
}
