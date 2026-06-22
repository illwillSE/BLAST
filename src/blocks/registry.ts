import * as Tone from 'tone'
import { VoicePool } from '../audio/voicePool'
import type {
  BitcrusherParams,
  BlockKind,
  BlockType,
  Category,
  CompressorParams,
  DelayParams,
  DetuneParams,
  EqParams,
  FilterParams,
  GateParams,
  Lane,
  MetalParams,
  MonitorParams,
  NoiseParams,
  OverdriveParams,
  PanParams,
  PitchenvParams,
  PitchlfoParams,
  PitchshiftParams,
  ReverbParams,
  SampleParams,
  SamplenvParams,
  SynthParams,
  Sound,
  VocoderParams,
  VolumeParams,
} from '../types'

// Param types:
//   { key, label, type:'range', min, max, step, default, unit, scale?:'log', format? }
//   { key, label, type:'select', options:[{value,label}], default }
//
// Block kinds:
//   'source'   — generates audio (synth, sample)
//   'insert'   — audio effect in the chain
//   'control'  — modulates the source's pitch, not in the audio path (pitch LFO / pitch env)
//   'analyzer' — taps the signal for visualization, audio passes through unchanged

// ============================================================ type system

// A non-serializable sample (file/mic bytes + decoded buffer) cached by block id
// in src/audio/sampleCache.js. Read fresh at trigger by the per-trigger hooks.
export interface CachedSample {
  blob: Blob
  fileName: string
  audioBuffer: AudioBuffer
}

// Anything the engine can `.connect()` into the graph — a Tone node or the
// custom polyphonic VoicePool (which proxies connect/disconnect/dispose).
export type ConnectableNode = Tone.ToneAudioNode | VoicePool

// What a block's `create()` hands back: the node bundle (the per-block `nodes`
// shape `N`), the graph in/out, and optional per-trigger + async-ready hooks.
export interface BlockBuild<P, N> {
  nodes: N
  // A block's input is always a plain Tone node (or null for sources); only the
  // output can be a VoicePool. The engine connects `prev -> input`.
  input: Tone.ToneAudioNode | null
  output: ConnectableNode
  // Method syntax (bivariant params) so a precise BlockBuild<XParams, XNodes>
  // stays assignable to the erased BlockBuild<…, unknown>.
  onTrigger?(when: number, ctx: TriggerContext<P>): void
  ready?: Promise<unknown>
}

export interface TriggerContext<P> {
  params: P
  sample: CachedSample | null
  nodes: Set<Tone.ToneAudioNode>
}

interface SelectOption {
  value: string
  label: string
  advanced?: boolean
}

interface ParamCommon<P> {
  key: Extract<keyof P, string>
  label: string
  group?: string
  advanced?: boolean
  // Methods (not function properties) so ParamDef<XParams> erases cleanly to
  // ParamDef<Record<string, unknown>> in the consumer-facing AnyBlockDef.
  show?(params: P, sound?: Sound): boolean
  inactive?(params: P, sound?: Sound): string | false
}

interface RangeParam<P> extends ParamCommon<P> {
  type: 'range'
  min: number
  max: number
  step: number
  default: number
  unit?: string
  scale?: 'log'
  percent?: boolean
  format?(v: number): string
}

interface SelectParam<P> extends ParamCommon<P> {
  type: 'select'
  options: SelectOption[]
  default: string
}

interface ToggleParam<P> extends ParamCommon<P> {
  type: 'toggle'
  default: boolean
}

interface HarmonicsParam<P> extends ParamCommon<P> {
  type: 'harmonics'
  default: number[]
}

export type ParamDef<P> = RangeParam<P> | SelectParam<P> | ToggleParam<P> | HarmonicsParam<P>

// UI-facing param-def types (params erased): the controls in ui.tsx render from
// these — they read def metadata (min/max/options/label…) and a raw value, never
// the owning block's param object. `def.type` discriminates the union.
export type UiParam = ParamDef<Record<string, unknown>>
export type RangeParamDef = RangeParam<Record<string, unknown>>
export type SelectParamDef = SelectParam<Record<string, unknown>>
export type ToggleParamDef = ToggleParam<Record<string, unknown>>
export type HarmonicsParamDef = HarmonicsParam<Record<string, unknown>>

