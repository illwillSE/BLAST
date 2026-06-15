import * as Tone from 'tone'
import { BLOCK_DEFS } from '../blocks/registry'
import { getSample } from './sampleCache'
import { extractEnvelope } from './envelope'
import { sequenceSpan } from './sequencer'

const centsToRate = (cents) => Math.pow(2, cents / 1200)
const semisToRate = (semis) => Math.pow(2, semis / 12)

// Max overlapping sample voices per lane. Retriggers stack up to this, then the
// oldest is stolen — so fast playing / sequence steps ring out instead of
// hard-cutting each other (the old behavior stopped every voice on each trigger).
const MAX_SAMPLE_VOICES = 8

// Synth-family sources share the Tone API the engine's pitch/trigger path needs:
// a `synth` node with `.detune` (cents), `.envelope` (ADSR), and
// triggerAttackRelease(freq, dur, when). Tone.Synth and Tone.MetalSynth both qualify.
const isSynthSource = (type) => type === 'synth' || type === 'metal'

// NoiseSynth shares the `.envelope` (ADSR) interface with Synth, but has no
// `.detune` and its triggerAttackRelease takes (duration, when) — no frequency.
const isNoiseSource = (type) => type === 'noise'

// Metal has no Length param — its percussive note runs attack+decay (down to its
// 0 floor), then the release tail. Synth/Noise are held for their explicit Length.
const synthHold = (p, type) => (type === 'metal' ? p.attack + p.decay : p.duration)

// Coerce the trigger() `notes` argument into a note-event list. A bare number is
// the legacy single-note transpose (keyboard play); undefined/empty becomes one
// note at the source's own pitch. An array of { transpose, offset, duration }
// passes through — a chord (offset 0) or a sequence (rising offsets).
function normalizeNotes(notes) {
  if (typeof notes === 'number') return [{ transpose: notes, offset: 0 }]
  if (Array.isArray(notes) && notes.length) return notes
  return [{ transpose: 0, offset: 0 }]
}

// When a Sample Envelope shapes the amplitude, the synth's own ADSR must get
// out of the way — flatten it to an always-on gate so the envelope curve (on
// the source's envGain) is the only thing shaping volume. Pitched sources are
// VoicePools (no single `.envelope`) so they go through `.set`, which fans out
// to every voice; the noise source is a plain NoiseSynth singleton.
function flattenEnv(synth) {
  const envelope = { attack: 0.005, decay: 0, sustain: 1, release: 0.01 }
  if (synth.voices) synth.set({ envelope }) // VoicePool
  else Object.assign(synth.envelope, envelope) // NoiseSynth singleton
}

