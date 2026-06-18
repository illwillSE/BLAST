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

## 4. Working with the owner

**The owner (Pontus) drives commits and the look; you build function.**

- **Never auto-commit.** When work is done, suggest a commit message and wait — committing is always his call. Before committing, run `git log --oneline -3` + `git status --short` and write the message to describe only what is actually staged (he sometimes commits himself between turns).
- **Visual/styling decisions are his** (layout, spacing, sizing, columns, colors, typography). Don't restyle on your own initiative — implement behavior/structure and let him drive the look. When he *points out* a visual problem, that names the problem, not authorization to pick the fix: diagnose the cause, name the lever, let him choose. **Don't screenshot to judge how the UI looks** — verify changes functionally; he does visual review himself. (Screenshots are fine when he asks you to check behavior, not aesthetics.)
- **Log deferred work to TODO.md.** Any edge case, limitation, or known-but-unfixed behavior that gets flagged but deliberately left must be written into `TODO.md`, not just mentioned in chat.

## What this is

BLAST is a browser-only sound design app (no backend): React + Vite + Tailwind v4, Tone.js for audio, WaveSurfer.js for waveforms. Each sound is a left-to-right **signal chain** of blocks: one source → effect blocks → output. **App focus: game sound design** — layering disparate elements (whoosh + impact + tail), not building one coherent musical timbre; this drives features toward per-element independence (e.g. per-lane pitch mod).

## Commands

- `npm run dev` — dev server on http://localhost:5173
- `npx vite build` (or `npm run build`) — also the compile check; no tests or linter
- `npm run preview` — serve the production build locally
- `npm run deploy` — build + publish `dist/` to GitHub Pages (`gh-pages`); the release path

## Architecture

One serializable data model drives everything. A project holds sounds; a sound is a **hybrid per-lane model**: `sources` (source *lanes* mixing at a shared bus) + a `master` chain (mix → output) + a `sequencer`. A lane is `{ ...sourceBlock, chain: [], delay, level, pan }` — a source block with its own insert chain + mix settings; a block is `{ id, type, enabled, params }`. A block lives in a lane's `chain` or in `master`; a "target" addressing a chain is a lane id or `MASTER`. Use the helpers in `src/state/model.js` (`allBlocks`, `findBlock`, `findLane`, `mapBlock`, `addBlock`, `moveBlock`, `swapSource`) — **never index `sound.blocks`** (gone). Non-serializable data (AudioBuffers, file bytes) lives in `src/audio/sampleCache.js` keyed by block id; ZIP save/load (`src/utils/projectZip.js`) reads/repopulates it. Because it's keyed by block id, *any* block can carry an embedded sample and serializes for free.

**State ownership:** the whole project lives in one history-backed reducer in `src/App.jsx` (`useUndoableProject`, `src/state/useUndoableProject.js`); all mutations go through the pure transforms in `src/state/model.js` (return new objects, never mutate). `src/state/presets.js` is the boot default; `src/state/clipboard.js` backs sound copy/paste + render-to-sample. Model constructors (`newProject`/`newSound`/`newLane`/`newBlock`/`defaultParams`) live in `model.js`.

**Undo/redo:** `useUndoableProject` keeps a `{ past, present, future }` history of immutable project references (cheap). `Cmd/Ctrl+Z` undoes, `Shift+Cmd/Ctrl+Z` (or `Ctrl+Y`) redoes; both skip text-entry fields. **Every project mutation must go through `dispatch((p) => …)`** (never a bypass) to be undoable — `updateSound` wraps `dispatch` for sound-level edits. The optional 2nd arg is a **coalesce key**: a stable string (e.g. `param:<blockId>:<key>`) collapses a *continuous* gesture (slider/any drag) into one undo step; omit it for discrete actions (add/remove/move/swap/toggle, sound add/dup/delete, paste). So a dragged control needs a coalesce key, everything else needs nothing. Read-only dispatches returning the same reference (e.g. `playSound`) aren't recorded. Sample blobs are **not** in this history — destructive sample edits keep per-block undo in `sampleCache.js`.

