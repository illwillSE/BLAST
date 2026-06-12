import * as Tone from 'tone'

// Param types:
//   { key, label, type:'range', min, max, step, default, unit, scale?:'log', format? }
//   { key, label, type:'select', options:[{value,label}], default }
//
// Block kinds:
//   'source'   — generates audio (synth, sample)
//   'insert'   — audio effect in the chain
//   'control'  — modulates the source's pitch, not in the audio path (pitch LFO / pitch env)
//   'analyzer' — taps the signal for visualization, audio passes through unchanged

export const CATEGORIES = [
  { id: 'source', label: 'Sources', color: 'amber' },
  { id: 'dynamics', label: 'Dynamics', color: 'sky' },
  { id: 'filter', label: 'Filter', color: 'emerald' },
  { id: 'time', label: 'Time', color: 'violet' },
  { id: 'pitch', label: 'Pitch', color: 'rose' },
  { id: 'distortion', label: 'Distortion', color: 'orange' },
  { id: 'utility', label: 'Utility', color: 'slate' },
]

// Pitch-step multipliers for a unison stack: ceil(n/2) above, floor(n/2)
// below, e.g. n=4 -> [1, 2, -1, -2]. Negative `amount` mirrors naturally.
function unisonOffsets(count) {
  const offsets = []
  for (let k = 1; k <= Math.ceil(count / 2); k++) offsets.push(k)
  for (let k = 1; k <= Math.floor(count / 2); k++) offsets.push(-k)
  return offsets
}

const wave = (def = 'sawtooth') => ({
  key: 'wave',
  label: 'Wave',
  type: 'select',
  options: ['sine', 'square', 'sawtooth', 'triangle'].map((v) => ({ value: v, label: v })),
  default: def,
})

// percent: true — shown as 0–100%; manual entry uses whole percent, not 0–1
const wet = (def = 0.5) => ({
  key: 'wet', label: 'Mix', type: 'range', min: 0, max: 1, step: 0.01, default: def, percent: true,
  format: (v) => `${Math.round(v * 100)}%`,
})

const hz = (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}kHz` : `${Math.round(v)}Hz`)
const db = (v) => `${v.toFixed(1)}dB`
const sec = (v) => (v < 1 ? `${Math.round(v * 1000)}ms` : `${v.toFixed(2)}s`)
const cents = (v) => `${v > 0 ? '+' : ''}${Math.round(v)}ct`
const semis = (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}st`

