import * as Tone from 'tone'
import toWav from 'audiobuffer-to-wav'
import { buildChain, estimateDuration } from './engine'

// Export options — the single source of truth for both the settings UI and the
// renderer. `format` picks the WAV sample format (16-bit PCM vs 32-bit float).
export const SAMPLE_RATES = [11025, 22050, 44100]
export const EXPORT_CHANNELS = [
  { value: 2, label: 'Stereo' },
  { value: 1, label: 'Mono' },
]
export const EXPORT_FORMATS = [
  { value: 'pcm16', label: '16-bit PCM' },
  { value: 'float32', label: '32-bit float' },
]
export const DEFAULT_EXPORT = { sampleRate: 44100, channels: 2, format: 'pcm16' }

// Renders a sound offline to a WAV blob using the given export options.
export async function renderSoundToWav(sound, opts) {
  const { sampleRate, channels, format } = { ...DEFAULT_EXPORT, ...opts }
  const duration = estimateDuration(sound)
  const toneBuffer = await Tone.Offline(
    async ({ destination }) => {
      const handle = await buildChain(sound, destination)
      handle.trigger(0.01)
    },
    duration + 0.05,
    channels,
    sampleRate,
  )
  const wavData = toWav(toneBuffer.get(), { float32: format === 'float32' })
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
