// Runtime store for sample audio, keyed by block id. AudioBuffers and the
// original file bytes live here (not in React state) because they are not
// serializable; project save/load reads and repopulates this cache.

import type { CachedSample } from '../blocks/registry'

const cache = new Map<string, CachedSample>()
const listeners = new Set<(blockId: string) => void>()
const history = new Map<string, CachedSample[]>() // blockId -> stack of previous cache entries (max 10)

export function pushHistory(blockId: string): void {
  const entry = cache.get(blockId)
  if (!entry) return
  const stack = history.get(blockId) || []
  stack.push(entry)
  if (stack.length > 10) stack.shift()
  history.set(blockId, stack)
}

export function undoSample(blockId: string): boolean {
  const stack = history.get(blockId)
  const prev = stack?.pop()
  if (!prev) return false
  cache.set(blockId, prev)
  listeners.forEach((fn) => fn(blockId))
  return true
}

export function hasHistory(blockId: string): boolean {
  return (history.get(blockId)?.length ?? 0) > 0
}

export function setSample(blockId: string, { blob, fileName, audioBuffer }: CachedSample): void {
  cache.set(blockId, { blob, fileName, audioBuffer })
  listeners.forEach((fn) => fn(blockId))
}

export function getSample(blockId: string): CachedSample | null {
  return cache.get(blockId) || null
}

export function removeSample(blockId: string): void {
  cache.delete(blockId)
  listeners.forEach((fn) => fn(blockId))
}

export function allSamples(): [string, CachedSample][] {
  return [...cache.entries()]
}

export function onSampleChange(fn: (blockId: string) => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export async function decodeBlob(blob: Blob): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer()
  const ctx = new OfflineAudioContext(2, 1, 44100)
  return ctx.decodeAudioData(arrayBuffer)
}
