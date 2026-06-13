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

// Vocoder band centers: log-spaced across the speech-intelligibility range,
// with a constant-Q per band derived from the spacing so neighbours just meet.
// Returns one Q for all bands (the spacing ratio is uniform in log space).
function vocoderBands(count) {
  const f0 = 150, f1 = 6000
  const freqs = []
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1)
    freqs.push(f0 * Math.pow(f1 / f0, t))
  }
  const ratio = Math.pow(f1 / f0, 1 / Math.max(1, count - 1)) // adjacent-band ratio
  const Q = Math.sqrt(ratio) / (ratio - 1)
  return { freqs, Q }
}
// Per-band makeup gain: a band-passed envelope is weak, so boost it before it
// opens the carrier band. Tuned by ear for audible-but-not-clipping output.
const VOCODER_MAKEUP = 6

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

// Maps the synth's oscillator params onto a Tone OmniOscillator. Three "rich"
// modes beyond the plain waves: band-limited partial counts (e.g. sawtooth8),
// a pulse with adjustable width, and a custom harmonic spectrum ("draw your
// own wave"). Tone only recreates the underlying oscillator when the source
// kind actually changes, so calling this on every apply() is cheap.
function applyOscillator(osc, p) {
  if (p.wave === 'custom') {
    // partials can't be set on a pulse/pwm source — switch to a plain
    // oscillator first, then the array becomes a custom periodic wave.
    if (osc.sourceType === 'pulse' || osc.sourceType === 'pwm') osc.type = 'sine'
    osc.partials = p.harmonics?.length ? p.harmonics : [1]
  } else if (p.wave === 'pulse') {
    osc.type = 'pulse'
    if (osc.width) osc.width.value = p.width ?? 0
  } else {
    // 0 partials = the full band-limited wave; >0 keeps only the first N.
    const count = p.partials ?? 0
    osc.type = count > 0 ? `${p.wave}${count}` : p.wave
  }
}

