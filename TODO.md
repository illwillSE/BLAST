# BLAST — TODO

Ideas and planned work, roughly prioritized. Items come from the original
design brief and from development discussions.

## Features

- [ ] **Auto-save sample persistence** — extend auto-save to include sample
      blobs via IndexedDB so Sample/Vocoder/SampleEnv blocks survive a page
      reload without manual re-upload.
- [ ] **Review translations** — audit Swedish/English strings in help.js for accuracy and completeness.
- [ ] **Minimize inspector** — add a collapse/minimize toggle for the inspector panel.
- [ ] **Background visualization** — a subtle deterministic visual effect in the background, driven by selected nodes/lanes and their control values (envelopes, levels, etc.). Make it toggle on or off. I'm thinking a dot cloud with soft round shapes for soft sounds and more spikes for harsh sounds. when no sound is played just a faint circle rotating
- [ ] **Smooth param ramps** — use `rampTo` for parameter changes to reduce zipper noise on slider edits.
- [ ] **Tone.js feature audit** — investigate other Tone.js features not yet used that could be useful.
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

## Polish / housekeeping

- [ ] Decide the default Output display mode (currently `waveform`;
      candidates: `spectrum`, `fire`).
- [ ] Screenshot in the README once the UI is settled.
- [ ] Code-split the bundle (Tone.js pushes the main chunk past 500 kB —
      Vite build warning).
- [ ] Browser smoke test (Playwright script: load, play, add blocks,
      export WAV, check console errors).
