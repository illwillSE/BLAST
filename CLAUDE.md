# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**
- If you write 200 lines and it could be 50, rewrite it.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting, mention it.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked, mention it.

The test: Every changed line should trace directly to the user's request.

## What this is

BLAST is a browser-only sound design app (no backend): React + Vite + Tailwind v4, Tone.js for audio, WaveSurfer.js for waveforms. Each sound is a left-to-right **signal chain** of blocks: one source → effect blocks → output.

## Commands

- `npm run dev` — dev server on http://localhost:5173
- `npx vite build` (or `npm run build`) — also the compile check; there are no tests or linter
- `npm run preview` — serve the production build locally
- `npm run deploy` — build + publish `dist/` to GitHub Pages (`gh-pages`); this is the release path

## Architecture

The whole app is driven by one serializable data model. A project holds sounds; a sound is a **hybrid per-lane model**: `sources` (one or more source *lanes* that mix at a shared bus) + a `master` chain (processes the mix → output) + a `sequencer`. Each lane is `{ ...sourceBlock, chain: [], delay, level, pan }` — a source block with its own insert chain and mix settings; each block is `{ id, type, enabled, params }`. A block lives in a lane's `chain` or in `master`; a "target" addressing a chain is a lane id or the string `MASTER`. Use the helpers in `src/state/model.js` (`allBlocks`, `findBlock`, `findLane`, `mapBlock`, `addBlock`, `moveBlock`, `swapSource`) — never index `sound.blocks` (it no longer exists). Everything non-serializable (AudioBuffers, original file bytes) lives in `src/audio/sampleCache.js`, keyed by block id — project ZIP save/load (`src/utils/projectZip.js`) reads and repopulates that cache. Because it's keyed by block id, *any* block can carry an embedded sample and it serializes for free.

**State ownership:** the whole project lives in one `useState` in `src/App.jsx`; all mutations go through the pure transforms in `src/state/model.js` (they return new sounds/projects, never mutate). `src/state/presets.js` is the default project loaded on boot; `src/state/clipboard.js` backs sound copy/paste and render-to-sample. Model constructors (`newProject`/`newSound`/`newLane`/`newBlock`/`defaultParams`) also live there.

**Auto-save:** on every project change, the project JSON is written to `localStorage['blast_autosave']` (1 s debounce, first render skipped). On init the `useState` lazy initializer reads it back and runs `normalizeProject` (exported from `src/utils/projectZip.js`) so new-param backfill still applies. Sample blobs are not persisted in localStorage — they live in `sampleCache` and must be re-loaded after a page refresh (IndexedDB persistence is a planned follow-up).

### Block registry (`src/blocks/registry.js`)

Adding a block type = one registry entry (param definitions + `create`/`apply` Tone wiring) + a help entry in `src/blocks/help.js` (**both English and Swedish**; missing Swedish falls back to English). The UI (cards, sliders, add-menu, help modal) renders entirely from these definitions.

Param defs are `range` or `select` by default; a few extras: `percent: true` (edit/display 0–100 for a 0–1 value), `scale: 'log'`, `structureParams` (listed on the *block* def, force a rebuild), `show: (params) => bool` (hide a param for the current settings — e.g. the synth's pulse `width` only shows on a `pulse` wave), and `type: 'harmonics'` (an array param rendered as the draggable-bar `HarmonicsEditor`; array defaults are cloned per block in `defaultParams`). A block def can also declare `overrides: (params) => [sourceParamKey…]` — source controls it makes inert while enabled (the Sample Envelope flattens the synth ADSR, and replaces Length in `natural` mode). `disabledSourceParams(sound)` collects these and `ChainEditor` passes them to the source card, which greys those controls and makes them inert (the value still shows). The Vocoder declares `overrides: () => ['duration']`: its carrier-hold *replaces* Length (the synth carrier is stretched to the modulator's length), so Length is greyed out while it's enabled. The synth's oscillator is a Tone `OmniOscillator` driven by `applyOscillator()`: plain waves, band-limited partial counts (`sawtooth8`), a `pulse` with `width`, or a `custom` harmonic spectrum from the `harmonics` array. New params are backfilled into older saved projects on load (`normalizeProject` in `projectZip.js`).

Block `kind`s the engine treats differently:
- `source` — synth or sample; UI allows exactly one per sound, pinned first, type swapped in place. The engine mixes all sources into a bus, so future layered sources need no rewiring.
- `insert` — audio effect in the chain; bypass = excluded at build.
- `control` — pitch LFO / pitch envelope (modulate the source's pitch) and Sample Envelope (modulates the source's volume): not in the audio path, chain position is irrelevant.
- `analyzer` — a tap, audio passes by unchanged.

### Audio engine (`src/audio/engine.js`)

`buildChain(sound, destination)` constructs the Tone graph and returns `{ trigger, apply, dispose, ... }`. **The same code path serves live playback and offline WAV export** (`Tone.Offline` in `src/audio/render.js`) — anything added to the engine must work in both contexts (no DOM, no singletons bound to the live context).

