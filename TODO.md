# BLAST — TODO

Ideas and planned work, roughly prioritized. Items come from the original
design brief and from development discussions.

## Features

- [x] **New / empty project** — "New project" action in the Settings modal
      (General tab) with a confirm warning; resets to a fresh single-sound
      project and clears undo history.
- [ ] **Browser project library** — save/load named projects in the
      browser (IndexedDB), alongside the existing ZIP download/upload.
      Each saved project is stored as a full `.blast.zip` blob; a modal
      mirrors the Sample Library (save current under a name, list, load,
      delete). Plan: ~/.claude/plans/make-it-possible-to-lazy-owl.md
- [ ] **Review translations** — audit Swedish/English strings in help.js for accuracy and completeness.
- [ ] **Minimize inspector** — add a collapse/minimize toggle for the inspector panel.
- [ ] **Background visualization** — a subtle deterministic visual effect in the background, driven by selected nodes/lanes and their control values (envelopes, levels, etc.). Make it toggle on or off. I'm thinking a dot cloud with soft round shapes for soft sounds and more spikes for harsh sounds. when no sound is played just a faint circle rotating
- [ ] **Smooth param ramps** — use `rampTo` for parameter changes to reduce zipper noise on slider edits.
- [ ] **Tone.js feature audit** — Tone.js classes not yet used that could be
      useful, roughly by payoff. Each is one registry entry (`create`/`apply` +
      param defs) + a help entry; all are pure Tone nodes so they work in both
      live playback and `Tone.Offline` export.
      - **New sources/synths (biggest sound expansion):** `FMSynth` / `AMSynth`
        (modulator-carrier — metallic/bell/growl/bass beyond subtractive),
        `DuoSynth` (two detuned voices + vibrato → instantly fat leads/bass),
        `MembraneSynth` (pitch-swept body — kicks/toms/booms), `PluckSynth`
        (Karplus-Strong string), `Sampler` (multisampled pitched instrument vs.
        today's single-buffer one-shot).
      - **New effects (width/movement/character):** `Chorus` + `StereoWidener`
        (cheapest "make it big/wide" wins), `Chebyshev` (waveshaper saturation,
        distinct from Distortion/BitCrusher), `Phaser`, `FrequencyShifter`
        (non-harmonic shift → metallic/alien/ring-mod), `Tremolo` / `Vibrato` /
        `AutoPanner` (stereo amp/pitch/pan mod as insert blocks), `AutoFilter` /
        `AutoWah` (self-contained filter sweeps), `Freeverb` / `JCReverb`
        (cheap zero-latency algorithmic reverbs — different color from the
        convolution Reverb).
      - **Modulation primitives:** `Add`/`Multiply`/`Scale`/standalone
        `Envelope`/`FrequencyEnvelope` — back a generalized mod-matrix; overlaps
        with the Modulation LFO item below.
      - Suggested first cut: FMSynth + AMSynth, then Chorus + StereoWidener,
        then Chebyshev, then MembraneSynth.
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

## Bugs
- [ ] Sample envelope no edit
- [ ] No visualization on metal synth

## Polish / housekeeping

- [ ] Decide the default Output display mode (currently `waveform`;
      candidates: `spectrum`, `fire`).
- [ ] Screenshot in the README once the UI is settled.
- [ ] Code-split the bundle (Tone.js pushes the main chunk past 500 kB —
      Vite build warning).
- [ ] Browser smoke test (Playwright script: load, play, add blocks,
      export WAV, check console errors).
