import { BLOCK_DEFS } from '../blocks/registry'

let counter = 0
export function uid(prefix = 'id') {
  counter += 1
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`
}

export function defaultParams(type) {
  const def = BLOCK_DEFS[type]
  const params = {}
  // Clone array defaults (e.g. the synth harmonics) so blocks never share a
  // mutable reference with each other or with the registry.
  for (const p of def.params) params[p.key] = Array.isArray(p.default) ? p.default.slice() : p.default
  return params
}

export function newBlock(type) {
  return { id: uid('blk'), type, enabled: true, params: defaultParams(type) }
}

// A "lane" is a source block plus its own left-to-right effects `chain` and a
// few lane-level mix properties. Each lane mixes into a shared bus, then the
// sound's `master` chain processes the combined signal. Lane mix props:
//   enabled — false = muted (skipped at build)
//   delay   — seconds offset from trigger (game-audio layering)
//   level   — dB, pan — stereo position (-1..1)
export function newLane(type = 'synth') {
  return { ...newBlock(type), chain: [], delay: 0, level: 0, pan: 0 }
}

export function newSound(name) {
  return {
    id: uid('snd'),
    name,
    outputVolume: 0,
    outputView: 'wave',
    // Hybrid per-lane model: one or more source lanes mix at a shared bus,
    // then the master chain processes the mix → output.
    sources: [newLane('synth')],
    master: [],
  }
}

export function newProject() {
  return { name: 'Untitled Project', version: 1, sounds: [newSound('Sound 1')] }
}

export function isSource(block) {
  return BLOCK_DEFS[block.type]?.kind === 'source'
}

// Every block in a sound, in a stable order: each lane's source then its chain,
// then the master chain. Used for save manifests, param backfill, and lookups.
export function allBlocks(sound) {
  const out = []
  for (const src of sound.sources ?? []) {
    out.push(src)
    for (const b of src.chain ?? []) out.push(b)
  }
  for (const b of sound.master ?? []) out.push(b)
  return out
}

export function findBlock(sound, id) {
  return allBlocks(sound).find((b) => b.id === id) ?? null
}

// The lane (source) a block belongs to, or null if it lives in master.
export function findLane(sound, blockId) {
  return (sound.sources ?? []).find(
    (src) => src.id === blockId || (src.chain ?? []).some((b) => b.id === blockId),
  ) ?? null
}

// ---- pure sound transforms (a block lives in a lane chain or in master) ----

// A "target" addresses a chain: a lane (source) id, or the string 'master'.
export const MASTER = 'master'

// Apply `fn` to whichever block has `blockId` — a source head, a lane-chain
// block, or a master block — returning a new sound.
export function mapBlock(sound, blockId, fn) {
  return {
    ...sound,
    sources: sound.sources.map((src) =>
      src.id === blockId
        ? fn(src)
        : { ...src, chain: src.chain.map((b) => (b.id === blockId ? fn(b) : b)) },
    ),
    master: sound.master.map((b) => (b.id === blockId ? fn(b) : b)),
  }
}

// Remove a chain/master block (source heads are removed via lane removal).
export function removeBlock(sound, blockId) {
  return {
    ...sound,
    sources: sound.sources.map((src) => ({ ...src, chain: src.chain.filter((b) => b.id !== blockId) })),
    master: sound.master.filter((b) => b.id !== blockId),
  }
}

export function addBlock(sound, target, block) {
  if (target === MASTER) return { ...sound, master: [...sound.master, block] }
  return {
    ...sound,
    sources: sound.sources.map((src) =>
      src.id === target ? { ...src, chain: [...src.chain, block] } : src,
    ),
  }
}

export function moveBlock(sound, target, from, to) {
  const reorder = (arr) => {
    const a = [...arr]
    const [m] = a.splice(from, 1)
    a.splice(to, 0, m)
    return a
  }
  if (target === MASTER) return { ...sound, master: reorder(sound.master) }
  return {
    ...sound,
    sources: sound.sources.map((src) => (src.id === target ? { ...src, chain: reorder(src.chain) } : src)),
  }
}

// Swap a lane's source type in place, keeping its chain and mix properties.
export function swapSource(lane, type) {
  return { ...newLane(type), chain: lane.chain, delay: lane.delay, level: lane.level, pan: lane.pan, enabled: lane.enabled }
}