Two update paths, and the distinction matters:
- **Param tweaks** → `apply()` updates Tone nodes in place; no rebuild.
- **Structure changes** (add/remove/reorder/bypass, or any param listed in a def's `structureParams`, e.g. detune `count` which changes node count) → change `structureKey(sound)` → `LiveEngine.sync` rebuilds (token-guarded against races).

Trigger-time params (synth length/pitch, pitch-env values, sample trim) are read **fresh at trigger** via `freshParams()` — never captured at build. A past bug came from reading the build-time snapshot.

**Polyphony** (`src/audio/voicePool.js`, `VoicePool`): triggers allocate voices from a pool so overlapping notes (chords, sequencer step tails) ring out instead of stealing each other. Per-trigger source spawning goes through the pool; respect it when adding trigger-time nodes.

Tone.js gotcha encoded in the engine: connecting a signal into a `Tone.Signal` **overrides** its `.value`, so pitch-env automation goes through a separate `envSignal` summed into `synth.detune` alongside LFOs. Sample pitch modulation works on the per-trigger buffer source's `playbackRate` Param (native AudioParam, sums normally).

Sample Envelope (`samplenv`) flattens the synth ADSR: when one is enabled, each synth source's envelope is neutralized via `flattenEnv` (attack≈5ms, decay 0, sustain 1, release≈10ms) so the extracted amplitude curve — scheduled on the source's `envGain` in `scheduleAmpEnv` — fully owns the volume shape. `apply()` re-flattens after `def.apply` rewrites the ADSR from params. Presence is part of `structureKey`, so enabling/bypassing the block rebuilds and restores the normal ADSR. The synth's ADSR sliders still show their values; they're just overridden at the audio level while it's active.

**Per-trigger inserts** (`onTrigger` hook): historically only sources fired on Play. An insert's `create()` may now return an `onTrigger(when, { params, sample, nodes })` alongside `{ nodes, input, output }`; the engine collects these into `triggerHooks` and calls them every trigger with **fresh** params + the cached sample, after the sources fire. The hook spawns short-lived nodes (e.g. a `ToneBufferSource`) and registers them in the passed `nodes` set so `dispose()` cleans them up; it's responsible for stopping its own previous spawn on re-trigger. The **Vocoder** (`vocoder`, insert) uses this: the chain signal is the carrier, an embedded speech sample is the modulator started fresh each Play. Guts are N band-pass pairs (carrier + modulator) with a `Tone.Follower` per band gating the matching carrier band, plus a high-pass sibilance passthrough; band count (`bands`) is a `structureParam`. A vocoder **holds the synth carrier** for the modulator's trimmed length — `vocoderHold()` in `trigger()` governs `noteDur` (replacing the synth's Length, which is greyed out via `overrides`), and `estimateDuration()` grows the render window — the same idea as the Sample Envelope's natural mode (only synth carriers extend; a sample carrier is a one-shot).

### Sequencer (`src/audio/sequencer.js`)

`sound.sequencer` is disabled by default; when on it drives trigger timing (steps ring out via the voice pool rather than cutting off). It is *sound-level*, **not** a chain-end audio block — it governs the trigger and is not in the audio path. Edited through `SequencerModal`/`SequencerEditor`.

### UI conventions

- Sliders: double-click track = reset; double-click the value = exact entry popup (percent params edit as whole 0–100 via `percent: true` on the param def); arrow keys = one param step, shift = ×10.
- Space is global transport (plays selected sound) except in text-entry fields.
- Tailwind v4: dynamic class names don't compile — category colors use the explicit class-string map `CAT_STYLES` in `src/theme/categories.js` (runtime color values via `getColor()` in `src/theme/colors.js`).
- Sample trim is non-destructive (region → `trimStart`/`trimEnd` params, read fresh at trigger); toolbar ops (reverse/normalize/fade/crop) are destructive with in-memory undo history in the sample cache. All three sample-carrying blocks (source `sample`, `samplenv`, `vocoder`) trim the same way: the Sample block trims the *played* slice, the Sample Envelope trims the *slice the contour is extracted from* (`extractEnvelope` takes `trimStart`/`trimEnd`), the Vocoder trims the *modulator slice*.
- **The sample blocks share `useSampleLoader(block, onParam)`** (`src/components/useSampleLoader.js`): file/mic load, the destructive edit + undo helpers, and the full editor (`SampleEditorModal`) open state — all keyed by block id in the sample cache. `SampleEditor` (source) renders a WaveSurfer waveform + region; `EnvelopeSampleLoader` renders the amplitude curve with draggable in/out handles drawn on a canvas, and is **reused as-is by both `samplenv` and `vocoder`** (its visual contour falls back to `extractEnvelope` defaults when the block has no `amount`/`smoothing` params). All can open the shared modal.
- **Block reorder drag is split** (`ChainEditor.jsx`): the drag *source* is **only the ⠿ grip handle** (`dragHandleProps`), the drop *target* is the whole card (`dropProps`). This is deliberate — a `draggable` card root makes the browser's native HTML5 drag swallow mouse interaction with rich content inside it (WaveSurfer regions, the sample-editor modal, canvases), which is why dragging inside the envelope's editor used to "drag the whole window." Keep `draggable` off any card subtree that contains pointer-driven editors.

## Design constraints (deliberate, from the owner)

- Sample and mic recording are **one** block type, not two.
- Layered sources (per-lane `sources`) and a **sound-level step sequencer** are now built (formerly future). The sequencer is sound-level, not a chain-end block — see the Sequencer section above.
- The Synth block intentionally has **no** filter section — filtering is done with Filter blocks in the chain.
