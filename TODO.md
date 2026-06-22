# BLAST — TODO

Ideas and planned work, roughly prioritized. Items come from the original
design brief and from development discussions.

## v2.0 candidates

- **Melody sequencer (own window)** — a full project-level sequencer that arranges the sounds designed in the app into a composition. Multi-lane piano roll, one lane per sound. Each lane shows note events (pitch + length) placed on a timeline; playback runs all lanes simultaneously through their respective signal chains. Separate window or full-screen overlay so it doesn't compete with the chain editor UI. This is distinct from the per-sound step sequencer — that governs a single sound's trigger pattern; this governs the whole song.
- **Sequencer per lane** — breaks saved projects (explicit migration decision); anchor for the major bump.
- **Modulation LFO** — first cross-block reference in the model; architectural scope.
- **New synths/effects (Tone.js audit)** — FMSynth, AMSynth, Chorus, StereoWidener, etc.; significantly expands what BLAST is.
- **Browser project library** — moves the app from ephemeral (ZIP) to real save/load.

Everything else below is v1.0 (small fixes and polish).

## Features
- [x] **Add modulation to pulse**
- [ ] **Tutorial system (interactive, restartable, chaptered)** — guided
      do-it-yourself onboarding that explains the app. Decisions settled
      2026-06-18:
      - **Interactivity:** spotlight overlay (dim screen, cut-out highlight,
        anchored tooltip). Steps are either `do` (validated action) or `read`
        (Next to advance). `do` steps advance when the real project/model state
        reaches the goal — verified via `model.js` helpers (`allBlocks`,
        `findBlock`), NOT by trusting a click. Always offer a **Skip** escape.
      - **Off-script:** gently guide back (re-highlight target + show a `nudge`),
        never hard-lock interaction.
      - **Sandbox:** per-chapter — a chapter either loads a curated throwaway
        demo project (`sandbox: 'demo'`, built from `newProject`/`newSound`/
        `newBlock`) or annotates the live project (`sandbox: 'live'`). Demo
        chapters stash the live project, `reset()` to the demo, and restore on
        exit. (Riskiest mechanic — prototype the stash/restore first.)
      - **Authoring:** declarative content data `src/tutorial/chapters.js`
        (registry-style, like `blocks/registry.js` + `help.js`). Step shape:
        `{ id, target, text:{en,sv}, placement, action, validate(project,ui),
        nudge:{en,sv} }`. `target` is a stable `data-tut="…"` attribute added
        to existing UI (Header, AddBlockMenu, ChainEditor) — the only edits to
        existing components, no logic change. Add a dev-time console warning
        when a step's target selector finds nothing.
      - **Progress:** per-chapter AND per-step in
        `localStorage['blast_tutorial']` `{ completed:{}, current:{chapter,step} }`.
        Resumes mid-chapter. **Restartable** = clear the key. NOT project data,
        never serialized into the ZIP/autosave — same pattern as `uiPrefs`.
      - **Entry:** `?` button in Header → course screen (`TutorialMenu.jsx`)
        listing chapters with done/in-progress badges + Resume + Restart +
        per-topic shortcuts (run one topic vs the whole app). First-run offer
        reuses the `IntroModal` pattern when no `blast_tutorial` key exists.
      - **Language:** EN + SV with EN fallback (mirror `help.js`); chrome strings
        go in a new `tutorial` namespace in `src/i18n/strings.js`.
      - **New files:** `src/tutorial/{chapters,useTutorial,Spotlight,
        TutorialMenu,progress}.js(x)`. `useTutorial` is a context provider
        wrapping App content: holds chapter/step, watches `project` for
        validation auto-advance, handles sandbox swap + progress I/O. Spotlight
        uses `getBoundingClientRect` + ResizeObserver to keep the cut-out
        aligned (pattern already used for the inspector).
      - **Scope (first build):** full engine + overlay + progress + menu +
        `data-tut` anchors, plus ONE polished **Core flow** chapter
        (orient → play → add effect → tweak param → reorder → bypass/recap),
        `sandbox: 'demo'`. Other chapters stubbed as titled placeholders:
        Sources & synthesis, Effects & control blocks, Layers/sequencer/projects.
      - **Open question:** Beginner-mode tie-in (auto-offer the tour on entering
        Beginner mode). Plumbing trivial (`mode` already in `uiPrefs`); decision
        deferred, capability not blocked.
      - **Status (2026-06-18):** engine + overlay + progress + menu shipped, and
        five chapters now exist (Core flow, Sources & synthesis, Effects &
        control blocks, Layers/sequencer/projects, The Sampler). **Still only
        basic — needs more work.** Remaining:
        - Chapters are short/shallow. Deepen coverage: more effect types,
          actually programming the sequencer grid, the bus mixer (level/pan/
          delay per lane), save/load hands-on. (Sampler chapter added: load/mic,
          library, trim, crop/fade/reverse/normalize — read-tour since sample
          data lives in the cache, not the validated project; only trim gates.)
        - Layers chapter is a light tour — only "add a layer" is hands-on; the
          projects step is read-only (saving downloads a file, skipped in a
          sandbox).
        - First-run offer + Beginner-mode auto-tour (the open question) NOT built.
        - Plan said "data-tut anchors only, no logic change" — in practice a few
          small logic changes were needed: `ChainEditor` `initialSelectedKey`
          pre-selection, and z-index raises (AddBlockMenu dropdown, SequencerModal,
          Spotlight tooltip) so popups/modals sit correctly vs the overlay.
        - No automated tests — layout verified analytically only (no browser
          automation set up); consider Playwright specs for tooltip-on-screen
          regressions.
        - Tooltip placement when a step opens a modal (sequencer) is anchored to
          the now-hidden trigger; may want a fixed/corner position over modals.