interface BlockExample<P> {
  label: string
  hint?: string
  params: Partial<P>
}

interface BlockPreset<P> {
  label: string
  params: Partial<P>
}

// A registry entry. `P` = this block's param shape, `N` = its node bundle. The
// callbacks are methods so a precise BlockDef<XParams, XNodes> stays assignable
// to AnyBlockDef (bivariant params) — that's what lets data-driven code dispatch
// by `block.type` without a cast, while each entry is still authored against its
// own narrow types (a typo in `apply`'s destructure is a compile error).
export interface BlockDef<P, N> {
  type: BlockType
  name: string
  category: Category
  kind: BlockKind
  description?: string
  advanced?: boolean
  params: ParamDef<P>[]
  structureParams?: string[]
  examples?: BlockExample<P>[]
  presets?: BlockPreset<P>[]
  overrides?(params: P): string[]
  tailSeconds?(params: P): number
  create?(params: P): BlockBuild<P, N>
  apply?(nodes: N, params: P): void
}

// Identity helper: locks `P` and `N` per entry so the body is type-checked
// against this block's own param + node types.
export function defineBlock<P, N = Record<string, never>>(def: BlockDef<P, N>): BlockDef<P, N> {
  return def
}

// The type-erased, consumer-facing view of any registry entry. Method-bivariance
// (above) makes every concrete BlockDef assignable to this: params erase to
// Record<string, unknown> (every *Params object type is index-assignable) and the
// node bundle erases to `unknown` (the engine treats it opaquely — create returns
// it, apply consumes it, nothing inspects it). So data-driven dispatch like
// `BLOCK_DEFS[block.type].create(block.params)` type-checks with no cast.
export type AnyBlockDef = BlockDef<Record<string, unknown>, unknown>

// ---------------------------------------------------------- node bundles

interface SynthNodes { synth: VoicePool }
interface NoiseNodes { synth: Tone.NoiseSynth }
interface MetalNodes { synth: VoicePool }
interface SampleNodes { gain: Tone.Volume }
interface CompressorNodes { node: Tone.Compressor }
interface GateNodes { node: Tone.Gate }
interface FilterNodes { node: Tone.Filter }
interface EqNodes { node: Tone.EQ3 }
interface ReverbNodes { node: Tone.Reverb }
interface PitchshiftNodes { node: Tone.PitchShift }
interface BitcrusherNodes { node: Tone.BitCrusher }
interface VolumeNodes { node: Tone.Volume }
interface PanNodes { node: Tone.Panner }
interface MonitorNodes { gain: Tone.Gain; analyser: Tone.Analyser }
interface DelayNodes {
  node: Tone.FeedbackDelay | Tone.PingPongDelay
  input?: Tone.Gain
  toLeft?: Tone.Merge
  mix?: Tone.CrossFade
}
interface DetuneNodes {
  input: Tone.Gain
  sum: Tone.Gain
  mix: Tone.CrossFade
  shifters: Tone.PitchShift[]
}
interface OverdriveNodes {
  input: Tone.Gain
  pre: Tone.Gain
  dist: Tone.Distortion
  trim: Tone.Gain
  mix: Tone.CrossFade
}
interface VocoderNodes {
  input: Tone.Gain
  modIn: Tone.Gain
  vsum: Tone.Gain
  followers: Tone.Follower[]
  sibFol: Tone.Follower
  sibScale: Tone.Gain
  sibCar: Tone.Filter
  sibMod: Tone.Filter
  sibGain: Tone.Gain
  bands: Tone.ToneAudioNode[]
}

// ============================================================ registry

