# BLAST — TODO

Ideas and planned work, roughly prioritized. Items come from the original
design brief and from development discussions.

## Features

sample editor help window

- [ ] **Copy/paste samples** — reuse the same sample across multiple blocks (Sample, Sample Envelope, Vocoder).
- [x] **Reverb presets** — one-click presets that set Reverb sliders to common room sizes (small room, big room, concert hall).
- [x] **Ping-pong delay** — add a ping-pong (alternating L/R) mode to the Delay block.
- [x] **Output block enhancements** — always show waveform; expose basic output controls inline; reserve advanced options for a panel.
- [x] **Persistent lane pills** — keep source-lane pills visible when switching between lanes.
- [ ] **Review translations** — audit Swedish/English strings in help.js for accuracy and completeness.
- [x] **Inspector layout** — fit mix-inspector controls on one row (they clearly fit); Vocoder controls should sit to the right of the sample preview.
- [x] **Default detune** — set the Detune block's default to a classic supersaw/superwave configuration.
- [ ] **Minimize inspector** — add a collapse/minimize toggle for the inspector panel.
- [x] **Contrast improvements** — improve low-contrast areas throughout the UI.
- [ ] **Pitch LFO reset** — reset the Pitch LFO phase on each Play trigger; currently appears to share global LFO state.
- [ ] **Background visualization** — a subtle deterministic visual effect in the background, driven by selected nodes/lanes and their control values (envelopes, levels, etc.).
- [x] **Grain player** — granular playback mode on the Sample source (`Tone.GrainPlayer`): decoupled pitch/speed, grain size + overlap, loop drone. Unlocks textural and glitchy sounds.
- [x] **Metal synth** — percussive metallic source block (`Tone.MetalSynth`). Unlocks cymbals, bells, and metallic hits.
- [ ] **Smooth param ramps** — use `rampTo` for parameter changes to reduce zipper noise on slider edits.
- [ ] **Tone.js feature audit** — investigate other Tone.js features not yet used that could be useful.

- [ ] **Sample export options** — more control over exported audio
      (format, sample rate, mono/stereo?).
- [ ] **Sound rename** — renaming beyond the double-click in the sound
      list (e.g. from the chain header).
- [ ] **Export sample from sample source** — download the (edited) sample
      straight from the Sample block, for ease of use.
- [x] **Sample as envelope for the synth** — use a sample's amplitude
      contour to shape the synth's volume over time (record "pew-pew" or
      beatboxing, the synth follows your timing and dynamics).
      Design sketch:
      - A **"Sample Envelope" control block** (same category as Pitch
        LFO/Envelope) with its own embedded sample loader — drop/record
        a file into the block; it's modulation data, not a chain source,
        so the one-source-per-sound model is untouched.
      - **Offline extraction**: RMS in ~10ms windows → normalized curve,
        scheduled per trigger via `setValueCurveAtTime` — identical in
        live playback and WAV export.
      - Params: Smoothing, Amount, stretch-to-note-length vs natural
        length toggle. Start with envelope *replacing* the synth ADSR.
      - Gotchas: auto-gain quiet recordings, noise floor so room hiss
        doesn't drone.
      - Save/load already works: sample cache + ZIP key samples by block
        id, so an envelope sample serializes today.
      - Future door: the extracted curve as a generic modulation source
        (cutoff = auto-wah, pitch, …).
- [ ] **Modulation LFO** — a control block that wobbles *another block's*
      parameter (auto-wah on a Filter, tremolo on a Gain, etc.), generalizing
      today's hardcoded Pitch LFO. **Scope A — Signal targets only** (the
      Tone-native, audio-rate path; skip control-rate modulation of plain
      non-signal params like wave type/oversample). Design sketch:
      - **Targets:** params backed by a Tone `Signal`/AudioParam — filter
        cutoff, gain/volume, pan, delay time, wet. Mark these `modulatable:
        true` in the registry and expose the underlying node by a known key.
      - **Wiring:** the LFO stores `{ targetBlockId, targetParam }`; the
        engine looks up the node's Signal and connects the LFO **additively**.
        Reuse the pitch-detune trick — a sum/`Add` node per target so the
        base value from `apply()` and the modulation coexist instead of the
        signal-connect *overriding* `.value` (the documented Tone gotcha).
      - **Refactor cost:** each modulatable effect routes its param through a
        summable node instead of a bare `node.x.value =`.
      - **Cross-block reference (new):** first inter-block link in the model.
        `normalizeProject` must handle dangling targets (target deleted/
        bypassed/reordered) on ZIP load.
      - **UI:** a new "target picker" param control — dropdown of modulatable
        params across the chain. Auto-generated cards have no such control yet.
      - **Stacking:** two LFOs on one target sum for free via the additive
        nodes. Stays `kind: 'control'`, chain position irrelevant.
      - Works offline (pure audio-graph connection, like the Pitch LFO).
        This is the generic version of the Sample Envelope's "future door."
- [x] **Vocoder block** — insert effect: the chain signal is the carrier,
      a speech sample embedded in the block (drop/record, like Sample
      Envelope) is the modulator. Design sketch:
      - Guts: N band-pass pairs (carrier + modulator) with a
        `Tone.Follower` per band gating that carrier band. 8 bands to
        start; intelligibility rises fast between 8 and 16.
      - Params: Bands (8/16/32), Attack/Release tracking, Mix, optional
        sibilance high-pass passthrough for crisp S/T sounds.
      - Engine change: blocks need an optional `onTrigger` hook so the
        modulator sample starts on every Play (today only sources are
        triggered). Sample Envelope wants the same hook — build it first.
      - Works offline for WAV export (pure audio graph). Best carrier:
        sawtooth or noise; pure sine vocodes poorly.
- [x] **Richer synth oscillator** — Tone.js OmniOscillator extras:
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

- [x] **Centralized palette** — all colors live in `src/theme.css` as
      Tailwind v4 `@theme` semantic tokens; components use the generated
      utilities and canvas/SVG read the same vars via `theme/colors.js`.
      Change a token to re-theme the whole app.
- [ ] Decide the default Output display mode (currently `waveform`;
      candidates: `spectrum`, `fire`).
- [ ] Screenshot in the README once the UI is settled.
- [ ] Code-split the bundle (Tone.js pushes the main chunk past 500 kB —
      Vite build warning).
- [ ] Browser smoke test (Playwright script: load, play, add blocks,
      export WAV, check console errors).