- [ ] **Per-step glide in the sequencer (portamento Option C)** — add a `glide: true`
      flag per note-event in the sequencer step data `{ pitch, len, glide? }`. In the
      piano roll, clicking/right-clicking a note bar toggles the flag; a small ⤵ glyph
      on the right edge of the bar marks it. The engine checks `note.glide` in
      `triggerLane` and only applies portamento for flagged notes (global Glide time
      still comes from the Synth block param). Legato per-step is not needed — it stays
      global. Currently glide is always applied to all notes (Option A); Option C is a
      superset and doesn't require rewriting the engine path.
- [ ] **Browser project library** — save/load named projects in the browser
      (IndexedDB), alongside the existing ZIP download/upload. Each saved
      project is stored as a full `.blast.zip` blob; a modal mirrors the
      Sample Library (save current under a name, list, load, delete). Samples
      are duplicated per saved project (accepted). Reuse-heavy approach:
      extract `buildProjectZipBlob(project)` from `saveProjectZip` in
      `src/utils/projectZip.js` (`loadProjectZip` already takes a Blob, so feed
      stored blobs directly); add a `projects` object store in
      `src/utils/sampleLibrary.js` (bump `DB_VERSION` 2→3) with
      `listProjects`/`saveProjectEntry`/`removeProject`; new
      `ProjectLibraryModal.jsx` mirroring `SampleLibraryModal.jsx` (no audio
      preview); `Header.jsx` gets a "Projects" button reusing `onLoadProject` →
      `App.loadProject` → `reset()`.
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
- [ ] **Inspector layout** Check the inspector layout of the different blocks. 
      try to make things wider rather than taller so it uses less screen real-estate
- [ ] **Screenshot** in the README once the UI is settled.
- [ ] **Code-split** the bundle (Tone.js pushes the main chunk past 500 kB —
      Vite build warning).
- [ ] **Browser smoke test** (Playwright script: load, play, add blocks,
      export WAV, check console errors).

## Known limitations
- [ ] **Pitch Envelope / Pitch LFO don't modulate a Sample in granular mode.**
      Deliberate, documented at `src/audio/engine.ts` (granular branch of
      `triggerLane`). Normal mode plays through `Tone.ToneBufferSource` whose
      `playbackRate` is an automatable Param — so the pitch-env ramp and LFO
      land. Granular mode uses `Tone.GrainPlayer`, whose `detune`/`playbackRate`
      are plain number properties set once at trigger, not connectable Signals,
      so per-trigger modulation can't be applied (the static Pitch control +
      keyboard transpose still work). To fix: drive `GrainPlayer.detune` via a
      `Tone.Signal`/scheduled ramp instead of a number. `laneDuration`'s granular
      branch is consistent (ignores the pitch-env min-rate window).
