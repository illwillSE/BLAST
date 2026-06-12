// Runtime store for sample audio, keyed by block id. AudioBuffers and the
// original file bytes live here (not in React state) because they are not
// serializable; project save/load reads and repopulates this cache.

const cache = new Map()
const listeners = new Set()

export function setSample(blockId, { blob, fileName, audioBuffer }) {
  cache.set(blockId, { blob, fileName, audioBuffer })
  listeners.forEach((fn) => fn(blockId))
}

export function getSample(blockId) {
  return cache.get(blockId) || null
}

export function removeSample(blockId) {
  cache.delete(blockId)
  listeners.forEach((fn) => fn(blockId))
}

export function allSamples() {
  return [...cache.entries()]
}

export function onSampleChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export async function decodeBlob(blob) {
  const arrayBuffer = await blob.arrayBuffer()
  const ctx = new OfflineAudioContext(2, 1, 44100)
  return ctx.decodeAudioData(arrayBuffer)
}
