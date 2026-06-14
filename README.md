# BLAST — Big Loud Awesome Sound Tool

A sound design app for making game sound effects, jingles, and noises — running entirely in the browser. No backend, no accounts: open it and make sounds.

![Stack](https://img.shields.io/badge/React-Vite-blue) ![Audio](https://img.shields.io/badge/audio-Tone.js-orange)

## How it works

Every sound is built as a **signal chain**: a source block followed by any number of effect blocks, processed left to right like a guitar pedalboard or modular synth.

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌──────────┐
│   SOURCE    │ ──▶ │   REVERB    │ ──▶ │   FILTER    │ ──▶ │  OUTPUT  │
│ Synth/Sample│     │  wet: 40%   │     │  cutoff:800 │     │          │
└─────────────┘     └─────────────┘     └─────────────┘     └──────────┘
                                        [+ Add Block]
```

Order matters — a filter before distortion sounds different than after. Drag blocks to reorder, click a header to expand/collapse, toggle ⏻ to bypass. Stack as many blocks of any type as you like.

## Features

- **Synth source** — sine / square / sawtooth / triangle oscillator with full ADSR envelope, pitch, and note length. Extras: band-limited partial-count types (`square4`, `sawtooth8`), pulse wave with adjustable width, and a draggable harmonics editor to draw a fully custom waveform
- **Sample source** — drag & drop / browse an audio file (WAV, MP3, OGG…) **or** record straight from the microphone. Waveform display with trim region and playback cursor. **Grain Player mode**: decouple pitch from playback speed, set grain size and overlap — great for textural drones and glitchy effects
- **Metal Synth source** — percussive metallic source block (`Tone.MetalSynth`) for cymbals, bells, and clangs
- **Noise source** — white / pink / brown noise with its own ADSR envelope (`Tone.NoiseSynth`) for wind, snares, explosions, and gunshots
- **Effect blocks** — reverb (with one-click room-size presets), delay (with ping-pong L/R mode), EQ, filter, compressor, gate, pitch shift, detune, overdrive, bitcrusher, volume, pan, spectrum analyzer
- **Vocoder** — insert block: chain signal is the carrier, a dropped/recorded speech sample is the modulator. N band-pass pairs + sibilance high-pass passthrough for clear S/T sounds
- **Pitch modulation** — first-class blocks for classic game-sfx movement:
  - *Pitch LFO* — vibrato, sirens, wobbles
  - *Pitch Envelope* — rising power-ups, falling lasers, sweeps
- **Sample Envelope** — control block that extracts the amplitude contour from a dropped or recorded sample and uses it to shape the synth's volume. Drop a "pew-pew" voice recording; the synth follows your timing and dynamics
- **Multiple sounds per project** — each independently named and configured
- **Project save/load** — everything (settings + original samples) packed into a single ZIP
- **WAV export** — render any sound to stereo 44.1 kHz WAV, offline and fast

### Controls

Every control always shows its current value. Double-click a slider to reset it; double-click a value to type an exact number (percentages entered as 0–100). `Space` plays the selected sound.

## Running it

```bash
npm install
npm run dev      # → http://localhost:5173
```

`npm run build` produces a static bundle in `dist/` — host it anywhere.

## Tech

| What | With |
|------|------|
| UI | React + Vite + Tailwind CSS |
| Synthesis & effects | Tone.js |
| Waveform display | WaveSurfer.js |
| Project files | JSZip |
| WAV encoding | audiobuffer-to-wav |

## Architecture notes

- Sounds are plain serializable objects; each block is `{ id, type, enabled, params }` and the block *registry* (`src/blocks/registry.js`) defines params + Tone.js wiring per type — adding a new effect is one registry entry.
- The audio graph is built from the same code path for live playback and offline WAV rendering.
- Sources mix into a bus before the effect chain, so **layered sources** (e.g. rumble + whine) can be added later without rewiring.
- The chain is an ordered list with no structural assumptions blocking a future **sequencer block** (short note patterns — coins, jingles, game-over tunes).

## Project format

A `.blast.zip` contains `project.json` (all sounds and settings) plus `samples/` with the untouched original audio files, so projects reload bit-identically.