export const CATEGORIES: { id: Category; label: string; color: string }[] = [
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
function unisonOffsets(count: number): number[] {
  const offsets = []
  for (let k = 1; k <= Math.ceil(count / 2); k++) offsets.push(k)
  for (let k = 1; k <= Math.floor(count / 2); k++) offsets.push(-k)
  return offsets
}

// Vocoder band centers: log-spaced across the speech-intelligibility range,
// with a constant-Q per band derived from the spacing so neighbours just meet.
// Returns one Q for all bands (the spacing ratio is uniform in log space).
function vocoderBands(count: number): { freqs: number[]; Q: number } {
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

const wave = (def = 'sawtooth'): SelectParam<{ wave: string }> => ({
  key: 'wave',
  label: 'Wave',
  type: 'select',
  options: ['sine', 'square', 'sawtooth', 'triangle'].map((v) => ({ value: v, label: v })),
  default: def,
})

// percent: true — shown as 0–100%; manual entry uses whole percent, not 0–1
const wet = (def = 0.5): RangeParam<{ wet: number }> => ({
  key: 'wet', label: 'Mix', type: 'range', min: 0, max: 1, step: 0.01, default: def, percent: true,
  format: (v) => `${Math.round(v * 100)}%`,
})

const hz = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}kHz` : `${Math.round(v)}Hz`)
const db = (v: number) => `${v.toFixed(1)}dB`
const sec = (v: number) => (v < 1 ? `${Math.round(v * 1000)}ms` : `${v.toFixed(2)}s`)
const cents = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}ct`
const semis = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}st`

// Max simultaneous voices per pitched source (Synth/Metal VoicePool). Enough for
// chords + overlapping sequence tails; a future user param can expose it. Voices
// are pre-allocated but idle-silent, and the pool steals the oldest past this.
const MAX_POLYPHONY = 16

// Pool output headroom (~-6 dB). Stacked voices sum into this, so a typical chord
// lands near unity and clean instead of clipping; a single note is quieter for it.
const VOICE_HEADROOM = 0.5

interface OscillatorOptions { type: string; partials?: number[]; width?: number }

// Maps the synth's oscillator params to a Tone OmniOscillator *options object*,
// applied via `polySynth.set({ oscillator })` (a PolySynth has no single
// oscillator node to mutate). Three "rich" modes beyond the plain waves:
// band-limited partial counts (e.g. sawtooth8), a pulse with adjustable width,
// and a custom harmonic spectrum ("draw your own wave"). OmniOscillator.set
// applies `type` first, so `{ type: 'sine', partials }` lands a custom wave;
// `partials: []` clears any stale custom array when switching back to a plain
// wave (Tone's deepMerge replaces arrays wholesale).
function oscillatorOptions(p: SynthParams): OscillatorOptions {
  if (p.wave === 'custom') {
    return { type: 'sine', partials: p.harmonics?.length ? p.harmonics : [1] }
  }
  if (p.wave === 'pulse') {
    return { type: 'pulse', width: p.width ?? 0 }
  }
  // 0 partials = the full band-limited wave; >0 keeps only the first N.
  const count = p.partials ?? 0
  return { type: count > 0 ? `${p.wave}${count}` : p.wave, partials: [] }
}

const DEFS = {
  // ---------------------------------------------------------------- sources
  synth: defineBlock<SynthParams, SynthNodes>({
    type: 'synth',
    name: 'Synth',
    category: 'source',
    kind: 'source',
    description: 'Oscillator with envelope',
    structureParams: ['wave'],
    // `group` ('osc' | 'env') splits the controls into the two panels in the UI,
    // each headed by its matching preview canvas.
    params: [
      { key: 'wave', label: 'Wave', type: 'select', default: 'sawtooth', group: 'osc',
        options: [
          { value: 'sine', label: 'sine' },
          { value: 'triangle', label: 'triangle' },
          { value: 'square', label: 'square' },
          { value: 'sawtooth', label: 'sawtooth' },
          { value: 'pulse', label: 'pulse', advanced: true },
          { value: 'custom', label: 'custom', advanced: true },
        ] },
      // Band-limited partial count — only the harmonic-rich basic waves use it.
      { key: 'partials', label: 'Partials', type: 'range', min: 0, max: 32, step: 1, default: 0, group: 'osc', advanced: true,
        format: (v) => (v === 0 ? 'full' : `${v}`),
        show: (p) => p.wave === 'square' || p.wave === 'sawtooth' || p.wave === 'triangle' },
      { key: 'width', label: 'Width', type: 'range', min: -0.95, max: 0.95, step: 0.01, default: 0, group: 'osc', advanced: true,
        percent: true, format: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`, show: (p) => p.wave === 'pulse' },
      { key: 'pwmRate', label: 'PWM Rate', type: 'range', min: 0, max: 30, step: 0.1, default: 0, group: 'osc', advanced: true,
        format: (v) => v <= 0 ? 'off' : `${v.toFixed(1)}Hz`, show: (p) => p.wave === 'pulse' },
      { key: 'pwmDepth', label: 'PWM Depth', type: 'range', min: 0, max: 0.95, step: 0.01, default: 0, group: 'osc', advanced: true,
        percent: true, format: (v) => `${Math.round(v * 100)}%`, show: (p) => p.wave === 'pulse' },
      { key: 'pwmWave', label: 'PWM Wave', type: 'select', default: 'sine', group: 'osc', advanced: true,
        options: ['sine', 'triangle', 'square', 'sawtooth'].map((v) => ({ value: v, label: v })),
        show: (p) => p.wave === 'pulse' && p.pwmRate > 0 && p.pwmDepth > 0 },
      { key: 'harmonics', label: 'Harmonics', type: 'harmonics', group: 'osc', advanced: true,
        default: [1, 0.6, 0.4, 0.25, 0.15, 0.1, 0.07, 0.05], show: (p) => p.wave === 'custom' },
      { key: 'freq', label: 'Pitch', type: 'range', min: 30, max: 4000, step: 1, default: 220, scale: 'log', format: hz, group: 'osc' },
      // Envelope controls ordered to match the envelope's left-to-right shape:
      // attack → decay → sustain → Length (the sustain hold) → release.
      { key: 'attack', label: 'Attack', type: 'range', min: 0.001, max: 2, step: 0.001, default: 0.01, scale: 'log', format: sec, group: 'env' },
      { key: 'decay', label: 'Decay', type: 'range', min: 0.01, max: 2, step: 0.01, default: 0.1, scale: 'log', format: sec, group: 'env' },
      { key: 'sustain', label: 'Sustain', type: 'range', min: 0, max: 1, step: 0.01, default: 0.7, percent: true, format: (v) => `${Math.round(v * 100)}%`, group: 'env' },
      { key: 'duration', label: 'Length', type: 'range', min: 0.05, max: 4, step: 0.01, default: 0.4, format: sec, group: 'env',
        inactive: (p) => p.sustain <= 0 ? 'No effect while Sustain is 0% — the note decays to silence on its own. Raise Sustain to hold the note for this length.' : false },
      { key: 'release', label: 'Release', type: 'range', min: 0.01, max: 4, step: 0.01, default: 0.3, scale: 'log', format: sec, group: 'env' },
      { key: 'portamento', label: 'Glide', type: 'range', min: 0, max: 0.5, step: 0.005, default: 0,
        format: (v) => v < 0.005 ? 'off' : sec(v), group: 'env',
        show: (p, sound) => sound?.voicing === 'mono' },
      { key: 'legato', label: 'Legato', type: 'toggle', default: false, group: 'env',
        show: (p, sound) => sound?.voicing === 'mono' },
    ],
    // Polyphonic: a VoicePool of Tone.Synth voices, so chords and overlapping
    // sequence steps ring out instead of cutting each other off. The pool exposes
    // each voice's `.detune` so the engine can wire the pitch LFO + pitch envelope
    // per voice. Node key stays `synth`; the engine's source path is unchanged.
    create(params) {
      const synth = new VoicePool(Tone.Synth, MAX_POLYPHONY, VOICE_HEADROOM)
      synth.set({
        oscillator: oscillatorOptions(params),
        envelope: { attack: params.attack, decay: params.decay, sustain: params.sustain, release: params.release },
      })
      return { nodes: { synth }, input: null, output: synth }
    },
    apply({ synth }, params) {
      synth.set({
        oscillator: oscillatorOptions(params),
        envelope: { attack: params.attack, decay: params.decay, sustain: params.sustain, release: params.release },
      })
    },
  }),

  noise: defineBlock<NoiseParams, NoiseNodes>({
    type: 'noise',
    name: 'Noise',
    category: 'source',
    kind: 'source',
    description: 'White, pink or brown noise — wind, snares, explosions',
    params: [
      { key: 'color', label: 'Color', type: 'select', default: 'white',
        options: ['white', 'pink', 'brown'].map((v) => ({ value: v, label: v })) },
      // Envelope controls ordered to match the envelope preview's left-to-right
      // shape: attack → decay → sustain → Length (the sustain hold) → release.
      { key: 'attack', label: 'Attack', type: 'range', min: 0.001, max: 2, step: 0.001, default: 0.005, scale: 'log', format: sec },
      { key: 'decay', label: 'Decay', type: 'range', min: 0.01, max: 2, step: 0.01, default: 0.1, scale: 'log', format: sec },
      { key: 'sustain', label: 'Sustain', type: 'range', min: 0, max: 1, step: 0.01, default: 0, percent: true, format: (v) => `${Math.round(v * 100)}%` },
      { key: 'duration', label: 'Length', type: 'range', min: 0.05, max: 4, step: 0.01, default: 0.4, format: sec,
        inactive: (p) => p.sustain <= 0 ? 'No effect while Sustain is 0% — the burst decays to silence on its own. Raise Sustain to hold the noise for this length.' : false },
      { key: 'release', label: 'Release', type: 'range', min: 0.01, max: 4, step: 0.01, default: 0.3, scale: 'log', format: sec },
    ],
    examples: [
      { label: 'Snare', hint: 'punchy snare hit',
        params: { color: 'white', duration: 0.08, attack: 0.001, decay: 0.15, sustain: 0, release: 0.1 } },
      { label: 'Wind', hint: 'soft sustained wind',
        params: { color: 'pink', duration: 2, attack: 0.4, decay: 0.1, sustain: 0.6, release: 1.2 } },
      { label: 'Thunder', hint: 'low rolling rumble',
        params: { color: 'brown', duration: 1.5, attack: 0.05, decay: 0.8, sustain: 0.2, release: 1.5 } },
      { label: 'Hi-hat', hint: 'tight open hi-hat',
        params: { color: 'white', duration: 0.05, attack: 0.001, decay: 0.05, sustain: 0, release: 0.08 } },
    ],
    // Stays monophonic: Tone.NoiseSynth extends Instrument (not Monophonic), so
    // it can't back a PolySynth voice pool. Noise is unpitched — a noise "chord"
    // is meaningless — so overlapping voices aren't worth a hand-rolled pool here.
    create(p) {
      const synth = new Tone.NoiseSynth({
        noise: { type: p.color },
        envelope: { attack: p.attack, decay: p.decay, sustain: p.sustain, release: p.release },
      })
      return { nodes: { synth }, input: null, output: synth }
    },
    apply({ synth }, p) {
      synth.noise.type = p.color
      synth.envelope.attack = p.attack
      synth.envelope.decay = p.decay
      synth.envelope.sustain = p.sustain
      synth.envelope.release = p.release
    },
  }),

  metal: defineBlock<MetalParams, MetalNodes>({
    type: 'metal',
    name: 'Metal',
    category: 'source',
    kind: 'source',
    advanced: true,
    description: 'Inharmonic metallic synth — cymbals, bells, clangs',
    params: [
      { key: 'freq', label: 'Pitch', type: 'range', min: 30, max: 4000, step: 1, default: 200, scale: 'log', format: hz },
      { key: 'harmonicity', label: 'Harmonicity', type: 'range', min: 0.5, max: 20, step: 0.1, default: 5.1, format: (v) => v.toFixed(1) },
      { key: 'modIndex', label: 'Mod Index', type: 'range', min: 1, max: 100, step: 1, default: 32, format: (v) => `${v}` },
      { key: 'resonance', label: 'Resonance', type: 'range', min: 200, max: 8000, step: 1, default: 4000, scale: 'log', format: hz },
      { key: 'octaves', label: 'Octaves', type: 'range', min: 0, max: 6, step: 0.1, default: 1.5, format: (v) => v.toFixed(1) },
      { key: 'attack', label: 'Attack', type: 'range', min: 0.001, max: 2, step: 0.001, default: 0.001, scale: 'log', format: sec },
      { key: 'decay', label: 'Decay', type: 'range', min: 0.01, max: 2, step: 0.01, default: 0.4, scale: 'log', format: sec },
      { key: 'release', label: 'Release', type: 'range', min: 0.01, max: 4, step: 0.01, default: 0.2, scale: 'log', format: sec },
    ],
    // Click-to-apply starting points, shown in the help modal.
    examples: [
      { label: 'Cymbal / hi-hat', hint: 'bright and noisy',
        params: { freq: 300, harmonicity: 5.1, modIndex: 40, resonance: 6000, octaves: 1.5, attack: 0.001, decay: 0.5, release: 0.3 } },
      { label: 'Bell', hint: 'clear ringing tone',
        params: { freq: 440, harmonicity: 3, modIndex: 8, resonance: 1500, octaves: 1, attack: 0.001, decay: 1.2, release: 0.6 } },
      { label: 'Clang', hint: 'dissonant metallic hit',
        params: { freq: 150, harmonicity: 1.4, modIndex: 60, resonance: 3000, octaves: 2, attack: 0.001, decay: 0.4, release: 0.3 } },
    ],
    // Polyphonic, like the Synth: a VoicePool of Tone.MetalSynth voices. Node
    // keyed `synth` so the engine's source path treats Metal exactly like the
    // Synth — triggerAttackRelease(freq, dur, when) (see `isSynthSource` in
    // engine.js), with each voice's `.detune` available for pitch modulation.
    create(p) {
      const synth = new VoicePool(Tone.MetalSynth, MAX_POLYPHONY, VOICE_HEADROOM)
      synth.set({
        harmonicity: p.harmonicity, modulationIndex: p.modIndex, octaves: p.octaves, resonance: p.resonance,
        envelope: { attack: p.attack, decay: p.decay, release: p.release },
      })
      return { nodes: { synth }, input: null, output: synth }
    },
    apply({ synth }, p) {
      synth.set({
        harmonicity: p.harmonicity, modulationIndex: p.modIndex, octaves: p.octaves, resonance: p.resonance,
        envelope: { attack: p.attack, decay: p.decay, release: p.release },
      })
    },
  }),

  sample: defineBlock<SampleParams, SampleNodes>({
    type: 'sample',
    name: 'Sample',
    category: 'source',
    kind: 'source',
    description: 'Load an audio file or record from the microphone',
    params: [
      { key: 'pitch', label: 'Pitch', type: 'range', min: -24, max: 24, step: 0.1, default: 0, format: semis },
      { key: 'gain', label: 'Gain', type: 'range', min: -24, max: 12, step: 0.1, default: 0, format: db },
      // Granular playback (Tone.GrainPlayer): the buffer is replayed as a cloud
      // of overlapping grains, decoupling pitch (detune) from speed (playback
      // rate). The grain params only show in granular mode.
      { key: 'mode', label: 'Mode', type: 'select', default: 'normal', advanced: true,
        options: [{ value: 'normal', label: 'normal' }, { value: 'granular', label: 'granular' }] },
      { key: 'grainSize', label: 'Grain', type: 'range', min: 0.01, max: 0.5, step: 0.005, default: 0.1, format: sec, advanced: true,
        show: (p) => p.mode === 'granular' },
      { key: 'overlap', label: 'Overlap', type: 'range', min: 0, max: 0.95, step: 0.01, default: 0.5, percent: true, advanced: true,
        format: (v) => `${Math.round(v * 100)}%`, show: (p) => p.mode === 'granular' },
      { key: 'speed', label: 'Speed', type: 'range', min: 0.1, max: 4, step: 0.01, default: 1, scale: 'log', advanced: true,
        format: (v) => `${v.toFixed(2)}×`, show: (p) => p.mode === 'granular' },
      { key: 'loop', label: 'Loop', type: 'toggle', default: false, advanced: true, show: (p) => p.mode === 'granular' },
      { key: 'length', label: 'Length', type: 'range', min: 0.1, max: 8, step: 0.1, default: 1.5, format: sec, advanced: true,
        show: (p) => p.mode === 'granular' && p.loop },
    ],
    create(params) {
      const gain = new Tone.Volume(params.gain)
      return { nodes: { gain }, input: null, output: gain }
    },
    apply({ gain }, params) {
      gain.volume.value = params.gain
    },
  }),

  // --------------------------------------------------------------- dynamics
  compressor: defineBlock<CompressorParams, CompressorNodes>({
    type: 'compressor',
    name: 'Compressor',
    category: 'dynamics',
    kind: 'insert',
    advanced: true,
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
  }),

  gate: defineBlock<GateParams, GateNodes>({
    type: 'gate',
    name: 'Gate',
    category: 'dynamics',
    kind: 'insert',
    advanced: true,
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
  }),

  samplenv: defineBlock<SamplenvParams>({
    type: 'samplenv',
    name: 'Sample Envelope',
    category: 'dynamics',
    kind: 'control',
    advanced: true,
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
  }),

  // ----------------------------------------------------------------- filter
  vocoder: defineBlock<VocoderParams, VocoderNodes>({
    type: 'vocoder',
    name: 'Vocoder',
    category: 'filter',
    kind: 'insert',
    advanced: true,
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

      const followers: Tone.Follower[] = []
      const bandNodes: Tone.ToneAudioNode[] = []
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

      let activeMod: Tone.ToneBufferSource | null = null
      function onTrigger(when: number, { params, sample, nodes }: TriggerContext<VocoderParams>) {
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
  }),

  filter: defineBlock<FilterParams, FilterNodes>({
    type: 'filter',
    name: 'Filter',
    category: 'filter',
    kind: 'insert',
    description: 'Low-pass / high-pass / band-pass filter',
    params: [
      { key: 'filterType', label: 'Type', type: 'select', default: 'lowpass',
        options: [{ value: 'lowpass', label: 'low-pass' }, { value: 'highpass', label: 'high-pass' }, { value: 'bandpass', label: 'band-pass' }] },
      { key: 'cutoff', label: 'Cutoff', type: 'range', min: 40, max: 18000, step: 1, default: 800, scale: 'log', format: hz },
      { key: 'resonance', label: 'Reso', type: 'range', min: 0.1, max: 20, step: 0.1, default: 1, scale: 'log', format: (v) => v.toFixed(1), advanced: true },
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
  }),

  eq: defineBlock<EqParams, EqNodes>({
    type: 'eq',
    name: 'EQ',
    category: 'filter',
    kind: 'insert',
    advanced: true,
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
  }),

  // ------------------------------------------------------------------- time
  reverb: defineBlock<ReverbParams, ReverbNodes>({
    type: 'reverb',
    name: 'Reverb',
    category: 'time',
    kind: 'insert',
    description: 'Adds space and ambience',
    params: [
      { key: 'decay', label: 'Decay', type: 'range', min: 0.1, max: 10, step: 0.1, default: 2, scale: 'log', format: sec },
      { key: 'preDelay', label: 'Pre-delay', type: 'range', min: 0, max: 0.2, step: 0.001, default: 0.01, format: sec, advanced: true },
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
  }),

  delay: defineBlock<DelayParams, DelayNodes>({
    type: 'delay',
    name: 'Delay',
    category: 'time',
    kind: 'insert',
    description: 'Repeating echoes',
    params: [
      { key: 'time', label: 'Time', type: 'range', min: 0.02, max: 1, step: 0.01, default: 0.25, format: sec },
      { key: 'feedback', label: 'Feedback', type: 'range', min: 0, max: 0.92, step: 0.01, default: 0.4, percent: true, format: (v) => `${Math.round(v * 100)}%` },
      { key: 'pingpong', label: 'Ping-pong', type: 'toggle', default: false, advanced: true },
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
  }),

  // ------------------------------------------------------------------ pitch
  pitchshift: defineBlock<PitchshiftParams, PitchshiftNodes>({
    type: 'pitchshift',
    name: 'Pitch Shift',
    category: 'pitch',
    kind: 'insert',
    advanced: true,
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
  }),

  detune: defineBlock<DetuneParams, DetuneNodes>({
    type: 'detune',
    name: 'Detune',
    category: 'pitch',
    kind: 'insert',
    advanced: true,
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
      shifters.forEach((ps, i) => { ps.pitch = ((offsets[i] ?? 0) * p.amount) / 100 })
      sum.gain.value = 1 / Math.sqrt(shifters.length + 1)
      mix.fade.value = p.wet
    },
  }),

  pitchlfo: defineBlock<PitchlfoParams>({
    type: 'pitchlfo',
    name: 'Pitch LFO',
    category: 'pitch',
    kind: 'control',
    advanced: true,
    description: 'Wobbles the source pitch — vibrato, sirens, alarms',
    params: [
      { key: 'rate', label: 'Rate', type: 'range', min: 0.1, max: 30, step: 0.1, default: 5, scale: 'log', format: (v) => `${v.toFixed(1)}Hz` },
      { key: 'depth', label: 'Depth', type: 'range', min: 0, max: 1200, step: 1, default: 50, format: cents },
      wave('sine'),
    ],
  }),

  pitchenv: defineBlock<PitchenvParams>({
    type: 'pitchenv',
    name: 'Pitch Envelope',
    category: 'pitch',
    kind: 'control',
    advanced: true,
    description: 'Slides the source pitch over time — lasers, power-ups, sweeps',
    params: [
      { key: 'start', label: 'Start', type: 'range', min: -2400, max: 2400, step: 10, default: 0, format: cents },
      { key: 'end', label: 'End', type: 'range', min: -2400, max: 2400, step: 10, default: 1200, format: cents },
      { key: 'time', label: 'Time', type: 'range', min: 0.02, max: 4, step: 0.01, default: 0.3, scale: 'log', format: sec },
    ],
  }),

  // ------------------------------------------------------------- distortion
  overdrive: defineBlock<OverdriveParams, OverdriveNodes>({
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
  }),

  bitcrusher: defineBlock<BitcrusherParams, BitcrusherNodes>({
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
      const node = new Tone.BitCrusher({ bits: p.bits })
      node.wet.value = p.wet
      return { nodes: { node }, input: node, output: node }
    },
    apply({ node }, p) {
      node.bits.value = p.bits
      node.wet.value = p.wet
    },
  }),

  // ---------------------------------------------------------------- utility
  volume: defineBlock<VolumeParams, VolumeNodes>({
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
  }),

  pan: defineBlock<PanParams, PanNodes>({
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
  }),

  monitor: defineBlock<MonitorParams, MonitorNodes>({
    type: 'monitor',
    name: 'Monitor',
    category: 'utility',
    kind: 'analyzer',
    description: 'Live view of the signal at this point — audio passes through unchanged',
    params: [
      { key: 'mode', label: 'View', type: 'select', default: 'wave',
        options: ['wave', 'spectrum', 'waterfall', 'fire', 'meter'].map((v) => ({ value: v, label: v })) },
    ],
    // Passthrough tap: same Gain in/out, analyser tapped off it, so audio flows
    // through untouched. The card retunes analyser.type/.size per view mode in its
    // draw loop (and the meter view restores waveform/1024).
    create() {
      const gain = new Tone.Gain(1)
      const analyser = new Tone.Analyser('waveform', 1024)
      gain.connect(analyser)
      return { nodes: { gain, analyser }, input: gain, output: gain }
    },
    apply() {},
  }),

}

export const BLOCK_DEFS: Record<BlockType, AnyBlockDef> = DEFS

// Which of a lane's source params are currently overridden by another enabled
// block in that lane's chain (e.g. the Sample Envelope flattens the synth
// ADSR). Returns paramKey -> { name, id } of the overriding block, so the UI can
// grey the control out, name the culprit, and link to it. Blocks opt in with an
// `overrides(params)` def.
export function disabledSourceParams(lane: Lane): Map<string, { name: string; id: string }> {
  const locks = new Map<string, { name: string; id: string }>()
  for (const block of lane.chain ?? []) {
    if (!block.enabled) continue
    const def = BLOCK_DEFS[block.type]
    if (!def?.overrides) continue
    for (const key of def.overrides(block.params)) if (!locks.has(key)) locks.set(key, { name: def.name, id: block.id })
  }
  return locks
}

// Group block defs by category for the add-menu. In Beginner mode
// (`includeAdvanced: false`) blocks tagged `advanced` are dropped from the menu;
// this only curates what's *addable* — an advanced block already in a chain
// still renders and stays editable.
export function blocksByCategory({ includeAdvanced = true }: { includeAdvanced?: boolean } = {}) {
  const byCat = new Map(CATEGORIES.map((c) => [c.id, { ...c, blocks: [] as AnyBlockDef[] }]))
  for (const def of Object.values(BLOCK_DEFS)) {
    if (!includeAdvanced && def.advanced) continue
    byCat.get(def.category)?.blocks.push(def)
  }
  return [...byCat.values()]
}
