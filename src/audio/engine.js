import * as Tone from 'tone'
import { BLOCK_DEFS } from '../blocks/registry'
import { getSample } from './sampleCache'

const centsToRate = (cents) => Math.pow(2, cents / 1200)
const semisToRate = (semis) => Math.pow(2, semis / 12)

// Builds the full Tone.js graph for one sound and returns a handle with
// trigger/apply/dispose. Used identically by the live engine and the
// offline WAV renderer (Tone.Offline swaps the global context).
export async function buildChain(sound, destination) {
  const built = new Map() // blockId -> { def, nodes }
  const disposables = []
  const readyPromises = []

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
      Object.values(created.nodes).forEach((n) => disposables.push(n))
      if (created.ready) readyPromises.push(created.ready)
      created.output.connect(sourceBus)
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
    Object.values(created.nodes).forEach((n) => disposables.push(n))
    if (created.ready) readyPromises.push(created.ready)
    built.set(block.id, { def, nodes: created.nodes })

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

  function trigger(when = Tone.now()) {
    let sourceDuration = 0

    for (const { block, nodes } of sources) {
      if (block.type === 'synth') {
        const p = freshParams(block)
        if (nodes.envSignal && envBlocks.length > 0) {
          const env = freshParams(envBlocks[0])
          nodes.envSignal.cancelScheduledValues(when)
          nodes.envSignal.setValueAtTime(env.start, when)
          nodes.envSignal.linearRampToValueAtTime(env.end, when + env.time)
        }
        nodes.synth.triggerAttackRelease(p.freq, p.duration, when)
        sourceDuration = Math.max(sourceDuration, p.duration + p.release)
      }

      if (block.type === 'sample') {
        const sample = getSample(block.id)
        if (!sample?.audioBuffer) continue

        activeSampleSources.forEach((s) => {
          try { s.stop() } catch { /* already stopped */ }
        })
        activeSampleSources.clear()

        const baseRate = semisToRate(freshParams(block).pitch)
        const src = new Tone.ToneBufferSource(new Tone.ToneAudioBuffer(sample.audioBuffer))
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
        sourceDuration = Math.max(sourceDuration, sample.audioBuffer.duration / Math.max(0.05, minRate))
      }
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
      }
    }
  }

  function dispose() {
    activeSampleSources.forEach((s) => {
      try { s.stop(); s.dispose() } catch { /* already gone */ }
    })
    activeSampleSources.clear()
    disposables.forEach((n) => {
      try { n.dispose() } catch { /* already gone */ }
    })
    built.clear()
  }

  function getAnalyser(blockId) {
    return built.get(blockId)?.nodes?.node ?? null
  }

  await Promise.all(readyPromises)
  return { trigger, apply, dispose, getAnalyser }
}

export function structureKey(sound) {
  return sound.blocks.map((b) => `${b.id}:${b.type}:${b.enabled ? 1 : 0}`).join('|')
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
        sourceDur = Math.max(sourceDur, sample.audioBuffer.duration / Math.max(0.05, minRate))
      }
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

  dispose() {
    this.buildToken += 1
    this.handle?.dispose()
    this.handle = null
  }
}

export const liveEngine = new LiveEngine()
