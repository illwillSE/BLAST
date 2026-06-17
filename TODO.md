# BLAST — TODO

Ideas and planned work, roughly prioritized. Items come from the original
design brief and from development discussions.

## Features

- [ ] **Browser project library** — save/load named projects in the browser
      (IndexedDB), alongside the existing ZIP download/upload. Each saved
      project is stored as a full `.blast.zip` blob; a modal mirrors the
      Sample Library (save current under a name, list, load, delete). Plan:
      ~/.claude/plans/make-it-possible-to-lazy-owl.md
- [ ] **Review translations** — audit Swedish/English strings in help.js for
      accuracy and completeness.
- [ ] **Smooth param ramps** — use `rampTo` for parameter changes to reduce
      zipper noise on slider edits.
- [ ] **Tone.js feature audit** — Tone.js classes not yet used that could be
      useful, roughly by payoff. Each is one registry entry (`create`/`apply`
      + param defs) + a help entry; all are pure Tone nodes so they work in
      both live playback and `Tone.Offline` export.
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
      - Works offline (pure audio-graph connection, like the Pitch LFO). This
        is the generic version of the Sample Envelope's "future door."
- [ ] **Live recording waveform** — show a scrolling waveform *while*
      recording (WaveSurfer Record plugin). Today the waveform only appears
      after pressing Stop.
- [ ] **Region looping** — loop the trimmed sample region for sustained
      sounds (engines, wind); regions plugin emits the needed events. Adhere to
      either # of cycles or total length.
- [ ] **Sample editor polish** — arrow-key nudging of in/out points, optional
      snap-to-zero-crossing.
- [ ] **Sequencer per lane (placeable note sequencer)** — turn the single
      sound-level `sound.sequencer` into a note/pitch sequencer *block* that
      can be placed in a lane's chain (max one per lane) and maybe in master
      (max one). Design discussion 2026-06-16; decisions settled:
      - **Kind:** note/pitch sequencer (trigger-domain, like today) — drives
        WHEN + WHAT PITCH a source fires. NOT an audio gate, so chain position
        is audibly irrelevant (behaves like the pitch-LFO/env `control` blocks).
      - **Per-lane semantics:** each lane's sequencer expands (via
        `sequenceToNotes`) into note-events for THAT lane only. Today `trigger()`
        applies one shared pattern to every lane (loop: per note-event → per
        lane → `triggerLane`, engine.js:402-413); the change is to let each lane
        consume its own sequence instead.
      - **Clock:** per-sequencer BPM — each sequencer free-runs its own tempo
        (polyrhythm/polytempo allowed). NOT a shared sound-level clock.
      - **Migration:** none. Don't preserve old projects — if a saved project
        can't load under the new model, fail with a clear error message.
      - **Master × lane (DECIDED): master = fallback conductor.** A master-placed
        sequencer drives only lanes that lack their own sequencer; a lane with
        its own ignores master. One trigger source per lane, no overlap (closest
        to "no different from today" for un-sequenced lanes). Example — Lead lane
        has its own arp, Bass lane has none, Master has a slow 2-note pattern:
          Lead:  do-mi-so-do  do-mi-so-do ...  (its own arp, on its own)
          Bass:  C ........... G ...........    (follows the master pattern)
        Each lane has exactly one boss.
      - **Key code:** `src/audio/sequencer.js` (model + `sequenceToNotes` /
        `sequenceSpan`); engine fan-out `trigger()`/`triggerLane`
        (engine.js:402, :262); render window `estimateDuration` (:587, uses
        `sequenceSpan(sound.sequencer)`); UI `SequencerModal`/`SequencerEditor`.
        Becomes a registry block (`kind: 'control'`). Related: "Optional
        sequencer" item above.

## Polish / housekeeping
- [ ] **Screenshot** in the README once the UI is settled.
- [ ] **Code-split** the bundle (Tone.js pushes the main chunk past 500 kB —
      Vite build warning).
- [ ] **Browser smoke test** (Playwright script: load, play, add blocks,
      export WAV, check console errors).
- [ ] **Visualizer paste guard** — the visualizer is lane-only via the
      master add-menu, but Cmd/Ctrl+V (`handlePaste(MASTER)`) bypasses that
      and can still drop a copied visualizer onto master. Add a model- or
      paste-level guard if it matters.
