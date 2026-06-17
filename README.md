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

- **Synth source** — sine / square / sawtooth / triangle oscillator with full ADSR envelope, pitch, and note length. Extras: band-limited partial-count types (`square4`, `sawtooth8`), pulse wave with adjustable width, a draggable harmonics editor to draw a fully custom waveform, and a live ADSR/waveform preview while tweaking
- **Sample source** — drag & drop / browse an audio file (WAV, MP3, OGG…) **or** record straight from the microphone. Waveform display with trim region and playback cursor. **Grain Player mode**: decouple pitch from playback speed, set grain size and overlap — great for textural drones and glitchy effects
- **Metal Synth source** — percussive metallic source block (`Tone.MetalSynth`) for cymbals, bells, and clangs
- **Noise source** — white / pink / brown noise with its own ADSR envelope (`Tone.NoiseSynth`) for wind, snares, explosions, and gunshots
- **Layered sources** — stack multiple source lanes per sound (e.g. low rumble + high whine), each with its own insert chain, level, pan, and delay, all mixed before the master chain. The bus inspector gives every lane a mixer strip with level, pan, mute, and remove controls
- **Effect blocks** — reverb (with one-click room-size presets), delay (with ping-pong L/R mode), EQ, filter, compressor, gate, pitch shift, detune, overdrive, bitcrusher, volume, pan, and a lane analyzer card with waveform, spectrum, waterfall, and fire views
- **Master chain** — effects applied to the final mix of all source lanes; includes a master limiter with a clip meter
- **Vocoder** — insert block: chain signal is the carrier, a dropped/recorded speech sample is the modulator. N band-pass pairs + sibilance high-pass passthrough for clear S/T sounds
- **Pitch modulation** — first-class blocks for classic game-sfx movement:
  - *Pitch LFO* — vibrato, sirens, wobbles
  - *Pitch Envelope* — rising power-ups, falling lasers, sweeps
- **Sample Envelope** — control block that extracts the amplitude contour from a dropped or recorded sample and uses it to shape the synth's volume. Drop a "pew-pew" voice recording; the synth follows your timing and dynamics. The contour editor supports trim handles and a crisp fixed-height preview
- **Step sequencer** — a per-sound step sequencer with a piano-roll pop-out. Each step carries pitch and length; triggers run through the voice pool so step tails ring out polyphonically instead of cutting off
- **Multiple sounds per project** — each independently named and configured
- **Auto-save** — project state (sounds, chains, params, sequencer) saves to the browser automatically; reloading the page restores the last session
- **Project save/load** — everything (settings + original samples) packed into a single ZIP. Start over from Settings with a confirmed New Project action
- **WAV export** — render any sound to WAV with configurable sample rate, channel count, and format
- **Background visualization** — an optional particle field behind the editor that reacts to the live output; drag to rotate. Toggle it in Settings → General

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

- Sounds are plain serializable objects. Each block is `{ id, type, enabled, params }` and the block *registry* (`src/blocks/registry.js`) defines params + Tone.js wiring per type — adding a new effect is one registry entry.
- A sound is a **hybrid per-lane model**: one or more source lanes (each with its own insert chain, level, pan, delay) mix at a shared bus before the master chain. The voice pool (`src/audio/voicePool.js`) lets overlapping triggers ring out polyphonically.
- The audio graph is built from the same code path for live playback and offline WAV rendering.
- The step sequencer is sound-level (not a chain block) — it governs trigger timing and is edited through a pop-out piano roll.

## Project format

A `.blast.zip` contains `project.json` (all sounds and settings) plus `samples/` with the untouched original audio files, so projects reload bit-identically.
