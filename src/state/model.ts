import { BLOCK_DEFS } from '../blocks/registry'
import { DEFAULT_EXPORT } from '../audio/render'
import { newSequencer } from '../audio/sequencer'
import type {
  Block,
  BlockType,
  Lane,
  ParamsForType,
  Project,
  SourceType,
  Sound,
  Target,
} from '../types'

let counter = 0
export function uid(prefix = 'id'): string {
  counter += 1
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`
}

export function defaultParams<T extends BlockType>(type: T): ParamsForType<T> {
  const def = BLOCK_DEFS[type]
  // Built from the registry's param defs, so the precise per-type shape can't be
  // proven structurally — assert it at this data-driven boundary.
  const params: Record<string, unknown> = {}
  // Clone array defaults (e.g. the synth harmonics) so blocks never share a
  // mutable reference with each other or with the registry.
  for (const p of def.params) params[p.key] = Array.isArray(p.default) ? p.default.slice() : p.default
  return params as unknown as ParamsForType<T>
}

export function newBlock<T extends BlockType>(type: T): Extract<Block, { type: T }> {
  // Same data-driven boundary: `type` and `params` are correlated at runtime but
  // can't be linked statically from a value-level tag.
  return { id: uid('blk'), type, enabled: true, params: defaultParams(type) } as unknown as Extract<Block, { type: T }>
}

// A "lane" is a source block plus its own left-to-right effects `chain` and a
// few lane-level mix properties. Each lane mixes into a shared bus, then the
// sound's `master` chain processes the combined signal. Lane mix props:
//   enabled — false = muted (skipped at build)
//   delay   — seconds offset from trigger (game-audio layering)
//   level   — dB, pan — stereo position (-1..1)
export function newLane(type: SourceType = 'synth'): Lane {
  return { ...newBlock(type), chain: [], delay: 0, level: 0, pan: 0 }
}

export function newSound(name: string): Sound {
  return {
    id: uid('snd'),
    name,
    outputVolume: 0,
    // Sound-wide voicing: 'poly' stacks overlapping notes/chords across the
    // voice pool; 'mono' reuses a single voice so each note steals the last.
    voicing: 'poly',
    // Hybrid per-lane model: one or more source lanes mix at a shared bus,
    // then the master chain processes the mix → output.
    sources: [newLane('synth')],
    master: [],
    // Sound-level step sequencer (disabled by default). Drives the trigger; not
    // an audio block. See src/audio/sequencer.js.
    sequencer: newSequencer(),
  }
}

export function newProject(): Project {
  return { name: 'Untitled Project', version: 1, export: { ...DEFAULT_EXPORT }, sounds: [newSound('Sound 1')] }
}

export function isSource(block: Block): boolean {
  return BLOCK_DEFS[block.type]?.kind === 'source'
}

// Every block in a sound, in a stable order: each lane's source then its chain,
// then the master chain. Used for save manifests, param backfill, and lookups.
export function allBlocks(sound: Sound): Block[] {
  const out: Block[] = []
  for (const src of sound.sources ?? []) {
    out.push(src)
    for (const b of src.chain ?? []) out.push(b)
  }
  for (const b of sound.master ?? []) out.push(b)
  return out
}

export function findBlock(sound: Sound, id: string): Block | null {
  return allBlocks(sound).find((b) => b.id === id) ?? null
}

// The lane (source) a block belongs to, or null if it lives in master.
export function findLane(sound: Sound, blockId: string): Lane | null {
  return (sound.sources ?? []).find(
    (src) => src.id === blockId || (src.chain ?? []).some((b) => b.id === blockId),
  ) ?? null
}

// ---- pure sound transforms (a block lives in a lane chain or in master) ----

// A "target" addresses a chain: a lane (source) id, or the string 'master'.
export const MASTER = 'master'

// Apply `fn` to whichever block has `blockId` — a source head, a lane-chain
// block, or a master block — returning a new sound. `fn` preserves the
// properties it doesn't change, so applying it to a lane head keeps the lane's
// chain + mix props (hence the `as Lane` at that position).
export function mapBlock(sound: Sound, blockId: string, fn: (block: Block) => Block): Sound {
  return {
    ...sound,
    sources: sound.sources.map((src) =>
      src.id === blockId
        ? (fn(src) as Lane)
        : { ...src, chain: src.chain.map((b) => (b.id === blockId ? fn(b) : b)) },
    ),
    master: sound.master.map((b) => (b.id === blockId ? fn(b) : b)),
  }
}

// Remove a chain/master block (source heads are removed via lane removal).
export function removeBlock(sound: Sound, blockId: string): Sound {
  return {
    ...sound,
    sources: sound.sources.map((src) => ({ ...src, chain: src.chain.filter((b) => b.id !== blockId) })),
    master: sound.master.filter((b) => b.id !== blockId),
  }
}

export function addBlock(sound: Sound, target: Target, block: Block): Sound {
  if (target === MASTER) return { ...sound, master: [...sound.master, block] }
  return {
    ...sound,
    sources: sound.sources.map((src) =>
      src.id === target ? { ...src, chain: [...src.chain, block] } : src,
    ),
  }
}

export function moveBlock(sound: Sound, target: Target, from: number, to: number): Sound {
  const reorder = <T>(arr: T[]): T[] => {
    const a = [...arr]
    const removed = a.splice(from, 1)
    a.splice(to, 0, ...removed)
    return a
  }
  if (target === MASTER) return { ...sound, master: reorder(sound.master) }
  return {
    ...sound,
    sources: sound.sources.map((src) => (src.id === target ? { ...src, chain: reorder(src.chain) } : src)),
  }
}

// Swap a lane's source type in place, keeping its chain and mix properties.
export function swapSource(lane: Lane, type: SourceType): Lane {
  return { ...newLane(type), id: lane.id, chain: lane.chain, delay: lane.delay, level: lane.level, pan: lane.pan, enabled: lane.enabled }
}