**Auto-save:** on every change (1 s debounce, first render skipped) the project JSON + a `{ blockId: hash }` sample manifest go to `localStorage['blast_autosave']`, and blobs go to IndexedDB via `saveAutosaveSamples` (`src/utils/sampleLibrary.js`). Blobs are **content-addressed** (SHA-256) so a file used in N blocks is stored once. On init the lazy initializer reads the JSON and runs `normalizeProject` (from `projectZip.js`) for new-param backfill; a mount effect in `App.jsx` calls `loadAutosaveSamples(manifest)` to repopulate `sampleCache`, so sample blocks survive a refresh without re-upload.

**Sample library:** `sampleLibrary.js` also backs a user-managed named-sample store (IndexedDB `library` store) surfaced by `SampleLibraryModal` (the ⊞ Library button on every sample-carrying block). Autosave blobs + library both live in the `blast` IndexedDB database.

### Block registry (`src/blocks/registry.js`)

Adding a block type = one registry entry (param defs + `create`/`apply` Tone wiring) + a help entry in `src/blocks/help.js` (**both English and Swedish**; missing Swedish falls back to English). The UI (cards, sliders, add-menu, help modal) renders entirely from these definitions. New params are backfilled into older saved projects on load (`normalizeProject` in `projectZip.js`).

Param defs are `range` or `select` by default, plus: `percent: true` (edit/display 0–100 for a 0–1 value), `scale: 'log'`, `structureParams` (on the *block* def, force a rebuild), `show: (params) => bool` (hide a param — e.g. synth pulse `width` only on a `pulse` wave), `type: 'harmonics'` (array param rendered as the draggable-bar `HarmonicsEditor`; array defaults cloned per block in `defaultParams`). A block def may declare `overrides: (params) => [sourceParamKey…]` — source controls it freezes while enabled; `disabledSourceParams(sound)` collects these and `ChainEditor` passes them to the source card, which greys + freezes them (value still shows). The synth oscillator is a Tone `OmniOscillator` driven by `applyOscillator()`: plain waves, band-limited partial counts (`sawtooth8`), a `pulse` with `width`, or a `custom` harmonic spectrum from the `harmonics` array.

Block `kind`s the engine treats differently:
- `source` — synth or sample; UI allows exactly one per sound, pinned first, type swapped in place. The engine mixes all sources into a bus (layered sources need no rewiring).
- `insert` — audio effect in the chain; bypass = excluded at build.
- `control` — pitch LFO / pitch envelope (modulate source pitch) and Sample Envelope (modulates source volume): not in the audio path, chain position irrelevant.
- `analyzer` — a tap; audio passes unchanged.

### Audio engine (`src/audio/engine.js`)

`buildChain(sound, destination)` builds the Tone graph and returns `{ trigger, apply, dispose, ... }`. **The same code path serves live playback and offline WAV export** (`Tone.Offline` in `src/audio/render.js`) — anything added must work in both (no DOM, no singletons bound to the live context).

