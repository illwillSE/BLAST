// Tiny event bus for play events so waveform cursors and meters can react
// without threading callbacks through the component tree.
const handlers = new Set()

export function onPlay(fn) {
  handlers.add(fn)
  return () => handlers.delete(fn)
}

export function emitPlay(info) {
  handlers.forEach((fn) => fn(info))
}
