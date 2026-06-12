import * as Tone from 'tone'
import { BLOCK_DEFS } from '../blocks/registry'
import { getSample } from './sampleCache'
import { extractEnvelope } from './envelope'

const centsToRate = (cents) => Math.pow(2, cents / 1200)
const semisToRate = (semis) => Math.pow(2, semis / 12)

// When a Sample Envelope shapes the amplitude, the synth's own ADSR must get
// out of the way — flatten it to an always-on gate so the envelope curve (on
// the source's envGain) is the only thing shaping volume.
function flattenEnv(synth) {
  synth.envelope.attack = 0.005
  synth.envelope.decay = 0
  synth.envelope.sustain = 1
  synth.envelope.release = 0.01
}

// Builds the full Tone.js graph for one sound and returns a handle with
// trigger/apply/dispose. Used identically by the live engine and the
// offline WAV renderer (Tone.Offline swaps the global context).
export async function buildChain(sound, destination) {
  const built = new Map() // blockId -> { def, nodes }
  const disposables = []
  const readyPromises = []
  const triggerHooks = [] // { block, onTrigger } — inserts that fire on every Play
  const triggerNodes = new Set() // transient nodes those hooks spawn (e.g. vocoder modulator)

  // All sources mix into one bus before the effects chain, so layered
  // sources can be added later without rewiring.
  const sourceBus = new Tone.Gain(1)
  disposables.push(sourceBus)

  const sources = [] // { block, def, nodes }
  const controls = [] // pitch lfo / pitch env blocks (enabled only)
  let prev = sourceBus

  for (const block of sound.blocks) {
    const def = BLOCK_DEFS[block.type]
    if (!def) continue

    if (def.kind === 'source') {
      const created = def.create(block.params)
      Object.values(created.nodes).flat().forEach((n) => disposables.push(n))
      if (created.ready) readyPromises.push(created.ready)
      // Each source runs through its own envGain (unity by default, so it's
      // transparent) before the bus — the Sample Envelope writes a gain curve
      // here at trigger time.
      const envGain = new Tone.Gain(1)
      disposables.push(envGain)
      created.output.connect(envGain)
      envGain.connect(sourceBus)
      created.nodes.envGain = envGain
      built.set(block.id, { def, nodes: created.nodes })
      sources.push({ block, def, nodes: created.nodes })
      continue
    }

    if (def.kind === 'control') {
      if (block.enabled) controls.push(block)
      built.set(block.id, { def, nodes: {} })
      continue
    }

    if (!block.enabled) continue

    const created = def.create(block.params)
    Object.values(created.nodes).flat().forEach((n) => disposables.push(n))
    if (created.ready) readyPromises.push(created.ready)
    built.set(block.id, { def, nodes: created.nodes })
    if (created.onTrigger) triggerHooks.push({ block, onTrigger: created.onTrigger })

    if (def.kind === 'analyzer') {
      prev.connect(created.input) // tap: signal continues past the analyzer
    } else {
      prev.connect(created.input)
      prev = created.output
    }
  }

  const masterOut = new Tone.Volume(sound.outputVolume ?? 0)
  disposables.push(masterOut)
  prev.connect(masterOut)
  masterOut.connect(destination)

  // Tap on the final output for the Output block's visualizer.
  const outputAnalyser = new Tone.Analyser('waveform', 1024)
  disposables.push(outputAnalyser)
  masterOut.connect(outputAnalyser)

  // --- amplitude (sample) envelope ---------------------------------------
  // Presence is part of structureKey (enabled flag), so hasAmpEnv is fixed for
  // this build. When present, the synth's ADSR is flattened so the extracted
  // curve fully owns the volume shape.
  const ampBlocks = controls.filter((b) => b.type === 'samplenv')
  const hasAmpEnv = ampBlocks.length > 0
  if (hasAmpEnv) {
    for (const { block, nodes } of sources) {
      if (block.type === 'synth') flattenEnv(nodes.synth)
    }
  }

  // --- pitch modulation wiring -------------------------------------------
  const lfoBlocks = controls.filter((b) => b.type === 'pitchlfo')
  const envBlocks = controls.filter((b) => b.type === 'pitchenv')

  const lfos = []
  for (const block of lfoBlocks) {
    const lfo = new Tone.LFO({ frequency: block.params.rate, min: -1, max: 1, type: block.params.wave })
    lfo.start()
    disposables.push(lfo)
    lfos.push({ block, lfo })
    built.get(block.id).nodes.lfo = lfo
  }

  // Synth sources: LFOs and envelope feed the detune signal (cents).
  // Both connect into the same signal and sum.
  for (const { block, nodes } of sources) {
    if (block.type !== 'synth') continue
    for (const { block: lb, lfo } of lfos) {
      lfo.min = -lb.params.depth
      lfo.max = lb.params.depth
      lfo.connect(nodes.synth.detune)
    }
    if (envBlocks.length > 0) {
      const envSignal = new Tone.Signal(0)
      disposables.push(envSignal)
      envSignal.connect(nodes.synth.detune)
      nodes.envSignal = envSignal
    }
  }

  const activeSampleSources = new Set()

  // Params like the synth's length/pitch and the pitch envelope are consumed
  // at trigger time, not held by a Tone node — so always read them from the
  // latest sound state (updated by apply()), never the build-time snapshot.
  let current = sound
  const freshParams = (block) =>
    current.blocks.find((b) => b.id === block.id)?.params ?? block.params

  // Extract the amplitude curve fresh and schedule it on a source's envGain.
  // `noteLen` is the source's own playing length, used when stretching to note.
  // Returns the scheduled duration (so the synth note can span it), or null.
  function scheduleAmpEnv(envGain, when, noteLen) {
    if (!hasAmpEnv) return null
    const block = ampBlocks[0]
    const sample = getSample(block.id)
    if (!sample?.audioBuffer) return null
    const ep = freshParams(block)
    // Non-destructive trim: extract the contour from the selected slice only.
    const full = sample.audioBuffer.duration
    const trimStart = Math.max(0, ep.trimStart ?? 0)
    const trimEnd = Math.min(full, ep.trimEnd ?? full)
    const curve = extractEnvelope(sample.audioBuffer, {
      smoothing: ep.smoothing, amount: ep.amount, trimStart, trimEnd,
    })
    if (curve.length < 2) return null
    const dur = Math.max(0.02, ep.stretch === 'note' ? noteLen : trimEnd - trimStart)
    try {
      envGain.gain.cancelScheduledValues(when)
      envGain.gain.setValueCurveAtTime(curve, when, dur)
      envGain.gain.setValueAtTime(0, when + dur)
    } catch {
      // A still-running curve from a rapid previous trigger can refuse to be
      // overwritten — fall back to a flat pass so the source still sounds.
      envGain.gain.cancelScheduledValues(when)
      envGain.gain.setValueAtTime(1, when)
    }
    return dur
  }

  // Natural length of the longest enabled vocoder's (trimmed) speech modulator.
  // A held synth carrier is stretched to this so the whole sentence vocodes,
  // instead of cutting off at the synth's own Length.
  function vocoderHold() {
    let hold = 0
    for (const { block } of triggerHooks) {
      if (block.type !== 'vocoder') continue
      const sample = getSample(block.id)
      if (!sample?.audioBuffer) continue
      const p = freshParams(block)
      const full = sample.audioBuffer.duration
      const ts = Math.max(0, p.trimStart ?? 0)
      const te = Math.min(full, p.trimEnd ?? full)
      hold = Math.max(hold, te - ts)
    }
    return hold
  }

  function trigger(when = Tone.now()) {
    let sourceDuration = 0
    const carrierHold = vocoderHold()

    for (const { block, nodes } of sources) {
      if (block.type === 'synth') {
        const p = freshParams(block)
        if (nodes.envSignal && envBlocks.length > 0) {
          const env = freshParams(envBlocks[0])
          nodes.envSignal.cancelScheduledValues(when)
          nodes.envSignal.setValueAtTime(env.start, when)
          nodes.envSignal.linearRampToValueAtTime(env.end, when + env.time)
        }
        // In natural-length mode the envelope can outlast the synth's Length,
        // so the note is held for whatever the curve spans. A vocoder modulator
        // does the same — hold the carrier long enough to vocode the whole clip.
        const ampDur = scheduleAmpEnv(nodes.envGain, when, p.duration)
        const noteDur = Math.max(ampDur ?? p.duration, carrierHold)
        nodes.synth.triggerAttackRelease(p.freq, noteDur, when)
        sourceDuration = Math.max(sourceDuration, noteDur + p.release)
      }

      if (block.type === 'sample') {
        const sample = getSample(block.id)
        if (!sample?.audioBuffer) continue

        activeSampleSources.forEach((s) => {
          try { s.stop() } catch { /* already stopped */ }
        })
        activeSampleSources.clear()

        const p = freshParams(block)
        const baseRate = semisToRate(p.pitch)
        // Non-destructive trim: play only the selected slice of the buffer.
        const full = sample.audioBuffer.duration
        const trimStart = Math.max(0, p.trimStart ?? 0)
        const trimEnd = Math.min(full, p.trimEnd ?? full)
        let buf = new Tone.ToneAudioBuffer(sample.audioBuffer)
        if (trimEnd - trimStart > 0.002 && (trimStart > 0.001 || trimEnd < full - 0.001)) {
          buf = buf.slice(trimStart, trimEnd)
        }
        const src = new Tone.ToneBufferSource(buf)
        src.playbackRate.value = baseRate

        let minRate = baseRate
        if (envBlocks.length > 0) {
          const env = freshParams(envBlocks[0])
          const startRate = baseRate * centsToRate(env.start)
          const endRate = baseRate * centsToRate(env.end)
          src.playbackRate.setValueAtTime(startRate, when)
          src.playbackRate.exponentialRampToValueAtTime(endRate, when + env.time)
          minRate = Math.min(minRate, startRate, endRate)
        }
        for (const { block: lb, lfo } of lfos) {
          const delta = baseRate * (centsToRate(freshParams(lb).depth) - 1)
          lfo.min = -delta
          lfo.max = delta
          lfo.connect(src.playbackRate)
        }

        src.connect(nodes.gain)
        src.onended = () => {
          activeSampleSources.delete(src)
          try { src.disconnect(); src.dispose() } catch { /* disposed */ }
        }
        activeSampleSources.add(src)
        src.start(when)
        const playLen = (trimEnd - trimStart) / Math.max(0.05, minRate)
        scheduleAmpEnv(nodes.envGain, when, playLen)
        sourceDuration = Math.max(sourceDuration, playLen)
      }
    }

    // Inserts with a per-Play hook (e.g. the vocoder's speech modulator) start
    // their transient sources here, reading the latest params/sample.
    for (const { block, onTrigger } of triggerHooks) {
      onTrigger(when, { params: freshParams(block), sample: getSample(block.id), nodes: triggerNodes })
    }

    return sourceDuration
  }

  function apply(soundNow) {
    current = soundNow
    masterOut.volume.value = soundNow.outputVolume ?? 0
    for (const block of soundNow.blocks) {
      const entry = built.get(block.id)
      if (!entry) continue
      if (block.type === 'pitchlfo' && entry.nodes.lfo) {
        entry.nodes.lfo.frequency.value = block.params.rate
        entry.nodes.lfo.type = block.params.wave
        // depth is re-read per target (synth detune below; sample at trigger)
        for (const { block: sb, nodes } of sources) {
          if (sb.type === 'synth') {
            entry.nodes.lfo.min = -block.params.depth
            entry.nodes.lfo.max = block.params.depth
          }
        }
      } else if (entry.def.apply) {
        entry.def.apply(entry.nodes, block.params)
        // def.apply just rewrote the ADSR from params — flatten it again.
        if (hasAmpEnv && block.type === 'synth') flattenEnv(entry.nodes.synth)
      }
    }
  }

  function dispose() {
    activeSampleSources.forEach((s) => {
      try { s.stop(); s.dispose() } catch { /* already gone */ }
    })
    activeSampleSources.clear()
    triggerNodes.forEach((n) => {
      try { n.stop?.(); n.dispose() } catch { /* already gone */ }
    })
    triggerNodes.clear()
    disposables.forEach((n) => {
      try { n.dispose() } catch { /* already gone */ }
    })
    built.clear()
  }

  function getAnalyser(blockId) {
    return built.get(blockId)?.nodes?.node ?? null
  }

  await Promise.all(readyPromises)
  return { trigger, apply, dispose, getAnalyser, getOutputAnalyser: () => outputAnalyser }
}