// Builds the full Tone.js graph for one sound and returns a handle with
// trigger/apply/dispose. Used identically by the live engine and the
// offline WAV renderer (Tone.Offline swaps the global context).
//
// Topology: each source is a "lane" — source → envGain → [lane inserts] →
// laneVolume → lanePanner → sourceBus. All lanes mix at sourceBus, then the
// shared master chain → masterOut → destination. Lane controls (pitch LFO /
// pitch env / sample envelope) are per-lane and not in the audio path.
export async function buildChain(sound, destination) {
  const built = new Map() // blockId -> { def, nodes }
  const disposables = []
  const readyPromises = []
  const lanes = [] // per-lane runtime state
  const masterHooks = [] // master inserts that fire on every Play (rare)
  const triggerNodes = new Set() // transient nodes hooks spawn (e.g. vocoder modulator)

  // All lanes mix into one bus before the master chain.
  const sourceBus = new Tone.Gain(1)
  disposables.push(sourceBus)

  // --- build each source lane --------------------------------------------
  for (const src of sound.sources ?? []) {
    if (!src.enabled) continue // muted lane: skip entirely (structural)
    const def = BLOCK_DEFS[src.type]
    if (!def || def.kind !== 'source') continue

    const created = def.create(src.params)
    Object.values(created.nodes).flat().forEach((n) => disposables.push(n))
    if (created.ready) readyPromises.push(created.ready)

    // Each source runs through its own envGain (unity by default) before the
    // lane chain — the Sample Envelope writes a gain curve here at trigger.
    const envGain = new Tone.Gain(1)
    disposables.push(envGain)
    created.output.connect(envGain)
    created.nodes.envGain = envGain
    built.set(src.id, { def, nodes: created.nodes })

    const controls = [] // this lane's enabled control blocks
    const hooks = [] // this lane's per-trigger insert hooks (e.g. vocoder)
    let prev = envGain

    for (const block of src.chain ?? []) {
      const bdef = BLOCK_DEFS[block.type]
      if (!bdef) continue
      if (bdef.kind === 'control') {
        if (block.enabled) controls.push(block)
        built.set(block.id, { def: bdef, nodes: {} })
        continue
      }
      // Analyzers are passive taps with no on/off — always build them so the tap
      // stays live (a stale enabled:false can't strand it). Inserts honor bypass.
      if (!block.enabled && bdef.kind !== 'analyzer') continue
      const c = bdef.create(block.params)
      Object.values(c.nodes).flat().forEach((n) => disposables.push(n))
      if (c.ready) readyPromises.push(c.ready)
      built.set(block.id, { def: bdef, nodes: c.nodes })
      if (c.onTrigger) hooks.push({ block, onTrigger: c.onTrigger })
      prev.connect(c.input)
      prev = c.output
    }

    // Lane mix strip: level then pan, into the shared bus. channelCount: 2 keeps
    // the pan stereo-aware — Tone.Panner defaults to channelCount 1, which would
    // downmix a stereo signal (e.g. a ping-pong delay) to mono before panning.
    const laneVol = new Tone.Volume(src.level ?? 0)
    const lanePan = new Tone.Panner({ pan: src.pan ?? 0, channelCount: 2 })
    disposables.push(laneVol, lanePan)
    prev.connect(laneVol)
    laneVol.connect(lanePan)
    lanePan.connect(sourceBus)

    lanes.push({
      src, def, nodes: created.nodes, envGain, laneVol, lanePan,
      controls, hooks, lfos: [], envBlocks: [], ampBlocks: [], hasAmpEnv: false,
      activeSampleSources: new Set(),
    })
  }

  // --- per-lane pitch + amplitude modulation wiring ----------------------
  for (const lane of lanes) {
    lane.ampBlocks = lane.controls.filter((b) => b.type === 'samplenv')
    lane.envBlocks = lane.controls.filter((b) => b.type === 'pitchenv')
    lane.hasAmpEnv = lane.ampBlocks.length > 0

    // Sample Envelope flattens this lane's synth/noise ADSR so the curve owns volume.
    if (lane.hasAmpEnv && (isSynthSource(lane.src.type) || isNoiseSource(lane.src.type))) flattenEnv(lane.nodes.synth)

    for (const block of lane.controls.filter((b) => b.type === 'pitchlfo')) {
      const lfo = new Tone.LFO({ frequency: block.params.rate, min: -1, max: 1, type: block.params.wave })
      lfo.start()
      disposables.push(lfo)
      lane.lfos.push({ block, lfo })
      built.get(block.id).nodes.lfo = lfo
    }

    // Synth sources: wire the pitch LFO and pitch envelope into *every* voice's
    // detune (cents), so modulation survives polyphony. The LFO is shared (one
    // node fanned out); the pitch envelope gets a per-voice Signal summed into
    // detune — connecting a signal into a Tone.Signal overrides its .value, so
    // the envelope can't ride detune directly. At trigger we schedule whichever
    // voice was allocated via `lane.voiceEnv`. Base pitch is baked into each
    // note's frequency (`p.freq * semisToRate(transpose)`), independent of this.
    if (isSynthSource(lane.src.type)) {
      const pool = lane.nodes.synth
      pool.setVoicing(sound.voicing === 'mono') // initial gain (offline render reads it here)
      lane.voiceEnv = new Map()
      for (const { block: lb, lfo } of lane.lfos) {
        lfo.min = -lb.params.depth
        lfo.max = lb.params.depth
      }
      for (const voice of pool.voices) {
        for (const { lfo } of lane.lfos) lfo.connect(voice.detune)
        if (lane.envBlocks.length > 0) {
          const envSignal = new Tone.Signal(0)
          disposables.push(envSignal)
          envSignal.connect(voice.detune)
          lane.voiceEnv.set(voice, envSignal)
        }
      }
    }
  }

  // --- master chain after the mix bus ------------------------------------
  let prev = sourceBus
  for (const block of sound.master ?? []) {
    const bdef = BLOCK_DEFS[block.type]
    if (!bdef || bdef.kind === 'control' || (!block.enabled && bdef.kind !== 'analyzer')) continue
    const c = bdef.create(block.params)
    Object.values(c.nodes).flat().forEach((n) => disposables.push(n))
    if (c.ready) readyPromises.push(c.ready)
    built.set(block.id, { def: bdef, nodes: c.nodes })
    if (c.onTrigger) masterHooks.push({ block, onTrigger: c.onTrigger })
    prev.connect(c.input)
    prev = c.output
  }

  const masterOut = new Tone.Volume(sound.outputVolume ?? 0)
  // Brickwall just under 0 dBFS so polyphony (stacked voices/chords) can't hard-
  // clip the output. Single notes sit below the ceiling and pass through clean;
  // it only engages when summed voices would have clipped anyway. In the graph,
  // so it protects live playback and offline WAV export alike.
  const masterLimiter = new Tone.Limiter(-0.5)
  disposables.push(masterOut, masterLimiter)
  prev.connect(masterOut)
  masterOut.connect(masterLimiter)
  masterLimiter.connect(destination)

  // Params like the synth's length/pitch and the pitch envelope are consumed
  // at trigger time, not held by a Tone node — so always read them from the
  // latest sound state (updated by apply()), never the build-time snapshot.
  let current = sound
  const freshBlock = (id) => {
    for (const src of current.sources ?? []) {
      if (src.id === id) return src
      const hit = (src.chain ?? []).find((b) => b.id === id)
      if (hit) return hit
    }
    return (current.master ?? []).find((b) => b.id === id) ?? null
  }
  const freshParams = (block) => freshBlock(block.id)?.params ?? block.params
  const freshLane = (laneId) => (current.sources ?? []).find((s) => s.id === laneId)

  // Extract the amplitude curve fresh and schedule it on a lane's envGain.
  // `noteLen` is the source's own playing length, used when stretching to note.
  function scheduleAmpEnv(lane, when, noteLen) {
    if (!lane.hasAmpEnv) return null
    const block = lane.ampBlocks[0]
    const sample = getSample(block.id)
    if (!sample?.audioBuffer) return null
    const ep = freshParams(block)
    const full = sample.audioBuffer.duration
    const trimStart = Math.max(0, ep.trimStart ?? 0)
    const trimEnd = Math.min(full, ep.trimEnd ?? full)
    const curve = extractEnvelope(sample.audioBuffer, {
      smoothing: ep.smoothing, amount: ep.amount, trimStart, trimEnd,
    })
    if (curve.length < 2) return null
    const dur = Math.max(0.02, ep.stretch === 'note' ? noteLen : trimEnd - trimStart)
    const envGain = lane.envGain
    try {
      envGain.gain.cancelScheduledValues(when)
      envGain.gain.setValueCurveAtTime(curve, when, dur)
      envGain.gain.setValueAtTime(0, when + dur)
    } catch {
      envGain.gain.cancelScheduledValues(when)
      envGain.gain.setValueAtTime(1, when)
    }
    return dur
  }

  // Natural length a lane's source must be held for: the longest enabled
  // vocoder modulator in THIS lane's chain (a vocoder holds only its own lane's
  // synth carrier so the whole sentence vocodes). Samples are one-shots.
  function vocoderHold(lane) {
    let hold = 0
    for (const { block } of lane.hooks) {
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

  // Fire a single lane at `when` for one note-event `{ transpose, duration }`.
  // `transpose` shifts the pitch (semitones); `duration`, when given (a sequencer
  // step), replaces the source's own Length. Returns the lane's playing length
  // (from `when`), so the caller can fold in the lane delay for the total.
  function triggerLane(lane, when, note) {
    const { src, nodes } = lane
    const transpose = note.transpose ?? 0
    const carrierHold = (isSynthSource(lane.src.type) || isNoiseSource(lane.src.type)) ? vocoderHold(lane) : 0
    // Sound-wide voicing, read fresh: mono reuses a single voice so each note
    // steals the last; poly fans out across the pool / stacks sample voices.
    const mono = current.voicing === 'mono'
    let dur = 0

    // Reset LFO phase so each play starts from the beginning of the waveform.
    for (const { lfo } of lane.lfos) {
      lfo.stop(when)
      lfo.start(when)
    }

    if (isSynthSource(src.type)) {
      const p = freshParams(src)
      // Grab the voice that will play this note, so its pitch envelope and length
      // are scheduled on that voice alone — overlapping notes stay independent.
      // Mono pins voice 0, so each note retriggers (steals) the same voice.
      const voice = mono ? nodes.synth.voices[0] : nodes.synth.allocate()
      if (lane.envBlocks.length > 0) {
        const env = freshParams(lane.envBlocks[0])
        const sig = lane.voiceEnv.get(voice)
        sig.cancelScheduledValues(when)
        sig.setValueAtTime(env.start, when)
        sig.linearRampToValueAtTime(env.end, when + env.time)
      }
      // In natural-length mode the amp envelope (or a vocoder modulator) can
      // outlast the synth's Length, so the note is held for whatever spans
      // longest. Both *replace* Length rather than floor it.
      const hold = note.duration ?? synthHold(p, src.type)
      const ampDur = scheduleAmpEnv(lane, when, hold)
      const base = ampDur ?? (carrierHold > 0 ? carrierHold : hold)
      const noteDur = Math.max(base, carrierHold)
      voice.triggerAttackRelease(p.freq * semisToRate(transpose), noteDur, when)
      dur = noteDur + p.release
    }

    if (isNoiseSource(src.type)) {
      const p = freshParams(src)
      const len = note.duration ?? p.duration
      const ampDur = scheduleAmpEnv(lane, when, len)
      const base = ampDur ?? (carrierHold > 0 ? carrierHold : len)
      const noteDur = Math.max(base, carrierHold)
      nodes.synth.triggerAttackRelease(noteDur, when)
      dur = noteDur + p.release
    }

    if (src.type === 'sample') {
      const sample = getSample(src.id)
      if (sample?.audioBuffer) {
        // Voice cap: when the lane is already at the max ringing voices, steal
        // the oldest (a Set keeps insertion order) so retriggers overlap up to
        // the cap. The stolen voice's own onended/onstop prunes + disposes it.
        // Mono caps at 1, so a retrigger cuts the previous sample.
        const sampleCap = mono ? 1 : MAX_SAMPLE_VOICES
        while (lane.activeSampleSources.size >= sampleCap) {
          const oldest = lane.activeSampleSources.values().next().value
          lane.activeSampleSources.delete(oldest)
          try { oldest.stop() } catch { /* already stopped */ }
        }

        const p = freshParams(src)
        const baseRate = semisToRate(p.pitch + transpose)
        const full = sample.audioBuffer.duration
        const trimStart = Math.max(0, p.trimStart ?? 0)
        const trimEnd = Math.min(full, p.trimEnd ?? full)
        let buf = new Tone.ToneAudioBuffer(sample.audioBuffer)
        if (trimEnd - trimStart > 0.002 && (trimStart > 0.001 || trimEnd < full - 0.001)) {
          buf = buf.slice(trimStart, trimEnd)
        }

        // Granular mode: a Tone.GrainPlayer replays the (trimmed) buffer as a
        // cloud of overlapping grains, with pitch (detune) and speed (playback
        // rate) independent. Spawned per-trigger and tracked exactly like the
        // ToneBufferSource below. Pitch LFO/Envelope don't apply — GrainPlayer's
        // detune/playbackRate are plain numbers, not connectable Signals.
        if (p.mode === 'granular') {
          const overlapSec = Math.min(p.grainSize * 0.95, p.overlap * p.grainSize)
          const player = new Tone.GrainPlayer({ url: buf, grainSize: p.grainSize, overlap: overlapSec, loop: p.loop })
          player.playbackRate = Math.max(0.1, p.speed)
          player.detune = (p.pitch + transpose) * 100
          player.connect(nodes.gain)
          player.onstop = () => {
            lane.activeSampleSources.delete(player)
            try { player.disconnect(); player.dispose() } catch { /* disposed */ }
          }
          lane.activeSampleSources.add(player)
          player.start(when)
          const playLen = p.loop ? p.length : (trimEnd - trimStart) / Math.max(0.1, p.speed)
          player.stop(when + playLen + (p.loop ? 0 : 0.05))
          scheduleAmpEnv(lane, when, playLen)
          dur = playLen
        } else {
          const srcNode = new Tone.ToneBufferSource(buf)
          srcNode.playbackRate.value = baseRate

          let minRate = baseRate
          if (lane.envBlocks.length > 0) {
            const env = freshParams(lane.envBlocks[0])
            const startRate = baseRate * centsToRate(env.start)
            const endRate = baseRate * centsToRate(env.end)
            srcNode.playbackRate.setValueAtTime(startRate, when)
            srcNode.playbackRate.exponentialRampToValueAtTime(endRate, when + env.time)
            minRate = Math.min(minRate, startRate, endRate)
          }
          for (const { block: lb, lfo } of lane.lfos) {
            const delta = baseRate * (centsToRate(freshParams(lb).depth) - 1)
            lfo.min = -delta
            lfo.max = delta
            lfo.connect(srcNode.playbackRate)
          }

          srcNode.connect(nodes.gain)
          srcNode.onended = () => {
            lane.activeSampleSources.delete(srcNode)
            try { srcNode.disconnect(); srcNode.dispose() } catch { /* disposed */ }
          }
          lane.activeSampleSources.add(srcNode)
          srcNode.start(when)
          const playLen = (trimEnd - trimStart) / Math.max(0.05, minRate)
          scheduleAmpEnv(lane, when, playLen)
          dur = playLen
        }
      }
    }

    // This lane's per-Play insert hooks (e.g. vocoder modulator) fire here.
    for (const { block, onTrigger } of lane.hooks) {
      onTrigger(when, { params: freshParams(block), sample: getSample(block.id), nodes: triggerNodes })
    }
    return dur
  }

  // Fire the sound. `notes` is a list of note-events
  //   { transpose (semitones), offset (seconds from `when`), duration? }
  // — a chord is several events at offset 0, a sequence is several at rising
  // offsets. Back-compat: a bare number is the legacy single-note transpose
  // (keyboard play), and undefined is one note at the source's own pitch.
  function trigger(when = Tone.now(), notes = 0) {
    const events = normalizeNotes(notes)
    let total = 0
    for (const note of events) {
      const offset = Math.max(0, note.offset ?? 0)
      for (const lane of lanes) {
        const laneNow = freshLane(lane.src.id)
        const delay = Math.max(0, laneNow?.delay ?? 0)
        const dur = triggerLane(lane, when + offset + delay, note)
        total = Math.max(total, offset + delay + dur)
      }
    }
    // Master hooks (rare — a vocoder dropped on the mix) fire once, undelayed:
    // they shape the mix, not individual notes.
    for (const { block, onTrigger } of masterHooks) {
      onTrigger(when, { params: freshParams(block), sample: getSample(block.id), nodes: triggerNodes })
    }
    return total
  }

  function apply(soundNow) {
    current = soundNow
    masterOut.volume.value = soundNow.outputVolume ?? 0

    for (const lane of lanes) {
      const src = (soundNow.sources ?? []).find((s) => s.id === lane.src.id)
      if (!src) continue
      lane.laneVol.volume.value = src.level ?? 0
      lane.lanePan.pan.value = src.pan ?? 0

      // Source block params.
      if (lane.def.apply) {
        lane.def.apply(lane.nodes, src.params)
        if (lane.hasAmpEnv && (isSynthSource(lane.src.type) || isNoiseSource(lane.src.type))) flattenEnv(lane.nodes.synth)
      }
      // Live voicing toggle (not structural — no rebuild): retune the pool gain.
      if (isSynthSource(lane.src.type)) lane.nodes.synth.setVoicing(soundNow.voicing === 'mono')

      // Lane chain blocks.
      for (const block of src.chain ?? []) {
        const entry = built.get(block.id)
        if (!entry) continue
        if (block.type === 'pitchlfo' && entry.nodes.lfo) {
          entry.nodes.lfo.frequency.value = block.params.rate
          entry.nodes.lfo.type = block.params.wave
          if (isSynthSource(lane.src.type)) {
            entry.nodes.lfo.min = -block.params.depth
            entry.nodes.lfo.max = block.params.depth
          }
        } else if (entry.def.apply) {
          entry.def.apply(entry.nodes, block.params)
        }
      }
    }

    // Master chain blocks.
    for (const block of soundNow.master ?? []) {
      const entry = built.get(block.id)
      if (entry?.def.apply) entry.def.apply(entry.nodes, block.params)
    }
  }

  function dispose() {
    for (const lane of lanes) {
      lane.activeSampleSources.forEach((s) => {
        try { s.stop(); s.dispose() } catch { /* already gone */ }
      })
      lane.activeSampleSources.clear()
    }
    triggerNodes.forEach((n) => {
      try { n.stop?.(); n.dispose() } catch { /* already gone */ }
    })
    triggerNodes.clear()
    disposables.forEach((n) => {
      try { n.dispose() } catch { /* already gone */ }
    })
    built.clear()
  }

  await Promise.all(readyPromises)
  return {
    trigger, apply, dispose,
    getAnalyser: (id) => built.get(id)?.nodes?.analyser ?? null,
  }
}

// structureParams are params that change the node graph itself (e.g. the detune
// voice count) — included here so they force a rebuild on change. Lane mix props
// (delay/level/pan) are NOT structural: delay is read fresh at trigger, level
// and pan are updated in place by apply().
function blockKey(b) {
  const extra = (BLOCK_DEFS[b.type]?.structureParams ?? []).map((k) => b.params[k]).join(',')
  return `${b.id}:${b.type}:${b.enabled ? 1 : 0}${extra ? `:${extra}` : ''}`
}

export function structureKey(sound) {
  const laneKeys = (sound.sources ?? []).map((src) => {
    const chain = (src.chain ?? []).map(blockKey).join(',')
    return `${blockKey(src)}[${chain}]`
  })
  const master = (sound.master ?? []).map(blockKey).join(',')
  return `${laneKeys.join('|')}#${master}`
}

// A lane's own playing length from its trigger (source + holds + its inserts'
// tails), excluding the lane delay. Shared by the renderer and the timeline UI
// so bar lengths match what's actually rendered.
export function laneDuration(src) {
  let laneDur = (isSynthSource(src.type) || isNoiseSource(src.type)) ? synthHold(src.params, src.type) + src.params.release : 0

  if (src.type === 'sample') {
    const sample = getSample(src.id)
    if (sample?.audioBuffer) {
      const full = sample.audioBuffer.duration
      const playedLen =
        Math.min(full, src.params.trimEnd ?? full) - Math.max(0, src.params.trimStart ?? 0)
      if (src.params.mode === 'granular') {
        // Granular decouples pitch from speed: a loop drones for `length`,
        // otherwise the slice plays through at `speed` (pitch env/LFO don't apply).
        laneDur = Math.max(
          laneDur,
          src.params.loop ? src.params.length : playedLen / Math.max(0.1, src.params.speed),
        )
      } else {
        let minRate = semisToRate(src.params.pitch)
        const env = (src.chain ?? []).find((b) => b.type === 'pitchenv' && b.enabled)
        if (env) {
          minRate = Math.min(
            minRate,
            minRate * centsToRate(env.params.start),
            minRate * centsToRate(env.params.end),
          )
        }
        laneDur = Math.max(laneDur, playedLen / Math.max(0.05, minRate))
      }
    }
  }

  // A natural-length sample envelope can hold this lane's source longer.
  const ampEnv = (src.chain ?? []).find(
    (b) => b.type === 'samplenv' && b.enabled && b.params.stretch === 'natural',
  )
  if (ampEnv) {
    const s = getSample(ampEnv.id)
    if (s?.audioBuffer) {
      const full = s.audioBuffer.duration
      laneDur = Math.max(
        laneDur,
        Math.min(full, ampEnv.params.trimEnd ?? full) - Math.max(0, ampEnv.params.trimStart ?? 0),
      )
    }
  }
  // A vocoder holds this lane's synth/noise carrier for its modulator's length.
  if (isSynthSource(src.type) || isNoiseSource(src.type)) {
    for (const block of src.chain ?? []) {
      if (block.type !== 'vocoder' || !block.enabled) continue
      const s = getSample(block.id)
      if (!s?.audioBuffer) continue
      const full = s.audioBuffer.duration
      laneDur = Math.max(
        laneDur,
        Math.min(full, block.params.trimEnd ?? full) - Math.max(0, block.params.trimStart ?? 0),
      )
    }
  }

  // Tails from this lane's own inserts.
  let laneTail = 0
  for (const block of src.chain ?? []) {
    const def = BLOCK_DEFS[block.type]
    if (block.enabled && def?.tailSeconds) laneTail = Math.max(laneTail, def.tailSeconds(block.params))
  }
  return Math.max(0.1, laneDur) + laneTail
}

export function estimateDuration(sound) {
  let end = 0
  for (const src of sound.sources ?? []) {
    if (!src.enabled) continue
    end = Math.max(end, (src.delay ?? 0) + laneDuration(src))
  }

  // The sequencer schedules notes out to `sequenceSpan` (last note's end); add
  // it so the window covers the sequence plus the source's natural ring-out
  // (release + insert tails, already folded into `end`). Zero when inactive.
  end += sequenceSpan(sound.sequencer)

  // Tails from the shared master chain.
  let masterTail = 0
  for (const block of sound.master ?? []) {
    const def = BLOCK_DEFS[block.type]
    if (block.enabled && def?.tailSeconds) masterTail = Math.max(masterTail, def.tailSeconds(block.params))
  }

  return Math.min(30, end + masterTail + 0.25)
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

  // `notes` is forwarded straight to trigger(): a bare semitone number for
  // keyboard play today, or a note-event list once chord/sequencer drivers exist.
  async play(sound, notes = 0) {
    await Tone.start()
    await this.sync(sound)
    if (!this.handle) return { duration: 0 }
    this.handle.apply(sound)
    const duration = this.handle.trigger(undefined, notes)
    return { duration }
  }

  getAnalyser(id) {
    return this.handle?.getAnalyser(id) ?? null
  }

  dispose() {
    this.buildToken += 1
    this.handle?.dispose()
    this.handle = null
  }
}

export const liveEngine = new LiveEngine()
