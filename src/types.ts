// The serializable data model that drives everything. A project holds sounds; a
// sound is a hybrid per-lane model (source lanes mixing at a shared bus + a
// master chain + a sequencer). Blocks are a discriminated union keyed by `type`,
// so consumers narrow `params` by switching on `block.type`. These types mirror
// the registry's param defs (src/blocks/registry.js) and the model constructors
// (src/state/model.ts) — keep them in sync when block params change.

// ----------------------------------------------------------------- enums

export type BlockKind = 'source' | 'insert' | 'control' | 'analyzer'

export type Category =
  | 'source'
  | 'dynamics'
  | 'filter'
  | 'time'
  | 'pitch'
  | 'distortion'
  | 'utility'

export type BlockType =
  | 'synth'
  | 'noise'
  | 'metal'
  | 'sample'
  | 'compressor'
  | 'gate'
  | 'samplenv'
  | 'vocoder'
  | 'filter'
  | 'eq'
  | 'reverb'
  | 'delay'
  | 'pitchshift'
  | 'detune'
  | 'pitchlfo'
  | 'pitchenv'
  | 'overdrive'
  | 'bitcrusher'
  | 'volume'
  | 'pan'
  | 'monitor'

// The source block types — the head of a lane (exactly one per lane).
export type SourceType = 'synth' | 'noise' | 'metal' | 'sample'

// ----------------------------------------------------------- per-block params

export interface SynthParams {
  wave: 'sine' | 'triangle' | 'square' | 'sawtooth' | 'pulse' | 'custom'
  partials: number
  width: number
  pwmRate: number
  pwmDepth: number
  pwmWave: 'sine' | 'triangle' | 'square' | 'sawtooth'
  harmonics: number[]
  freq: number
  attack: number
  decay: number
  sustain: number
  duration: number
  release: number
  portamento: number
  legato: boolean
}

export interface NoiseParams {
  color: 'white' | 'pink' | 'brown'
  attack: number
  decay: number
  sustain: number
  duration: number
  release: number
}

export interface MetalParams {
  freq: number
  harmonicity: number
  modIndex: number
  resonance: number
  octaves: number
  attack: number
  decay: number
  release: number
}

// Trim (region) params are added by the sample editor, not by defaultParams, so
// they're optional. Shared by every sample-carrying block (sample, samplenv,
// vocoder) — read fresh at trigger.
export interface SampleTrim {
  trimStart?: number
  trimEnd?: number
}

export interface SampleParams extends SampleTrim {
  pitch: number
  gain: number
  mode: 'normal' | 'granular'
  grainSize: number
  overlap: number
  speed: number
  loop: boolean
  length: number
}

export interface CompressorParams {
  threshold: number
  ratio: number
  attack: number
  release: number
}

export interface GateParams {
  threshold: number
  smoothing: number
}

export interface SamplenvParams extends SampleTrim {
  amount: number
  smoothing: number
  stretch: 'natural' | 'note'
}

export interface VocoderParams extends SampleTrim {
  bands: '8' | '16' | '32'
  response: number
  sibilance: number
}

export interface FilterParams {
  filterType: 'lowpass' | 'highpass' | 'bandpass'
  cutoff: number
  resonance: number
}

export interface EqParams {
  low: number
  mid: number
  high: number
}

export interface ReverbParams {
  decay: number
  preDelay: number
  wet: number
}

export interface DelayParams {
  time: number
  feedback: number
  pingpong: boolean
  wet: number
}

export interface PitchshiftParams {
  pitch: number
  wet: number
}

export interface DetuneParams {
  amount: number
  count: number
  wet: number
}

export interface PitchlfoParams {
  rate: number
  depth: number
  wave: 'sine' | 'square' | 'sawtooth' | 'triangle'
}

export interface PitchenvParams {
  start: number
  end: number
  time: number
}

export interface OverdriveParams {
  drive: number
  wet: number
}

export interface BitcrusherParams {
  bits: number
  wet: number
}

export interface VolumeParams {
  volume: number
}

