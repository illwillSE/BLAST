# BLAST — TODO

Ideas and planned work, roughly prioritized. Items come from the original
design brief and from development discussions.

## Features

- [ ] **Sample export options** — more control over exported audio
      (format, sample rate, mono/stereo?).
- [ ] **Sound rename** — renaming beyond the double-click in the sound
      list (e.g. from the chain header).
- [ ] **Export sample from sample source** — download the (edited) sample
      straight from the Sample block, for ease of use.
- [ ] **Sample as envelope for the synth** — use a sample's amplitude
      contour to shape the synth's volume over time. Follow the sample's
      loudness with an envelope follower, or extract the contour offline.
- [ ] **Richer synth oscillator** — Tone.js OmniOscillator extras:
      partial-count types (`square4`, `sawtooth8`), a custom-partials
      harmonics editor (draggable bars — "draw your own waveform"), and
      pulse width. Skip `fat*` types (Detune block covers that).
- [ ] **Noise oscillator** — add white/pink/brown noise as a synth wave
      option (`Tone.Noise`). Unlocks gunshots, explosions, wind, snares;
      currently only tonal waveforms exist.
- [ ] **Live recording waveform** — show a scrolling waveform *while*
      recording (WaveSurfer Record plugin). Today the waveform only appears
      after pressing Stop.
- [ ] **Synth visualization** — the synth source has no visual identity;
      an oscilloscope or rendered ADSR/waveform preview that updates while
      tweaking would help.
- [ ] **Region looping** — loop the trimmed sample region for sustained
      sounds (engines, wind); regions plugin emits the needed events.
- [ ] **Sample editor polish** — arrow-key nudging of in/out points,
      optional snap-to-zero-crossing.

## From the original brief (build later, don't preclude)

- [ ] **Layered sources** — multiple source blocks per sound (e.g. low
      rumble + high whine) mixed before the effects chain. Engine already
      mixes sources into a bus; UI assumes a single source.
- [ ] **Sequencer block** — short melodic sequences (2–10 notes) played
      through the sound's chain: pitch + duration per step, tempo control.
      For coin pickups, jingles, game-over tunes.

## Polish / housekeeping

- [ ] Decide the default Output display mode (currently `waveform`;
      candidates: `spectrum`, `fire`).
- [ ] Screenshot in the README once the UI is settled.
- [ ] Code-split the bundle (Tone.js pushes the main chunk past 500 kB —
      Vite build warning).
- [ ] Browser smoke test (Playwright script: load, play, add blocks,
      export WAV, check console errors).
