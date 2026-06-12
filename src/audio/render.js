import * as Tone from 'tone'
import toWav from 'audiobuffer-to-wav'
import { buildChain, estimateDuration } from './engine'

// Renders a sound offline to a stereo 44.1kHz WAV blob.
export async function renderSoundToWav(sound) {
  const duration = estimateDuration(sound)
  const toneBuffer = await Tone.Offline(
    async ({ destination }) => {
      const handle = await buildChain(sound, destination)
      handle.trigger(0.01)
    },
    duration + 0.05,
    2,
    44100,
  )
  const wavData = toWav(toneBuffer.get())
  return new Blob([wavData], { type: 'audio/wav' })
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export function safeFileName(name) {
  return name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'sound'
}