export interface PanParams {
  pan: number
}

export interface MonitorParams {
  mode: 'wave' | 'spectrum' | 'waterfall' | 'fire' | 'meter'
}

// ------------------------------------------------------------ block union

// A block: `{ id, type, enabled, params }`. The `type` discriminant correlates
// with the `params` shape, so `switch (block.type)` narrows `block.params`.
export interface BlockOf<T extends BlockType, P> {
  id: string
  type: T
  enabled: boolean
  params: P
}

export type SynthBlock = BlockOf<'synth', SynthParams>
export type NoiseBlock = BlockOf<'noise', NoiseParams>
export type MetalBlock = BlockOf<'metal', MetalParams>
export type SampleBlock = BlockOf<'sample', SampleParams>
export type CompressorBlock = BlockOf<'compressor', CompressorParams>
export type GateBlock = BlockOf<'gate', GateParams>
export type SamplenvBlock = BlockOf<'samplenv', SamplenvParams>
export type VocoderBlock = BlockOf<'vocoder', VocoderParams>
export type FilterBlock = BlockOf<'filter', FilterParams>
export type EqBlock = BlockOf<'eq', EqParams>
export type ReverbBlock = BlockOf<'reverb', ReverbParams>
export type DelayBlock = BlockOf<'delay', DelayParams>
export type PitchshiftBlock = BlockOf<'pitchshift', PitchshiftParams>
export type DetuneBlock = BlockOf<'detune', DetuneParams>
export type PitchlfoBlock = BlockOf<'pitchlfo', PitchlfoParams>
export type PitchenvBlock = BlockOf<'pitchenv', PitchenvParams>
export type OverdriveBlock = BlockOf<'overdrive', OverdriveParams>
export type BitcrusherBlock = BlockOf<'bitcrusher', BitcrusherParams>
export type VolumeBlock = BlockOf<'volume', VolumeParams>
export type PanBlock = BlockOf<'pan', PanParams>
export type MonitorBlock = BlockOf<'monitor', MonitorParams>

export type Block =
  | SynthBlock
  | NoiseBlock
  | MetalBlock
  | SampleBlock
  | CompressorBlock
  | GateBlock
  | SamplenvBlock
  | VocoderBlock
  | FilterBlock
  | EqBlock
  | ReverbBlock
  | DelayBlock
  | PitchshiftBlock
  | DetuneBlock
  | PitchlfoBlock
  | PitchenvBlock
  | OverdriveBlock
  | BitcrusherBlock
  | VolumeBlock
  | PanBlock
  | MonitorBlock

// The head of a lane is always a source block.
export type SourceBlock = SynthBlock | NoiseBlock | MetalBlock | SampleBlock

export type BlockParams = Block['params']

// The params type for a specific block `type`.
export type ParamsForType<T extends BlockType> = Extract<Block, { type: T }>['params']

// ------------------------------------------------------------ sound / project

// A lane is a source block plus its own left-to-right effects `chain` and a few
// lane-level mix props. Each lane mixes into a shared bus, then the sound's
// `master` chain processes the combined signal.
export type Lane = SourceBlock & {
  chain: Block[]
  delay: number // seconds offset from trigger (game-audio layering)
  level: number // dB
  pan: number // stereo position (-1..1)
}

export interface SeqNote {
  pitch: number // semitones from the source pitch
  len: number // how many steps the note is held
}

export interface SeqStep {
  notes: SeqNote[]
}

export interface Sequencer {
  enabled: boolean
  bpm: number
  gate: number // note length as a fraction of its span (0–1)
  steps: SeqStep[]
}

export interface Sound {
  id: string
  name: string
  outputVolume: number
  voicing: 'poly' | 'mono'
  sources: Lane[]
  master: Block[]
  sequencer: Sequencer
}

export interface ExportSettings {
  sampleRate: number
  channels: number
  format: string
}

export interface Project {
  name: string
  version: number
  export: ExportSettings
  sounds: Sound[]
}

// A "target" addresses a chain: a lane (source) id, or the string 'master'.
export type Target = string