export function structureKey(sound) {
  // structureParams are params that change the node graph itself (e.g. the
  // detune voice count) — including them here forces a rebuild on change.
  return sound.blocks
    .map((b) => {
      const extra = (BLOCK_DEFS[b.type]?.structureParams ?? [])
        .map((k) => b.params[k])
        .join(',')
      return `${b.id}:${b.type}:${b.enabled ? 1 : 0}${extra ? `:${extra}` : ''}`
    })
    .join('|')
}

export function estimateDuration(sound) {
  let sourceDur = 1
  for (const block of sound.blocks) {
    const def = BLOCK_DEFS[block.type]
    if (def?.kind !== 'source') continue
    if (block.type === 'synth') {
      sourceDur = Math.max(sourceDur, block.params.duration + block.params.release)
    }
    if (block.type === 'sample') {
      const sample = getSample(block.id)
      if (sample?.audioBuffer) {
        let minRate = semisToRate(block.params.pitch)
        const env = sound.blocks.find((b) => b.type === 'pitchenv' && b.enabled)
        if (env) {
          minRate = Math.min(
            minRate,
            minRate * centsToRate(env.params.start),
            minRate * centsToRate(env.params.end),
          )
        }
        const full = sample.audioBuffer.duration
        const playedLen =
          Math.min(full, block.params.trimEnd ?? full) - Math.max(0, block.params.trimStart ?? 0)
        sourceDur = Math.max(sourceDur, playedLen / Math.max(0.05, minRate))
      }
    }
  }
  // A natural-length sample envelope can hold the source longer than its own
  // Length, so the render window must cover the envelope sample too.
  const ampEnv = sound.blocks.find((b) => b.type === 'samplenv' && b.enabled)
  if (ampEnv && ampEnv.params.stretch === 'natural') {
    const s = getSample(ampEnv.id)
    if (s?.audioBuffer) {
      const full = s.audioBuffer.duration
      const envLen =
        Math.min(full, ampEnv.params.trimEnd ?? full) - Math.max(0, ampEnv.params.trimStart ?? 0)
      sourceDur = Math.max(sourceDur, envLen)
    }
  }

  // Likewise a vocoder holds the synth carrier for its speech modulator's
  // natural length, so the render window must cover the whole clip.
  if (sound.blocks.some((b) => b.type === 'synth')) {
    for (const block of sound.blocks) {
      if (block.type !== 'vocoder' || !block.enabled) continue
      const s = getSample(block.id)
      if (!s?.audioBuffer) continue
      const full = s.audioBuffer.duration
      const modLen =
        Math.min(full, block.params.trimEnd ?? full) - Math.max(0, block.params.trimStart ?? 0)
      sourceDur = Math.max(sourceDur, modLen)
    }
  }

  let tail = 0
  for (const block of sound.blocks) {
    const def = BLOCK_DEFS[block.type]
    if (block.enabled && def?.tailSeconds) tail = Math.max(tail, def.tailSeconds(block.params))
  }
  return Math.min(30, sourceDur + tail + 0.25)
}

// ---------------------------------------------------------------- live engine

export class LiveEngine {
  constructor() {
    this.handle = null
    this.key = null
    this.soundId = null
    this.buildToken = 0
  }

  async sync(sound) {
    const key = structureKey(sound)
    if (this.handle && this.soundId === sound.id && this.key === key) {
      this.handle.apply(sound)
      return
    }
    const token = ++this.buildToken
    const old = this.handle
    this.handle = null
    old?.dispose()
    const handle = await buildChain(sound, Tone.getDestination())
    if (token !== this.buildToken) {
      handle.dispose() // a newer build superseded this one
      return
    }
    this.handle = handle
    this.key = key
    this.soundId = sound.id
  }

  async play(sound) {
    await Tone.start()
    await this.sync(sound)
    if (!this.handle) return { duration: 0 }
    this.handle.apply(sound)
    const duration = this.handle.trigger()
    return { duration }
  }

  getAnalyser(blockId) {
    return this.handle?.getAnalyser(blockId) ?? null
  }

  getOutputAnalyser() {
    return this.handle?.getOutputAnalyser() ?? null
  }

  dispose() {
    this.buildToken += 1
    this.handle?.dispose()
    this.handle = null
  }
}

export const liveEngine = new LiveEngine()
