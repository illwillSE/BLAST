// Amplitude-envelope extraction for the Sample Envelope control block.
// Pure DSP on an AudioBuffer — no Tone, no DOM — so it runs identically in
// live playback and the offline WAV renderer. Produces a normalized 0..1 gain
// curve ready for AudioParam.setValueCurveAtTime.

const WINDOW_SEC = 0.01 // RMS window (~10ms)

// Extract a normalized amplitude envelope from an AudioBuffer.
//   smoothing — seconds of moving-average smoothing applied to the curve
//   amount    — 0..1 blend between a flat tone (0) and the full contour (1)
//   trimStart/trimEnd — seconds; restrict extraction to this slice (non-destructive)
export function extractEnvelope(audioBuffer, { smoothing = 0.02, amount = 1, trimStart, trimEnd } = {}) {
  const sr = audioBuffer.sampleRate
  const win = Math.max(1, Math.floor(sr * WINDOW_SEC))
  const total = audioBuffer.length
  const from = Math.max(0, Math.min(Math.floor((trimStart ?? 0) * sr), total))
  const to = Math.max(from, Math.min(Math.ceil((trimEnd ?? audioBuffer.duration) * sr), total))
  const n = to - from
  const channels = []
  for (let c = 0; c < audioBuffer.numberOfChannels; c++) channels.push(audioBuffer.getChannelData(c))

  const count = Math.max(1, Math.ceil(n / win))
  const rms = new Float32Array(count)
  let peak = 0
  for (let w = 0; w < count; w++) {
    const start = from + w * win
    const end = Math.min(to, start + win)
    let sum = 0
    let samples = 0
    for (let i = start; i < end; i++) {
      for (const data of channels) {
        const s = data[i]
        sum += s * s
        samples++
      }
    }
    const r = samples ? Math.sqrt(sum / samples) : 0
    rms[w] = r
    if (r > peak) peak = r
  }

  // Drop a few percent of the peak as a noise floor so room hiss reads as
  // silence instead of a constant drone, then auto-gain the rest to full
  // scale — quiet recordings still modulate fully.
  const floor = peak * 0.04
  let peak2 = 0
  for (let w = 0; w < count; w++) {
    rms[w] = Math.max(0, rms[w] - floor)
    if (rms[w] > peak2) peak2 = rms[w]
  }
  if (peak2 > 1e-6) for (let w = 0; w < count; w++) rms[w] /= peak2

  const smoothed = smoothCurve(rms, Math.round(smoothing / WINDOW_SEC))

  // Blend toward a flat 1.0 — amount 0 leaves the source unshaped (constant),
  // amount 1 follows the sample's contour exactly.
  for (let w = 0; w < smoothed.length; w++) {
    smoothed[w] = Math.max(0, 1 + amount * (smoothed[w] - 1))
  }
  return smoothed
}

// Symmetric moving average, radius in windows. radius < 1 = no smoothing.
function smoothCurve(curve, radius) {
  if (radius < 1) return curve
  const n = curve.length
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let sum = 0
    let c = 0
    for (let k = -radius; k <= radius; k++) {
      const j = i + k
      if (j >= 0 && j < n) { sum += curve[j]; c++ }
    }
    out[i] = sum / c
  }
  return out
}
