// Ambient declarations for dependencies that ship no TypeScript types.

declare module 'audiobuffer-to-wav' {
  // Encodes an AudioBuffer to a WAV byte buffer. `float32` selects 32-bit float
  // samples (default 16-bit PCM).
  export default function audioBufferToWav(
    buffer: AudioBuffer,
    opts?: { float32?: boolean },
  ): ArrayBuffer
}