export const BLOCK_DEFS = {
  // ---------------------------------------------------------------- sources
  synth: {
    type: 'synth',
    name: 'Synth',
    category: 'source',
    kind: 'source',
    description: 'Oscillator with envelope',
    params: [
      wave('sawtooth'),
      { key: 'freq', label: 'Pitch', type: 'range', min: 30, max: 4000, step: 1, default: 220, scale: 'log', format: hz },
      { key: 'duration', label: 'Length', type: 'range', min: 0.05, max: 4, step: 0.01, default: 0.4, format: sec },
      { key: 'attack', label: 'Attack', type: 'range', min: 0.001, max: 2, step: 0.001, default: 0.01, scale: 'log', format: sec },
      { key: 'decay', label: 'Decay', type: 'range', min: 0.01, max: 2, step: 0.01, default: 0.1, scale: 'log', format: sec },
      { key: 'sustain', label: 'Sustain', type: 'range', min: 0, max: 1, step: 0.01, default: 0.7, percent: true, format: (v) => `${Math.round(v * 100)}%` },
      { key: 'release', label: 'Release', type: 'range', min: 0.01, max: 4, step: 0.01, default: 0.3, scale: 'log', format: sec },
    ],
    create(params) {
      const synth = new Tone.Synth({
        oscillator: { type: params.wave },
        envelope: { attack: params.attack, decay: params.decay, sustain: params.sustain, release: params.release },
      })
      return { nodes: { synth }, input: null, output: synth }
    },
    apply({ synth }, params) {
      synth.oscillator.type = params.wave
      synth.envelope.attack = params.attack
      synth.envelope.decay = params.decay
      synth.envelope.sustain = params.sustain
      synth.envelope.release = params.release
    },
  },

  sample: {
    type: 'sample',
    name: 'Sample',
    category: 'source',
    kind: 'source',
    description: 'Load an audio file or record from the microphone',
    params: [
      { key: 'pitch', label: 'Pitch', type: 'range', min: -24, max: 24, step: 0.1, default: 0, format: semis },
      { key: 'gain', label: 'Gain', type: 'range', min: -24, max: 12, step: 0.1, default: 0, format: db },
    ],
    create(params) {
      const gain = new Tone.Volume(params.gain)
      return { nodes: { gain }, input: null, output: gain }
    },
    apply({ gain }, params) {
      gain.volume.value = params.gain
    },
  },

  // --------------------------------------------------------------- dynamics
  compressor: {
    type: 'compressor',
    name: 'Compressor',
    category: 'dynamics',
    kind: 'insert',
    description: 'Evens out loud and quiet parts',
    params: [
      { key: 'threshold', label: 'Threshold', type: 'range', min: -60, max: 0, step: 0.5, default: -24, format: db },
      { key: 'ratio', label: 'Ratio', type: 'range', min: 1, max: 20, step: 0.1, default: 4, format: (v) => `${v.toFixed(1)}:1` },
      { key: 'attack', label: 'Attack', type: 'range', min: 0.001, max: 0.5, step: 0.001, default: 0.01, scale: 'log', format: sec },
      { key: 'release', label: 'Release', type: 'range', min: 0.01, max: 1, step: 0.01, default: 0.2, scale: 'log', format: sec },
    ],
    create(p) {
      const node = new Tone.Compressor({ threshold: p.threshold, ratio: p.ratio, attack: p.attack, release: p.release })
      return { nodes: { node }, input: node, output: node }
    },
    apply({ node }, p) {
      node.threshold.value = p.threshold
      node.ratio.value = p.ratio
      node.attack.value = p.attack
      node.release.value = p.release
    },
  },

  gate: {
    type: 'gate',
    name: 'Gate',
    category: 'dynamics',
    kind: 'insert',
    description: 'Silences audio below a threshold',
    params: [
      { key: 'threshold', label: 'Threshold', type: 'range', min: -80, max: 0, step: 0.5, default: -40, format: db },
      { key: 'smoothing', label: 'Smooth', type: 'range', min: 0.01, max: 0.5, step: 0.01, default: 0.05, format: sec },
    ],
    create(p) {
      const node = new Tone.Gate(p.threshold, p.smoothing)
      return { nodes: { node }, input: node, output: node }
    },
    apply({ node }, p) {
      node.threshold = p.threshold
      node.smoothing = p.smoothing
    },
  },

  // ----------------------------------------------------------------- filter
  filter: {
    type: 'filter',
    name: 'Filter',
    category: 'filter',
    kind: 'insert',
    description: 'Low-pass / high-pass / band-pass filter',
    params: [
      { key: 'filterType', label: 'Type', type: 'select', default: 'lowpass',
        options: [{ value: 'lowpass', label: 'low-pass' }, { value: 'highpass', label: 'high-pass' }, { value: 'bandpass', label: 'band-pass' }] },
      { key: 'cutoff', label: 'Cutoff', type: 'range', min: 40, max: 18000, step: 1, default: 800, scale: 'log', format: hz },
      { key: 'resonance', label: 'Reso', type: 'range', min: 0.1, max: 20, step: 0.1, default: 1, scale: 'log', format: (v) => v.toFixed(1) },
    ],
    create(p) {
      const node = new Tone.Filter(p.cutoff, p.filterType)
      node.Q.value = p.resonance
      return { nodes: { node }, input: node, output: node }
    },
    apply({ node }, p) {
      node.type = p.filterType
      node.frequency.value = p.cutoff
      node.Q.value = p.resonance
    },
  },

  eq: {
    type: 'eq',
    name: 'EQ',
    category: 'filter',
    kind: 'insert',
    description: 'Three-band tone control',
    params: [
      { key: 'low', label: 'Low', type: 'range', min: -24, max: 24, step: 0.5, default: 0, format: db },
      { key: 'mid', label: 'Mid', type: 'range', min: -24, max: 24, step: 0.5, default: 0, format: db },
      { key: 'high', label: 'High', type: 'range', min: -24, max: 24, step: 0.5, default: 0, format: db },
    ],
    create(p) {
      const node = new Tone.EQ3(p.low, p.mid, p.high)
      return { nodes: { node }, input: node, output: node }
    },
    apply({ node }, p) {
      node.low.value = p.low
      node.mid.value = p.mid
      node.high.value = p.high
    },
  },

  // ------------------------------------------------------------------- time
  reverb: {
    type: 'reverb',
    name: 'Reverb',
    category: 'time',
    kind: 'insert',
    description: 'Adds space and ambience',
    params: [
      { key: 'decay', label: 'Decay', type: 'range', min: 0.1, max: 10, step: 0.1, default: 2, scale: 'log', format: sec },
      { key: 'preDelay', label: 'Pre-delay', type: 'range', min: 0, max: 0.2, step: 0.001, default: 0.01, format: sec },
      wet(0.4),
    ],
    tailSeconds: (p) => p.decay,
    create(p) {
      const node = new Tone.Reverb({ decay: p.decay, preDelay: p.preDelay, wet: p.wet })
      return { nodes: { node }, input: node, output: node, ready: node.ready }
    },
    apply({ node }, p) {
      node.decay = p.decay
      node.preDelay = p.preDelay
      node.wet.value = p.wet
    },
  },

  delay: {
    type: 'delay',
    name: 'Delay',
    category: 'time',
    kind: 'insert',
    description: 'Repeating echoes',
    params: [
      { key: 'time', label: 'Time', type: 'range', min: 0.02, max: 1, step: 0.01, default: 0.25, format: sec },
      { key: 'feedback', label: 'Feedback', type: 'range', min: 0, max: 0.92, step: 0.01, default: 0.4, percent: true, format: (v) => `${Math.round(v * 100)}%` },
      wet(0.4),
    ],
    tailSeconds: (p) => Math.min(8, p.time * (1 / Math.max(0.05, 1 - p.feedback))),
    create(p) {
      const node = new Tone.FeedbackDelay({ delayTime: p.time, feedback: p.feedback, wet: p.wet })
      return { nodes: { node }, input: node, output: node }
    },
    apply({ node }, p) {
      node.delayTime.value = p.time
      node.feedback.value = p.feedback
      node.wet.value = p.wet
    },
  },

  // ------------------------------------------------------------------ pitch
  pitchshift: {
    type: 'pitchshift',
    name: 'Pitch Shift',
    category: 'pitch',
    kind: 'insert',
    description: 'Shifts pitch up or down without changing speed',
    params: [
      { key: 'pitch', label: 'Shift', type: 'range', min: -24, max: 24, step: 0.5, default: 0, format: semis },
      wet(1),
    ],
    create(p) {
      const node = new Tone.PitchShift({ pitch: p.pitch, wet: p.wet })
      return { nodes: { node }, input: node, output: node }
    },
    apply({ node }, p) {
      node.pitch = p.pitch
      node.wet.value = p.wet
    },
  },

  detune: {
    type: 'detune',
    name: 'Detune',
    category: 'pitch',
    kind: 'insert',
    description: 'Thickens the sound with detuned copies',
    params: [
      { key: 'amount', label: 'Amount', type: 'range', min: -100, max: 100, step: 1, default: 15, format: cents },
      { key: 'count', label: 'Count', type: 'range', min: 1, max: 8, step: 1, default: 1, format: (v) => `+${v}` },
      wet(0.5),
    ],
    // Count changes the number of audio nodes, so it forces a graph rebuild.
    structureParams: ['count'],
    // Unison stack: `count` copies around the original — odd counts put the
    // extra one above — each stepped `amount` cents apart. The wet bus
    // includes the original (center voice), so full Mix keeps it audible.
    create(p) {
      const count = p.count ?? 1
      const input = new Tone.Gain(1)
      const sum = new Tone.Gain(1 / Math.sqrt(count + 1))
      const mix = new Tone.CrossFade(p.wet)
      input.connect(mix.a)
      input.connect(sum) // the original, center voice
      const shifters = unisonOffsets(count).map((step) => {
        const ps = new Tone.PitchShift({ pitch: (step * p.amount) / 100, wet: 1 })
        input.connect(ps)
        ps.connect(sum)
        return ps
      })
      sum.connect(mix.b)
      return { nodes: { input, sum, mix, shifters }, input, output: mix }
    },
    apply({ shifters, sum, mix }, p) {
      const offsets = unisonOffsets(shifters.length)
      shifters.forEach((ps, i) => { ps.pitch = (offsets[i] * p.amount) / 100 })
      sum.gain.value = 1 / Math.sqrt(shifters.length + 1)
      mix.fade.value = p.wet
    },
  },

  pitchlfo: {
    type: 'pitchlfo',
    name: 'Pitch LFO',
    category: 'pitch',
    kind: 'control',
    description: 'Wobbles the source pitch — vibrato, sirens, alarms',
    params: [
      { key: 'rate', label: 'Rate', type: 'range', min: 0.1, max: 30, step: 0.1, default: 5, scale: 'log', format: (v) => `${v.toFixed(1)}Hz` },
      { key: 'depth', label: 'Depth', type: 'range', min: 0, max: 1200, step: 1, default: 50, format: cents },
      wave('sine'),
    ],
  },

  pitchenv: {
    type: 'pitchenv',
    name: 'Pitch Envelope',
    category: 'pitch',
    kind: 'control',
    description: 'Slides the source pitch over time — lasers, power-ups, sweeps',
    params: [
      { key: 'start', label: 'Start', type: 'range', min: -2400, max: 2400, step: 10, default: 0, format: cents },
      { key: 'end', label: 'End', type: 'range', min: -2400, max: 2400, step: 10, default: 1200, format: cents },
      { key: 'time', label: 'Time', type: 'range', min: 0.02, max: 4, step: 0.01, default: 0.3, scale: 'log', format: sec },
    ],
  },

  // ------------------------------------------------------------- distortion
  overdrive: {
    type: 'overdrive',
    name: 'Overdrive',
    category: 'distortion',
    kind: 'insert',
    description: 'Warm, crunchy distortion',
    params: [
      { key: 'drive', label: 'Drive', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, percent: true, format: (v) => `${Math.round(v * 100)}%` },
      wet(1),
    ],
    // Real overdrive = boost the signal INTO the waveshaper, then trim the
    // level back. A bare Tone.Distortion at unity gain is barely audible on
    // harmonically rich waves. Dry path stays unboosted for parallel mixing.
    create(p) {
      const input = new Tone.Gain(1)
      const pre = new Tone.Gain(1 + p.drive * 9)
      const dist = new Tone.Distortion({ distortion: 0.3 + p.drive * 0.65, oversample: '4x', wet: 1 })
      const trim = new Tone.Gain(1 / (1 + p.drive))
      const mix = new Tone.CrossFade(p.wet)
      input.connect(mix.a)
      input.chain(pre, dist, trim, mix.b)
      return { nodes: { input, pre, dist, trim, mix }, input, output: mix }
    },
    apply({ pre, dist, trim, mix }, p) {
      pre.gain.value = 1 + p.drive * 9
      dist.distortion = 0.3 + p.drive * 0.65
      trim.gain.value = 1 / (1 + p.drive)
      mix.fade.value = p.wet
    },
  },

  bitcrusher: {
    type: 'bitcrusher',
    name: 'Bitcrusher',
    category: 'distortion',
    kind: 'insert',
    description: 'Lo-fi retro game crunch',
    params: [
      { key: 'bits', label: 'Bits', type: 'range', min: 1, max: 16, step: 1, default: 8, format: (v) => `${v} bit` },
      wet(1),
    ],
    create(p) {
      const node = new Tone.BitCrusher({ bits: p.bits, wet: p.wet })
      return { nodes: { node }, input: node, output: node }
    },
    apply({ node }, p) {
      node.bits.value = p.bits
      node.wet.value = p.wet
    },
  },

  // ---------------------------------------------------------------- utility
  volume: {
    type: 'volume',
    name: 'Volume',
    category: 'utility',
    kind: 'insert',
    description: 'Level control anywhere in the chain',
    params: [
      { key: 'volume', label: 'Level', type: 'range', min: -40, max: 12, step: 0.1, default: 0, format: db },
    ],
    create(p) {
      const node = new Tone.Volume(p.volume)
      return { nodes: { node }, input: node, output: node }
    },
    apply({ node }, p) {
      node.volume.value = p.volume
    },
  },

  pan: {
    type: 'pan',
    name: 'Pan',
    category: 'utility',
    kind: 'insert',
    description: 'Position in the stereo field',
    params: [
      { key: 'pan', label: 'Pan', type: 'range', min: -1, max: 1, step: 0.01, default: 0,
        format: (v) => (Math.abs(v) < 0.01 ? 'center' : v < 0 ? `${Math.round(-v * 100)}L` : `${Math.round(v * 100)}R`) },
    ],
    create(p) {
      const node = new Tone.Panner(p.pan)
      return { nodes: { node }, input: node, output: node }
    },
    apply({ node }, p) {
      node.pan.value = p.pan
    },
  },

  analyzer: {
    type: 'analyzer',
    name: 'Spectrum',
    category: 'utility',
    kind: 'analyzer',
    description: 'Visualizes the frequency spectrum at this point',
    params: [],
    create() {
      const node = new Tone.Analyser('fft', 128)
      return { nodes: { node }, input: node, output: node }
    },
    apply() {},
  },
}

export function blocksByCategory() {
  const byCat = new Map(CATEGORIES.map((c) => [c.id, { ...c, blocks: [] }]))
  for (const def of Object.values(BLOCK_DEFS)) byCat.get(def.category).blocks.push(def)
  return [...byCat.values()]
}
