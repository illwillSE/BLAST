// App-wide clipboard, mirroring sampleCache.js: a single module-level entry plus
// a listener set, so any component can copy/paste without prop-drilling. The
// entry outlives sound switches, which is what makes cross-sound paste free.
//
// Entry shapes:
//   { kind: 'block', block: { type, enabled, params }, sample: cacheEntry|null }
//   { kind: 'sample', sample: cacheEntry, label }
// where cacheEntry is { blob, fileName, audioBuffer } from the sample cache.

import { useSyncExternalStore } from 'react'
import { getSample } from '../audio/sampleCache'
import type { CachedSample } from '../blocks/registry'
import type { Block, BlockParams, BlockType } from '../types'

export interface BlockClipboard {
  kind: 'block'
  block: { type: BlockType; enabled: boolean; params: BlockParams }
  sample: CachedSample | null
}

export interface SampleClipboard {
  kind: 'sample'
  sample: CachedSample
  label: string
}

export type ClipboardEntry = BlockClipboard | SampleClipboard

let entry: ClipboardEntry | null = null
const listeners = new Set<() => void>()

export function setClipboard(e: ClipboardEntry | null): void {
  entry = e
  listeners.forEach((fn) => fn())
}

export function getClipboard(): ClipboardEntry | null {
  return entry
}

export function clearClipboard(): void {
  setClipboard(null)
}

export function onClipboardChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

// Re-renders the caller whenever the clipboard changes (to enable/disable paste
// affordances). Returns the current entry.
export function useClipboard(): ClipboardEntry | null {
  return useSyncExternalStore(onClipboardChange, getClipboard, getClipboard)
}

// ---- copy helpers (read-only; safe to call from anywhere) ------------------

export function copyBlock(block: Block): void {
  setClipboard({
    kind: 'block',
    block: structuredClone({ type: block.type, enabled: block.enabled, params: block.params }),
    sample: getSample(block.id), // cache entry shared by reference (immutable)
  })
}

export function copySample(block: Block): void {
  const sample = getSample(block.id)
  if (!sample) return
  setClipboard({ kind: 'sample', sample, label: sample.fileName })
}
