import { newLane, newBlock, uid } from './model'
import { DEFAULT_EXPORT } from '../audio/render'

// Demo sounds that exercise every block type and the polyphonic voice pool, so a
// quick listen across the sound list catches regressions after engine changes.
// Built from the model helpers (newLane/newBlock) so params always match the
// registry defaults — each preset just overrides the few values that matter.
//
// Kept to the fewest sounds that still cover every registry block while staying
// musically coherent: one sound per source type is mandatory (a sound has exactly
// one source), and synth gets a second so no chain is overcrowded — 5 sounds, each
// of the 21 block types appearing at least once.
//
// The three sample-carrying blocks (Sample source, Sample Envelope, Vocoder) need
// actual audio. The "Sample Slot" preset wires them up empty so the load UI is one
// click away.

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
    // — Synth pad. Polyphony headline (long release → tapping q/w/e/r stacks into
    // a chord), plus Detune (unison, structural rebuild), Filter low-pass, Pitch
    // LFO vibrato, a Monitor scope tap, and Reverb on the master.
    // Covers: synth · detune · filter · pitchlfo · monitor · reverb.
    sound('Poly Pad — Super Saw', 'synth',
      { wave: 'sawtooth', freq: 196, attack: 0.35, decay: 0.3, sustain: 0.8, release: 1.6, duration: 1.2 },
      [blk('detune', { amount: 18, count: 6, wet: 0.85 }),
       blk('filter', { filterType: 'lowpass', cutoff: 1600, resonance: 3 }),
       blk('pitchlfo', { rate: 6, depth: 90, wave: 'sine' }),
       blk('monitor', { mode: 'wave' })],
      [blk('reverb', { decay: 2.5, preDelay: 0.03, wet: 0.38 })]),

    // — Chiptune blip: pulse-width oscillator, an upward Pitch Envelope (the
    // coin/power-up), Bitcrusher grit, ping-pong Delay (structural), Pan, and a
    // Volume trim.
    // Covers: pitchenv · bitcrusher · delay · pan · volume.
    sound('8-Bit Zap — Chiptune', 'synth',
      { wave: 'pulse', width: 0.3, freq: 660, attack: 0.001, decay: 0.1, sustain: 0, release: 0.06, duration: 0.14 },
      [blk('pitchenv', { start: 0, end: 700, time: 0.06 }),
       blk('bitcrusher', { bits: 4, wet: 1 }),
       blk('delay', { time: 0.22, feedback: 0.38, pingpong: true, wet: 0.45 }),
       blk('pan', { pan: -0.3 }),
       blk('volume', { volume: -2 })]),

    // — Metal (polyphonic) bell run dirtied up: Overdrive grit, EQ tilt, a +1
    // octave Pitch Shift shimmer (parallel), and Reverb on the master.
    // Covers: metal · overdrive · eq · pitchshift · reverb.
    sound('Overdriven Bell — Metal', 'metal',
      { freq: 440, harmonicity: 3, modIndex: 8, resonance: 1500, octaves: 1, attack: 0.001, decay: 1.2, release: 0.6 },
      [blk('overdrive', { drive: 0.5, wet: 0.8 }),
       blk('eq', { low: -4, mid: 0, high: 5 }),
       blk('pitchshift', { pitch: 12, wet: 0.5 })],
      [blk('reverb', { decay: 3, preDelay: 0.02, wet: 0.4 })]),

    // — Noise snare through the dynamics pair: Compressor then Gate.
    // Covers: noise · compressor · gate.
    sound('Gated Snare — Noise', 'noise',
      { color: 'white', duration: 0.18, attack: 0.001, decay: 0.15, sustain: 0, release: 0.12 },
      [blk('compressor', { threshold: -24, ratio: 4, attack: 0.005, release: 0.15 }),
       blk('gate')]),

    // — Sample chain, wired empty: load a file in the Sample block, then the
    // Sample Envelope and Vocoder blocks are ready to load their own audio too.
    // Covers: sample · samplenv · vocoder.
    sound('Sample Slot — Load a File', 'sample',
      {},
      [blk('samplenv'), blk('vocoder')]),
  ]
}

export function presetProject() {
  return { name: 'BLAST Presets', version: 1, export: { ...DEFAULT_EXPORT }, sounds: presetSounds() }
}
