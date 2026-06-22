// Tiny event bus for play events so waveform cursors and meters can react
// without threading callbacks through the component tree.

export interface PlayInfo {
  soundId: string
  duration: number
}

type PlayHandler = (info: PlayInfo) => void

const handlers = new Set<PlayHandler>()

export function onPlay(fn: PlayHandler): () => void {
  handlers.add(fn)
  return () => { handlers.delete(fn) }
}

export function emitPlay(info: PlayInfo): void {
  handlers.forEach((fn) => fn(info))
}
