// Ambient declarations for dependencies that ship no TypeScript types.

// WaveSurfer's plugin `.esm.js` deep paths resolve to no `.esm.d.ts`, but the
// sibling `.js` export path is typed (regions.d.ts / zoom.d.ts). Re-export those
// types for the exact `.esm.js` specifiers the app imports, so the runtime
// imports stay unchanged.
declare module 'wavesurfer.js/dist/plugins/regions.esm.js' {
  export * from 'wavesurfer.js/dist/plugins/regions.js'
  export { default } from 'wavesurfer.js/dist/plugins/regions.js'
}
declare module 'wavesurfer.js/dist/plugins/zoom.esm.js' {
  export * from 'wavesurfer.js/dist/plugins/zoom.js'
  export { default } from 'wavesurfer.js/dist/plugins/zoom.js'
}

declare module 'audiobuffer-to-wav' {
  // Encodes an AudioBuffer to a WAV byte buffer. `float32` selects 32-bit float
  // samples (default 16-bit PCM).
  export default function audioBufferToWav(
    buffer: AudioBuffer,
    opts?: { float32?: boolean },
  ): ArrayBuffer
}
