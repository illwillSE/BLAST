import toWav from 'audiobuffer-to-wav'

// Destructive sample edits. Each returns a NEW AudioBuffer; callers store
// the result (plus a WAV re-encode) back into the sample cache.

function makeBuffer(channels, sampleRate) {
  const buf = new AudioBuffer({
    numberOfChannels: channels.length,
    length: channels[0].length,
    sampleRate,
  })
  channels.forEach((data, i) => buf.copyToChannel(data, i))
  return buf
}

function channelsOf(buffer) {
  return Array.from({ length: buffer.numberOfChannels }, (_, i) =>
    Float32Array.from(buffer.getChannelData(i)),
  )
}

export function reverseBuffer(buffer) {
  const channels = channelsOf(buffer).map((d) => d.reverse())
  return makeBuffer(channels, buffer.sampleRate)
}

export function normalizeBuffer(buffer) {
  const channels = channelsOf(buffer)
  let peak = 0
  for (const d of channels) for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]))
  if (peak > 0.0001) {
    const gain = 0.99 / peak
    for (const d of channels) for (let i = 0; i < d.length; i++) d[i] *= gain
  }
  return makeBuffer(channels, buffer.sampleRate)
}

// Linear fade over 15% of the buffer, capped at 0.5s.
export function fadeBuffer(buffer, direction) {
  const channels = channelsOf(buffer)
  const n = channels[0].length
  const fadeLen = Math.min(Math.floor(n * 0.15), Math.floor(buffer.sampleRate * 0.5))
  for (const d of channels) {
    for (let i = 0; i < fadeLen; i++) {
      const gain = i / fadeLen
      if (direction === 'in') d[i] *= gain
      else d[n - 1 - i] *= gain
    }
  }
  return makeBuffer(channels, buffer.sampleRate)
}

export function cropBuffer(buffer, startSec, endSec) {
  const from = Math.max(0, Math.floor(startSec * buffer.sampleRate))
  const to = Math.min(buffer.length, Math.ceil(endSec * buffer.sampleRate))
  if (to - from < 2) return null
  const channels = channelsOf(buffer).map((d) => d.slice(from, to))
  return makeBuffer(channels, buffer.sampleRate)
}

export function bufferToWavBlob(buffer) {
  return new Blob([toWav(buffer)], { type: 'audio/wav' })
}