Two update paths:
- **Param tweaks** → `apply()` updates Tone nodes in place; no rebuild.
- **Structure changes** (add/remove/reorder/bypass, or any param in a def's `structureParams`, e.g. detune `count` which changes node count) → change `structureKey(sound)` → `LiveEngine.sync` rebuilds (token-guarded against races).

Trigger-time params (synth length/pitch, pitch-env values, sample trim) are read **fresh at trigger** via `freshParams()` — never captured at build (a past bug read the build-time snapshot).

**Polyphony** (`src/audio/voicePool.js`, `VoicePool`): triggers allocate voices from a pool so overlapping notes (chords, sequencer step tails) ring out instead of stealing each other. Per-trigger source spawning goes through the pool; respect it when adding trigger-time nodes.

**Tone.js gotcha:** connecting a signal into a `Tone.Signal` **overrides** its `.value`, so pitch-env automation goes through a separate `envSignal` summed into `synth.detune` alongside LFOs. Sample pitch mod uses the per-trigger buffer source's `playbackRate` Param (native AudioParam, sums normally).

**Sample Envelope (`samplenv`)** flattens the synth ADSR: when enabled, each synth envelope is neutralized via `flattenEnv` (attack≈5ms, decay 0, sustain 1, release≈10ms) so the extracted amplitude curve — scheduled on the source's `envGain` in `scheduleAmpEnv` — owns the volume shape. `apply()` re-flattens after `def.apply` rewrites the ADSR. Presence is part of `structureKey`, so enabling/bypassing rebuilds and restores normal ADSR (sliders still show their values, just overridden). Its `overrides` flatten the ADSR and, in `natural` mode, replace Length.

**Per-trigger inserts** (`onTrigger` hook): an insert's `create()` may return an `onTrigger(when, { params, sample, nodes })` alongside `{ nodes, input, output }`; the engine collects these into `triggerHooks` and calls them every trigger with **fresh** params + cached sample, after sources fire. The hook spawns short-lived nodes (e.g. `ToneBufferSource`), registers them in the passed `nodes` set for `dispose()` cleanup, and stops its own previous spawn on re-trigger. The **Vocoder** (`vocoder`, insert) uses this: the chain signal is the carrier, an embedded speech sample is the modulator started fresh each Play. Guts: N band-pass pairs (carrier + modulator) with a `Tone.Follower` per band gating the matching carrier band, plus a high-pass sibilance passthrough; `bands` is a `structureParam`. It declares `overrides: () => ['duration']` and **holds the synth carrier** for the modulator's trimmed length — `vocoderHold()` in `trigger()` governs `noteDur` (replacing greyed-out Length), `estimateDuration()` grows the render window (like Sample Envelope natural mode; only synth carriers extend, a sample carrier is a one-shot).

### Sequencer (`src/audio/sequencer.js`)

`sound.sequencer` is disabled by default; when on it drives trigger timing (steps ring out via the voice pool). It is **sound-level, not** a chain-end audio block — it governs the trigger, not the audio path. Edited via `SequencerModal`/`SequencerEditor`.

### UI conventions

- Sliders: double-click track = reset; double-click value = exact-entry popup (percent params edit as whole 0–100 via `percent: true`); arrow keys = one step, shift = ×10.
- Space is global transport (plays selected sound) except in text-entry fields.
- Tailwind v4: dynamic class names don't compile — category colors use the explicit class-string map `CAT_STYLES` in `src/theme/categories.js` (runtime values via `getColor()` in `src/theme/colors.js`).
- Sample trim is non-destructive (region → `trimStart`/`trimEnd`, read fresh at trigger); toolbar ops (reverse/normalize/fade/crop) are destructive with in-memory undo in the sample cache. All three sample blocks (`sample`, `samplenv`, `vocoder`) trim the same way: Sample trims the *played* slice, Sample Envelope the *slice the contour is extracted from* (`extractEnvelope` takes `trimStart`/`trimEnd`), Vocoder the *modulator slice*.
- The sample blocks share `useSampleLoader(block, onParam)` (`src/components/useSampleLoader.js`): file/mic load, destructive edit + undo helpers, and `SampleEditorModal` open state — all keyed by block id. `SampleEditor` (source) renders a WaveSurfer waveform + region; `EnvelopeSampleLoader` renders the amplitude curve with draggable in/out canvas handles and is **reused as-is by `samplenv` and `vocoder`** (contour falls back to `extractEnvelope` defaults when the block has no `amount`/`smoothing`). All open the shared modal.
- **Block reorder drag is split** (`ChainEditor.jsx`): drag *source* = **only the ⠿ grip handle** (`dragHandleProps`), drop *target* = the whole card (`dropProps`). Deliberate — a `draggable` card root makes native HTML5 drag swallow mouse interaction with rich content (WaveSurfer regions, sample-editor modal, canvases), which made dragging inside the envelope editor "drag the whole window." Keep `draggable` off any card subtree containing pointer-driven editors.

## Design constraints (deliberate, from the owner)

- Sample and mic recording are **one** block type, not two.
- Layered sources (per-lane `sources`) and a **sound-level step sequencer** are built (see Sequencer above; sound-level, not a chain-end block).
- The Synth block intentionally has **no** filter section — filtering is done with Filter blocks in the chain.
- **Swedish translations keep audio/synth terms in English** (Attack, Release, Sustain, Filter, LFO, Envelope, Reverb, Detune, Oscillator, Vocoder, etc.) — Swedish musicians know them in English. Append `(svensk term)` only when a term is obscure. Applies to help.js strings and any user-facing control label.
- The simplified experience is **"Beginner mode"** (with an Advanced counterpart) — never "kids mode," even though target users are kids ~10–13. Keep it a credible tool, not a toy: hide complexity via a curated set of blocks/controls, not by dumbing down.
- **Inspector panels lay controls out horizontally** (side by side), not stacked — default to a flex row beside existing controls.
