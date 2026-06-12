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

export function newSound(name) {
  return {
    id: uid('snd'),
    name,
    outputVolume: 0,
    outputView: 'wave',
    // blocks[0..n]: sources first, then effects, in signal order.
    // Kept as a flat ordered array so multiple sources or a trailing
    // sequencer block can be added later without a schema change.
    blocks: [newBlock('synth')],
  }
}

export function newProject() {
  return { name: 'Untitled Project', version: 1, sounds: [newSound('Sound 1')] }
}

export function isSource(block) {
  return BLOCK_DEFS[block.type].kind === 'source'
}

export function getSource(sound) {
  return sound.blocks.find(isSource)
}