export const BLOCK_DEFS = {
  // ---------------------------------------------------------------- sources
  synth: {
    type: 'synth',
    name: 'Synth',
    category: 'source',
    kind: 'source',
    description: 'Oscillator with envelope',
    params: [
      { key: 'wave', label: 'Wave', type: 'select', default: 'sawtooth',
        options: ['sine', 'triangle', 'square', 'sawtooth', 'pulse', 'custom'].map((v) => ({ value: v, label: v })) },
      // Band-limited partial count — only the harmonic-rich basic waves use it.
      { key: 'partials', label: 'Partials', type: 'range', min: 0, max: 32, step: 1, default: 0,
        format: (v) => (v === 0 ? 'full' : `${v}`),
        show: (p) => p.wave === 'square' || p.wave === 'sawtooth' || p.wave === 'triangle' },
      { key: 'width', label: 'Width', type: 'range', min: -0.95, max: 0.95, step: 0.01, default: 0,
        percent: true, format: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`, show: (p) => p.wave === 'pulse' },
      { key: 'harmonics', label: 'Harmonics', type: 'harmonics',
        default: [1, 0.6, 0.4, 0.25, 0.15, 0.1, 0.07, 0.05], show: (p) => p.wave === 'custom' },
      { key: 'freq', label: 'Pitch', type: 'range', min: 30, max: 4000, step: 1, default: 220, scale: 'log', format: hz },
      { key: 'duration', label: 'Length', type: 'range', min: 0.05, max: 4, step: 0.01, default: 0.4, format: sec },
      { key: 'attack', label: 'Attack', type: 'range', min: 0.001, max: 2, step: 0.001, default: 0.01, scale: 'log', format: sec },
      { key: 'decay', label: 'Decay', type: 'range', min: 0.01, max: 2, step: 0.01, default: 0.1, scale: 'log', format: sec },
      { key: 'sustain', label: 'Sustain', type: 'range', min: 0, max: 1, step: 0.01, default: 0.7, percent: true, format: (v) => `${Math.round(v * 100)}%` },
      { key: 'release', label: 'Release', type: 'range', min: 0.01, max: 4, step: 0.01, default: 0.3, scale: 'log', format: sec },
    ],
    create(params) {
      const synth = new Tone.Synth({
        envelope: { attack: params.attack, decay: params.decay, sustain: params.sustain, release: params.release },
      })
      applyOscillator(synth.oscillator, params)
      return { nodes: { synth }, input: null, output: synth }
    },
    apply({ synth }, params) {
      applyOscillator(synth.oscillator, params)
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

  samplenv: {
    type: 'samplenv',
    name: 'Sample Envelope',
    category: 'dynamics',
    kind: 'control',
    description: 'Shapes the source volume with a sample’s amplitude contour',
    params: [
      { key: 'amount', label: 'Amount', type: 'range', min: 0, max: 1, step: 0.01, default: 1, percent: true, format: (v) => `${Math.round(v * 100)}%` },
      { key: 'smoothing', label: 'Smooth', type: 'range', min: 0, max: 0.1, step: 0.005, default: 0.02, format: sec },
      { key: 'stretch', label: 'Length', type: 'select', default: 'natural',
        options: [{ value: 'natural', label: 'natural' }, { value: 'note', label: 'note' }] },
    ],
    // Pure modulation: the embedded sample's amplitude is extracted to a gain
    // curve at trigger time (see engine.js). No audio node — like Pitch Env.
    // The synth ADSR is flattened while this is active, and in 'natural' mode
    // the synth Length is replaced by the sample's own length — so the UI
    // disables those source controls (see `disabledSourceParams`).
    overrides: (p) => (p.stretch === 'natural'
      ? ['attack', 'decay', 'sustain', 'release', 'duration']
      : ['attack', 'decay', 'sustain', 'release']),
  },

  // ----------------------------------------------------------------- filter
  vocoder: {
    type: 'vocoder',
    name: 'Vocoder',
    category: 'filter',
    kind: 'insert',
    description: 'Imposes a speech sample’s spectrum onto the chain signal',
    params: [
      { key: 'bands', label: 'Bands', type: 'select', default: '16',
        options: [{ value: '8', label: '8' }, { value: '16', label: '16' }, { value: '32', label: '32' }] },
      { key: 'response', label: 'Response', type: 'range', min: 0.002, max: 0.2, step: 0.001, default: 0.02, scale: 'log', format: sec },
      { key: 'sibilance', label: 'Sibilance', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, percent: true, format: (v) => `${Math.round(v * 100)}%` },
    ],
    // Band count changes the number of audio nodes, so it forces a rebuild.
    structureParams: ['bands'],
    // The held carrier is stretched to the modulator's length, so the synth's
    // own Length no longer governs — grey it out (replaced in the engine, see
    // `vocoderHold`/`noteDur`). Like the Sample Envelope's natural mode.
    overrides: () => ['duration'],
    // The chain signal is the carrier; an embedded speech sample (loaded/recorded
    // into this block, played fresh on every trigger via onTrigger) is the
    // modulator. N band-pass pairs split both; a Follower per band tracks the
    // modulator band's loudness and gates the matching carrier band. A separate
    // high-pass pair passes sibilance through for crisp S/T sounds. Output is
    // fully vocoded (no dry-carrier mix): the raw carrier blended in just adds
    // an un-vocoded buzz and makes the carrier ring on past the speech.
    create(p) {
      const count = Number(p.bands ?? 16)
      const { freqs, Q } = vocoderBands(count)
      const input = new Tone.Gain(1)   // carrier in (the chain signal)
      const modIn = new Tone.Gain(1)   // modulator in (the speech source connects here)
      const vsum = new Tone.Gain(1)    // sum of all vocoded bands → output

      const followers = []
      const bandNodes = []
      for (const f of freqs) {
        const cBP = new Tone.Filter({ frequency: f, type: 'bandpass', Q })
        const mBP = new Tone.Filter({ frequency: f, type: 'bandpass', Q })
        const fol = new Tone.Follower(p.response)
        const scale = new Tone.Gain(VOCODER_MAKEUP) // makeup so the envelope opens the band audibly
        const g = new Tone.Gain(0) // base 0 — the follower drives the gain
        input.connect(cBP); cBP.connect(g); g.connect(vsum)
        modIn.connect(mBP); mBP.connect(fol); fol.connect(scale); scale.connect(g.gain)
        followers.push(fol)
        bandNodes.push(cBP, mBP, scale, g)
      }

      // Sibilance passthrough: high-passed carrier gated by the modulator's highs.
      const sibCar = new Tone.Filter({ frequency: 5000, type: 'highpass' })
      const sibMod = new Tone.Filter({ frequency: 5000, type: 'highpass' })
      const sibFol = new Tone.Follower(0.01)
      const sibScale = new Tone.Gain(VOCODER_MAKEUP * (p.sibilance ?? 0))
      const sibGain = new Tone.Gain(0)
      input.connect(sibCar); sibCar.connect(sibGain); sibGain.connect(vsum)
      modIn.connect(sibMod); sibMod.connect(sibFol); sibFol.connect(sibScale); sibScale.connect(sibGain.gain)

      let activeMod = null
      function onTrigger(when, { params, sample, nodes }) {
        if (activeMod) {
          try { activeMod.stop(); activeMod.dispose() } catch { /* already gone */ }
          nodes.delete(activeMod)
          activeMod = null
        }
        if (!sample?.audioBuffer) return
        const full = sample.audioBuffer.duration
        const ts = Math.max(0, params.trimStart ?? 0)
        const te = Math.min(full, params.trimEnd ?? full)
        let buf = new Tone.ToneAudioBuffer(sample.audioBuffer)
        if (te - ts > 0.002 && (ts > 0.001 || te < full - 0.001)) buf = buf.slice(ts, te)
        const src = new Tone.ToneBufferSource(buf)
        src.connect(modIn)
        src.onended = () => {
          nodes.delete(src)
          if (activeMod === src) activeMod = null
          try { src.disconnect(); src.dispose() } catch { /* disposed */ }
        }
        src.start(when)
        nodes.add(src)
        activeMod = src
      }

      const nodes = { input, modIn, vsum, followers, sibFol, sibScale, sibCar, sibMod, sibGain, bands: bandNodes }
      return { nodes, input, output: vsum, onTrigger }
    },
    apply({ followers, sibFol, sibScale }, p) {
      for (const f of followers) f.smoothing = p.response
      sibFol.smoothing = Math.min(0.02, p.response)
      sibScale.gain.value = VOCODER_MAKEUP * (p.sibilance ?? 0)
    },
  },

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
    presets: [
      { label: 'Room',    params: { decay: 0.6, preDelay: 0.005, wet: 0.25 } },
      { label: 'Hall',    params: { decay: 2.5, preDelay: 0.03,  wet: 0.40 } },
      { label: 'Concert', params: { decay: 5.0, preDelay: 0.06,  wet: 0.50 } },
      { label: 'Plate',   params: { decay: 1.8, preDelay: 0.001, wet: 0.50 } },
      { label: 'Cave',    params: { decay: 8.0, preDelay: 0.08,  wet: 0.55 } },
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
      { key: 'pingpong', label: 'Ping-pong', type: 'toggle', default: false },
      wet(0.4),
    ],
    structureParams: ['pingpong'],
    tailSeconds: (p) => Math.min(8, p.time * (1 / Math.max(0.05, 1 - p.feedback))),
    create(p) {
      if (p.pingpong) {
        // Tone's PingPongDelay forces a mono input onto both L+R identically, so
        // the two delay lines echo in unison and you hear no bounce. We feed the
        // wet path on the left channel only (via Merge) so it actually alternates
        // L→R→L, and mix a centered mono dry path back in ourselves (the built-in
        // dry would inherit the one-sided input). wet stays 1; our CrossFade owns
        // the dry/wet balance, matching the normal mode's behaviour.
        const input = new Tone.Gain()
        const node = new Tone.PingPongDelay({ delayTime: p.time, feedback: p.feedback, wet: 1, maxDelay: 1 })
        const toLeft = new Tone.Merge()
        const mix = new Tone.CrossFade(p.wet)
        input.connect(toLeft, 0, 0) // mono → left channel only
        toLeft.connect(node)
        input.connect(mix.a) // dry (centered)
        node.connect(mix.b) // wet (bouncing)
        return { nodes: { node, input, toLeft, mix }, input, output: mix }
      }
      const node = new Tone.FeedbackDelay({ delayTime: p.time, feedback: p.feedback, wet: p.wet })
      return { nodes: { node }, input: node, output: node }
    },
    apply({ node, mix }, p) {
      node.delayTime.value = p.time
      node.feedback.value = p.feedback
      if (mix) mix.fade.value = p.wet // ping-pong: our manual dry/wet
      else node.wet.value = p.wet
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
      { key: 'count', label: 'Count', type: 'range', min: 1, max: 8, step: 1, default: 6, format: (v) => `+${v}` },
      wet(0.8),
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

// Which of a lane's source params are currently overridden by another enabled
// block in that lane's chain (e.g. the Sample Envelope flattens the synth
// ADSR). Returns paramKey -> overriding block's name, so the UI can grey the
// control out and explain why. Blocks opt in with an `overrides(params)` def.
export function disabledSourceParams(lane) {
  const locks = new Map()
  for (const block of lane.chain ?? []) {
    if (!block.enabled) continue
    const def = BLOCK_DEFS[block.type]
    if (!def?.overrides) continue
    for (const key of def.overrides(block.params)) if (!locks.has(key)) locks.set(key, def.name)
  }
  return locks
}

export function blocksByCategory() {
  const byCat = new Map(CATEGORIES.map((c) => [c.id, { ...c, blocks: [] }]))
  for (const def of Object.values(BLOCK_DEFS)) byCat.get(def.category).blocks.push(def)
  return [...byCat.values()]
}
