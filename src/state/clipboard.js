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

let entry = null
const listeners = new Set()

export function setClipboard(e) {
  entry = e
  listeners.forEach((fn) => fn())
}

export function getClipboard() {
  return entry
}

export function clearClipboard() {
  setClipboard(null)
}

export function onClipboardChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// Re-renders the caller whenever the clipboard changes (to enable/disable paste
// affordances). Returns the current entry.
export function useClipboard() {
  return useSyncExternalStore(onClipboardChange, getClipboard, getClipboard)
}

// ---- copy helpers (read-only; safe to call from anywhere) ------------------

export function copyBlock(block) {
  setClipboard({
    kind: 'block',
    block: structuredClone({ type: block.type, enabled: block.enabled, params: block.params }),
    sample: getSample(block.id), // cache entry shared by reference (immutable)
  })
}

export function copySample(block) {
  const sample = getSample(block.id)
  if (!sample) return
  setClipboard({ kind: 'sample', sample, label: sample.fileName })
}
