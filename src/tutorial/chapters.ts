// Declarative tutorial content — registry-style, like blocks/registry.js +
// help.js. A chapter is either playable (`sandbox` + `steps`) or a titled
// placeholder reserved for a future build (`stub: true`).
//
// Step shape:
//   { id, kind: 'do' | 'read', target, placement, text:{en,sv}, nudge:{en,sv},
//     validate(project, stepStartProject, ctx) }
// `target` is a `data-tut="…"` selector string, or null for a centered card
// (orientation / recap). `validate` advances a `do` step when the real model
// reaches the goal — verified via model helpers, never by trusting a click.
import { newProject, newSound, newBlock, newLane, findLane } from '../state/model'
import { setSample, removeSample, decodeBlob } from '../audio/sampleCache'
import { bufferToWavBlob } from '../audio/bufferOps'
import type { Block, Lane, Project, SampleTrim } from '../types'
import type { TutorialChapter, TutorialCtx } from './types'

// The lane this chapter operates on, resolved fresh from a given project.
function lane(project: Project, ctx: TutorialCtx): Lane | null {
  const sound = project.sounds.find((s) => s.id === ctx.soundId)
  if (!sound) return null
  return findLane(sound, ctx.laneId ?? '') ?? sound.sources.find((s) => s.id === ctx.laneId) ?? null
}

function chainIds(project: Project, ctx: TutorialCtx): string[] {
  return lane(project, ctx)?.chain.map((b) => b.id) ?? []
}

// The seeded Pitch LFO control block in the Effects chapter's lane.
function pitchLfo(project: Project, ctx: TutorialCtx): Block | null {
  return lane(project, ctx)?.chain.find((b) => b.type === 'pitchlfo') ?? null
}

// Curated throwaway demo for the Core flow chapter: one synth lane seeded with
// a Filter block, so a "reorder" step has two blocks to work with once the
// learner adds a second one.
function buildCoreFlowDemo(): Project {
  const project = newProject()
  const sound = newSound('Tutorial Sound')
  sound.sources[0]!.chain = [newBlock('filter')]
  project.sounds = [sound]
  return project
}

// Sources chapter demo: a bare synth source, no effects — the focus is the raw
// tone, so nothing downstream colours it. The source lane is pre-selected by
// ChainEditor on load, so its controls are already open.
function buildSourcesDemo(): Project {
  const project = newProject()
  const sound = newSound('Tutorial Source')
  project.sounds = [sound]
  return project
}

// Effects chapter demo: one insert effect (Reverb) and one control block (Pitch
// LFO) seeded in the chain, so the chapter can contrast the two families
// hands-on. The control block is seeded rather than added because it is an
// advanced block, hidden from the add-menu in Beginner mode — its controls
// still render in either mode once it exists.
function buildEffectsDemo(): Project {
  const project = newProject()
  const sound = newSound('Tutorial Effects')
  sound.sources[0]!.chain = [newBlock('reverb'), newBlock('pitchlfo')]
  project.sounds = [sound]
  return project
}

// Layers chapter demo: one synth lane to start — the learner adds the second
// layer themselves. A guided tour of the three sound-level features (layers,
// sequencer, projects); only the "add a layer" step is hands-on, the rest point
// at controls and explain (the sequencer lives behind a modal and saving a
// project downloads a file — neither belongs in a throwaway sandbox).
function buildLayersDemo(): Project {
  const project = newProject()
  const sound = newSound('Tutorial Layers')
  project.sounds = [sound]
  return project
}

// Sampler chapter demo: a single Sample source. The buffer is loaded into the
// sample cache by the chapter's onEnter hook (samples live in the cache, not the
// serializable project), so the editor and tools have audio to work on.
function buildSamplerDemo(): Project {
  const project = newProject()
  const sound = newSound('Tutorial Sampler')
  sound.sources = [newLane('sample')]
  project.sounds = [sound]
  return project
}

// Synthesize a short demo clip (a decaying tone + a noisy transient) and load it
// into the sample cache for `blockId`, via the same decode path a real file uses
// — so the waveform, trim, and destructive tools all behave normally.
async function loadDemoSample(blockId: string): Promise<void> {
  const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!
  const ctx = new Ctx()
  const sr = ctx.sampleRate
  const n = Math.floor(sr * 1.6)
  const buf = ctx.createBuffer(1, n, sr)
  const data = buf.getChannelData(0)
  for (let i = 0; i < n; i++) {
    const t = i / sr
    const env = Math.exp(-3 * t)
    const tone = Math.sin(2 * Math.PI * 220 * t) * 0.6 + Math.sin(2 * Math.PI * 440 * t) * 0.25
    const transient = (Math.random() * 2 - 1) * 0.5 * Math.exp(-25 * t)
    data[i] = (tone * env + transient) * 0.85
  }
  const blob = bufferToWavBlob(buf)
  ctx.close?.()
  try {
    const audioBuffer = await decodeBlob(blob)
    setSample(blockId, { blob, fileName: 'demo-hit.wav', audioBuffer })
  } catch { /* if decode fails the chapter still runs, just without a waveform */ }
}

export const CHAPTERS: TutorialChapter[] = [
  {
    id: 'core-flow',
    title: { en: 'Core flow', sv: 'Grundflödet' },
    description: {
      en: 'Orient, play, add an effect, tweak it, reorder, bypass.',
      sv: 'Orientera, spela, lägg till en effekt, justera, ordna om, koppla förbi.',
    },
    sandbox: 'demo',
    buildDemo: buildCoreFlowDemo,
    makeCtx: (demo) => ({ soundId: demo.sounds[0]!.id, laneId: demo.sounds[0]!.sources[0]!.id }),
    steps: [
      {
        id: 'orient',
        kind: 'read',
        target: null,
        text: {
          en: 'A sound is a signal chain: a source on the left feeds a row of effects, every lane mixes into a bus, then a master chain runs to the output. We loaded a little demo to play with — your own project is safe and comes back when you finish.',
          sv: 'Ett ljud är en signalkedja: en källa till vänster matar en rad effekter, varje spår mixas i en buss, sedan körs en masterkedja till utgången. Vi laddade ett litet demo att leka med — ditt eget projekt är säkert och kommer tillbaka när du är klar.',
        },
      },
      {
        id: 'play',
        kind: 'read',
        target: '[data-tut="play-button"]',
        placement: 'bottom',
        text: {
          en: 'Press Play (or hit Space) to hear the sound. The Q–U keys play it at different pitches. Try it, then click Next.',
          sv: 'Tryck på Play (eller mellanslag) för att höra ljudet. Tangenterna Q–U spelar det i olika tonhöjder. Testa, klicka sedan på Nästa.',
        },
      },
      {
        id: 'add-effect',
        kind: 'do',
        target: '[data-tut="add-effect"]',
        placement: 'right',
        text: {
          en: 'Now add another effect to the chain. Click the + at the end of the lane and pick one — Delay is a fun choice.',
          sv: 'Lägg nu till en effekt i kedjan. Klicka på + i slutet av spåret och välj en — Delay är ett kul val.',
        },
        nudge: {
          en: 'Click the + button at the end of the lane to open the add menu.',
          sv: 'Klicka på +-knappen i slutet av spåret för att öppna lägg-till-menyn.',
        },
        validate: (project, start, ctx) => chainIds(project, ctx).length > chainIds(start, ctx).length,
      },
      {
        id: 'tweak-param',
        kind: 'read',
        requireValidate: true,
        target: '[data-tut="block-controls"]',
        placement: 'top',
        text: {
          en: 'The new block is selected and its controls are open below. Drag any slider to change a parameter, then press Play to hear it. Try a few values, and click Next when you are ready.',
          sv: 'Det nya blocket är markerat och dess kontroller är öppna nedanför. Dra i valfritt reglage för att ändra en parameter, tryck sedan på Play för att höra den. Testa några olika värden och klicka på Nästa när du är redo.',
        },
        nudge: {
          en: 'Move any slider to unlock Next — then play with the values as long as you like.',
          sv: 'Flytta valfritt reglage för att låsa upp Nästa — lek sedan med värdena så länge du vill.',
        },
        validate: (project, start, ctx) => {
          const cur = lane(project, ctx)
          const was = lane(start, ctx)
          if (!cur || !was) return false
          return cur.chain.some((b) => {
            const prev = was.chain.find((p) => p.id === b.id)
            return prev && JSON.stringify(prev.params) !== JSON.stringify(b.params)
          })
        },
      },
      {
        id: 'reorder',
        kind: 'do',
        target: '[data-tut="lane-chain"]',
        placement: 'bottom',
        text: {
          en: 'Order matters — an effect hears everything before it. Grab a block by its ⠿ handle and drag it past the other one to reorder the chain.',
          sv: 'Ordningen spelar roll — en effekt hör allt före sig. Ta tag i ett block i dess ⠿-handtag och dra det förbi det andra för att ordna om kedjan.',
        },
        nudge: {
          en: 'Drag one effect chip left or right past the other so they swap places.',
          sv: 'Dra en effektchip åt vänster eller höger förbi den andra så att de byter plats.',
        },
        validate: (project, start, ctx) => {
          const cur = chainIds(project, ctx)
          const was = chainIds(start, ctx)
          return cur.length >= 2 && cur.length === was.length && cur.join() !== was.join()
        },
      },
      {
        id: 'bypass',
        kind: 'do',
        target: '[data-tut="block-bypass"]',
        placement: 'top',
        text: {
          en: 'To compare with and without an effect, bypass it. Select a block and click its power button to toggle it off, then on again.',
          sv: 'För att jämföra med och utan en effekt, koppla förbi den. Markera ett block och klicka på dess strömknapp för att stänga av det, och på igen.',
        },
        nudge: {
          en: 'Select an effect block, then click the power (⏻) button in its panel.',
          sv: 'Markera ett effektblock och klicka sedan på strömknappen (⏻) i panelen.',
        },
        validate: (project, start, ctx) => {
          const cur = lane(project, ctx)
          const was = lane(start, ctx)
          if (!cur || !was) return false
          return cur.chain.some((b) => {
            const prev = was.chain.find((p) => p.id === b.id)
            return prev && prev.enabled !== b.enabled
          })
        },
      },
      {
        id: 'recap',
        kind: 'read',
        target: null,
        text: {
          en: "That's the core loop: add, tweak, reorder, bypass. Everything else in BLAST builds on it. Click Finish to return to your own project.",
          sv: 'Det är grundloopen: lägg till, justera, ordna om, koppla förbi. Allt annat i BLAST bygger på det. Klicka på Klart för att återgå till ditt eget projekt.',
        },
      },
    ],
  },
  {
    id: 'sources',
    title: { en: 'Sources & synthesis', sv: 'Källor & syntes' },
    description: {
      en: 'Shape the raw tone: oscillator wave, envelope, and source types.',
      sv: 'Forma grundtonen: oscillatorvåg, envelope och källtyper.',
    },
    sandbox: 'demo',
    buildDemo: buildSourcesDemo,
    makeCtx: (demo) => ({ soundId: demo.sounds[0]!.id, laneId: demo.sounds[0]!.sources[0]!.id }),
    steps: [
      {
        id: 'orient',
        kind: 'read',
        target: null,
        text: {
          en: 'Every sound starts at a source — the raw tone that effects later shape. This demo has a single Synth source, already selected, with its controls open below. Press Play (or Space) any time to hear your changes.',
          sv: 'Varje ljud börjar i en källa — grundtonen som effekter sedan formar. Det här demot har en enda Synth-källa, redan markerad, med sina kontroller öppna nedanför. Tryck på Play (eller mellanslag) när som helst för att höra dina ändringar.',
        },
      },
      {
        id: 'wave',
        kind: 'read',
        requireValidate: true,
        target: '[data-tut="source-osc"]',
        placement: 'top',
        text: {
          en: 'The Oscillator makes the raw tone. The Wave sets its character — sine is pure and soft, square and sawtooth are buzzy and bright. Pick a different Wave and press Play to compare.',
          sv: 'Oscillatorn skapar grundtonen. Wave bestämmer dess karaktär — sine är ren och mjuk, square och sawtooth är surriga och ljusa. Välj en annan Wave och tryck på Play för att jämföra.',
        },
        nudge: {
          en: 'Open the Wave menu in the Oscillator panel and choose a new shape to unlock Next.',
          sv: 'Öppna Wave-menyn i Oscillator-panelen och välj en ny form för att låsa upp Nästa.',
        },
        validate: (project, start, ctx) => {
          const cur = lane(project, ctx)
          const was = lane(start, ctx)
          return !!cur && !!was && (cur.params as Record<string, unknown>).wave !== (was.params as Record<string, unknown>).wave
        },
      },
      {
        id: 'envelope',
        kind: 'read',
        requireValidate: true,
        target: '[data-tut="source-env"]',
        placement: 'top',
        text: {
          en: 'The Envelope shapes how the tone rises and fades over time: Attack is the fade-in, Release the fade-out, Sustain the held level. Drag Attack up for a slow swell or Release for a long tail, then play it.',
          sv: 'Envelope formar hur tonen tonar in och ut över tid: Attack är intoningen, Release uttoningen, Sustain den hållna nivån. Dra upp Attack för en långsam svällning eller Release för en lång svans, och spela sedan upp den.',
        },
        nudge: {
          en: 'Drag any envelope slider (Attack, Decay, Sustain, Release) to unlock Next.',
          sv: 'Dra i valfritt envelope-reglage (Attack, Decay, Sustain, Release) för att låsa upp Nästa.',
        },
        validate: (project, start, ctx) => {
          const cur = lane(project, ctx)
          const was = lane(start, ctx)
          if (!cur || !was) return false
          const cp = cur.params as Record<string, unknown>
          const wp = was.params as Record<string, unknown>
          return ['attack', 'decay', 'sustain', 'release', 'duration'].some((k) => cp[k] !== wp[k])
        },
      },
      {
        id: 'source-type',
        kind: 'read',
        target: '[data-tut="source-swap"]',
        placement: 'bottom',
        text: {
          en: 'A source need not be a synth. The type switch at the top of the panel swaps it in place — for a Sample you record or load, or other sources. The lane keeps its effects when you switch. Explore these on your own later.',
          sv: 'En källa måste inte vara en synth. Typväljaren högst upp i panelen byter den på plats — mot ett Sample du spelar in eller laddar, eller andra källor. Spåret behåller sina effekter när du byter. Utforska dem på egen hand senare.',
        },
      },
      {
        id: 'recap',
        kind: 'read',
        target: null,
        text: {
          en: 'You shaped a source from the inside: Wave for tone, Envelope for how it moves, and the type switch to change what the source is. Next, effects and control blocks reshape this raw sound. Click Finish to return to your project.',
          sv: 'Du formade en källa inifrån: Wave för ton, Envelope för hur den rör sig, och typväljaren för att byta vad källan är. Härnäst formar effekter och kontrollblock om detta grundljud. Klicka på Klart för att återgå till ditt projekt.',
        },
      },
    ],
  },
  {
    id: 'effects',
    title: { en: 'Effects & control blocks', sv: 'Effekter & kontrollblock' },
    description: {
      en: 'Two kinds of blocks: effects in the path, control blocks that modulate.',
      sv: 'Två sorters block: effekter i kedjan, kontrollblock som modulerar.',
    },
    sandbox: 'demo',
    buildDemo: buildEffectsDemo,
    // Pre-select the Pitch LFO so its controls open in the inspector on load —
    // the learner tweaks it without first hunting for a chip in the dimmed lane.
    makeCtx: (demo) => {
      const lane = demo.sounds[0]!.sources[0]!
      return { soundId: demo.sounds[0]!.id, laneId: lane.id, selectId: lane.chain.find((b) => b.type === 'pitchlfo')?.id }
    },
    steps: [
      {
        id: 'orient',
        kind: 'read',
        target: null,
        text: {
          en: 'The add menu offers two kinds of blocks. Insert effects sit in the signal path and reshape the sound as it passes — like the Reverb in this lane. Control blocks carry no audio; they modulate the source itself, such as the Pitch LFO that wobbles its pitch. This demo has one of each.',
          sv: 'Lägg-till-menyn erbjuder två sorters block. Insert-effekter sitter i signalkedjan och formar om ljudet när det passerar — som Reverb i det här spåret. Kontrollblock bär inget ljud; de modulerar själva källan, som Pitch LFO som vibrerar dess tonhöjd. Det här demot har ett av varje.',
        },
      },
      {
        id: 'control-tweak',
        kind: 'read',
        requireValidate: true,
        target: '[data-tut="block-controls"]',
        placement: 'top',
        text: {
          en: 'The Pitch LFO is selected and its controls are open below. Raise Depth and press Play. Rate sets how fast the pitch wobbles, Depth how far — a little is vibrato, a lot is a siren.',
          sv: 'Pitch LFO är markerad och dess kontroller är öppna nedanför. Dra upp Depth och tryck på Play. Rate bestämmer hur snabbt tonhöjden vibrerar, Depth hur långt — lite är vibrato, mycket är en siren.',
        },
        nudge: {
          en: 'Drag the Depth or Rate slider in the Pitch LFO panel to unlock Next.',
          sv: 'Dra i Depth- eller Rate-reglaget i Pitch LFO-panelen för att låsa upp Nästa.',
        },
        validate: (project, start, ctx) => {
          const cur = pitchLfo(project, ctx)
          const was = pitchLfo(start, ctx)
          return !!cur && !!was && JSON.stringify(cur.params) !== JSON.stringify(was.params)
        },
      },
      {
        id: 'control-bypass',
        kind: 'read',
        requireValidate: true,
        target: '[data-tut="block-bypass"]',
        placement: 'top',
        text: {
          en: 'With the Pitch LFO still selected, click its power button to bypass it and play again — the wobble disappears, the source plays flat. Toggle it back on when you have heard the difference.',
          sv: 'Med Pitch LFO fortfarande markerad, klicka på dess strömknapp för att koppla förbi den och spela igen — vibratot försvinner, källan spelar plant. Slå på den igen när du hört skillnaden.',
        },
        nudge: {
          en: 'Click the power (⏻) button in the Pitch LFO panel to toggle it.',
          sv: 'Klicka på strömknappen (⏻) i Pitch LFO-panelen för att slå av/på den.',
        },
        validate: (project, start, ctx) => {
          const cur = pitchLfo(project, ctx)
          const was = pitchLfo(start, ctx)
          return !!cur && !!was && cur.enabled !== was.enabled
        },
      },
      {
        id: 'position',
        kind: 'read',
        target: '[data-tut="lane-chain"]',
        placement: 'bottom',
        text: {
          en: 'One key difference: insert effects are heard in order, so moving the Reverb changes the result. A control block modulates the source no matter where it sits in the row — its position in the chain does not matter.',
          sv: 'En viktig skillnad: insert-effekter hörs i ordning, så att flytta Reverb ändrar resultatet. Ett kontrollblock modulerar källan oavsett var det sitter i raden — dess position i kedjan spelar ingen roll.',
        },
      },
      {
        id: 'recap',
        kind: 'read',
        target: null,
        text: {
          en: 'Now you know the two families: insert effects that shape the signal in order, and control blocks that modulate the source from outside the path. Pitch Envelope and Sample Envelope are control blocks too. Click Finish to return to your project.',
          sv: 'Nu känner du de två familjerna: insert-effekter som formar signalen i ordning, och kontrollblock som modulerar källan utanför kedjan. Pitch Envelope och Sample Envelope är också kontrollblock. Klicka på Klart för att återgå till ditt projekt.',
        },
      },
    ],
  },
  {
    id: 'layers',
    title: { en: 'Layers, sequencer & projects', sv: 'Lager, sequencer & projekt' },
    description: {
      en: 'Stack source lanes, drive timing with the sequencer, save your work.',
      sv: 'Stapla källspår, styr timing med sequencern, spara ditt arbete.',
    },
    sandbox: 'demo',
    buildDemo: buildLayersDemo,
    makeCtx: (demo) => ({ soundId: demo.sounds[0]!.id, laneId: demo.sounds[0]!.sources[0]!.id }),
    steps: [
      {
        id: 'orient',
        kind: 'read',
        target: null,
        text: {
          en: 'BLAST is built for game sound design — layering disparate elements into one hit: a whoosh, an impact, a tail. Each layer is its own source lane, and the lanes mix together at the bus. This tour shows layers, the sequencer, and saving your work.',
          sv: 'BLAST är byggt för spelljuddesign — att lagra olika element till en träff: en whoosh, en impact, en svans. Varje lager är ett eget källspår, och spåren mixas ihop vid bussen. Den här rundturen visar lager, sequencern och hur du sparar ditt arbete.',
        },
      },
      {
        id: 'add-layer',
        kind: 'do',
        target: '[data-tut="add-source"]',
        placement: 'right',
        text: {
          en: 'Click "Add source" to stack a second layer. The new lane gets its own source, its own effects, and its own level, pan and delay — so you can offset one layer in time from another.',
          sv: 'Klicka på "Add source" för att stapla ett andra lager. Det nya spåret får en egen källa, egna effekter och egen level, pan och delay — så att du kan tidsförskjuta ett lager mot ett annat.',
        },
        nudge: {
          en: 'Click the dashed "Add source" button below the lanes.',
          sv: 'Klicka på den streckade "Add source"-knappen under spåren.',
        },
        validate: (project, start, ctx) => {
          const cur = project.sounds.find((s) => s.id === ctx.soundId)
          const was = start.sounds.find((s) => s.id === ctx.soundId)
          return !!cur && !!was && cur.sources.length > was.sources.length
        },
      },
      {
        id: 'sequencer',
        kind: 'read',
        requireValidate: true,
        target: '[data-tut="sequencer"]',
        placement: 'left',
        text: {
          en: 'The step sequencer turns a single hit into a rhythm or arpeggio — it is sound-level, not an effect in the chain. Click it to open, switch it On, then press Play to hear it and use the −/+ control to change its length (the number of steps).',
          sv: 'Steg-sequencern gör en enda träff till en rytm eller ett arpeggio — den är på ljudnivå, inte en effekt i kedjan. Klicka för att öppna, slå På den, tryck sedan på Play för att höra den och använd −/+-kontrollen för att ändra dess längd (antalet steg).',
        },
        nudge: {
          en: 'Open the sequencer and switch it On to unlock Next.',
          sv: 'Öppna sequencern och slå På den för att låsa upp Nästa.',
        },
        validate: (project, start, ctx) => {
          const s = project.sounds.find((x) => x.id === ctx.soundId)
          return !!s?.sequencer?.enabled
        },
      },
      {
        id: 'projects',
        kind: 'read',
        target: '[data-tut="project-io"]',
        placement: 'bottom',
        text: {
          en: 'Your work saves automatically and survives a refresh. To keep or share a project, use Save to download it as a .blast file, and Load to open one later. Everything — sounds, samples and all — travels in that one file.',
          sv: 'Ditt arbete sparas automatiskt och överlever en omladdning. För att behålla eller dela ett projekt, använd Save för att ladda ner det som en .blast-fil, och Load för att öppna en senare. Allt — ljud, samples och allt — följer med i den enda filen.',
        },
      },
      {
        id: 'recap',
        kind: 'read',
        target: null,
        text: {
          en: 'That completes the tour: layer sources for rich one-shots, sequence them for rhythm, and save projects to keep and share. You now know the whole signal path end to end. Click Finish to return to your project.',
          sv: 'Det avslutar rundturen: lagra källor för rika one-shots, sekvensera dem för rytm och spara projekt för att behålla och dela. Du kan nu hela signalvägen från början till slut. Klicka på Klart för att återgå till ditt projekt.',
        },
      },
    ],
  },
  {
    id: 'sampler',
    title: { en: 'The Sampler', sv: 'Samplern' },
    description: {
      en: 'Load or record audio, save to your library, trim, crop, fade and more.',
      sv: 'Ladda eller spela in ljud, spara i biblioteket, trimma, klipp, fade m.m.',
    },
    sandbox: 'demo',
    buildDemo: buildSamplerDemo,
    makeCtx: (demo) => ({ soundId: demo.sounds[0]!.id, laneId: demo.sounds[0]!.sources[0]!.id }),
    // The sample buffer lives in the cache, not the project — load it on enter,
    // drop it on exit so the throwaway demo leaves nothing behind.
    onEnter: (demo, ctx) => loadDemoSample(ctx.laneId!),
    onExit: (ctx) => removeSample(ctx.laneId!),
    steps: [
      {
        id: 'orient',
        kind: 'read',
        target: null,
        text: {
          en: 'The Sample source plays back audio you load or record, instead of a synth oscillator — perfect for real-world hits, voices and field recordings. We loaded a short demo clip to work on. Samples travel inside the project file, so nothing is lost when you save.',
          sv: 'Sample-källan spelar upp ljud du laddar eller spelar in, istället för en synth-oscillator — perfekt för verkliga träffar, röster och fältinspelningar. Vi laddade ett kort demoklipp att jobba med. Samples följer med i projektfilen, så inget går förlorat när du sparar.',
        },
      },
      {
        id: 'load',
        kind: 'read',
        target: '[data-tut="sample-load"]',
        placement: 'top',
        text: {
          en: 'Three ways to get audio in: Browse to pick a file, Record to capture from your microphone (Record → Stop), or drag an audio file straight onto the waveform. A new clip replaces the old one.',
          sv: 'Tre sätt att få in ljud: Browse för att välja en fil, Record för att spela in från mikrofonen (Record → Stop), eller dra en ljudfil direkt på vågformen. Ett nytt klipp ersätter det gamla.',
        },
      },
      {
        id: 'library',
        kind: 'read',
        target: '[data-tut="sample-library"]',
        placement: 'top',
        text: {
          en: 'Library saves the current clip under a name so you can reuse it in any project, and load saved clips back in. Your library lives in this browser — handy for sounds you reach for often.',
          sv: 'Library sparar det aktuella klippet under ett namn så att du kan återanvända det i vilket projekt som helst, och ladda tillbaka sparade klipp. Ditt bibliotek finns i den här webbläsaren — smidigt för ljud du använder ofta.',
        },
      },
      {
        id: 'open-editor',
        kind: 'read',
        target: '[data-tut="sample-wave"]',
        placement: 'top',
        text: {
          en: 'Click the waveform to open the full sample editor, where you trim and shape the clip. Open it now, then click Next.',
          sv: 'Klicka på vågformen för att öppna den fullständiga sample-editorn, där du trimmar och formar klippet. Öppna den nu och klicka sedan på Nästa.',
        },
      },
      {
        id: 'trim',
        kind: 'read',
        requireValidate: true,
        target: '[data-tut="sample-editor-region"]',
        placement: 'top',
        text: {
          en: 'Drag the edges of the highlighted region to set the in and out points — only that slice plays, and it is non-destructive (the file is untouched). Use the In / Out fields below for exact times, and Play region to audition.',
          sv: 'Dra i kanterna på den markerade regionen för att sätta in- och ut-punkter — bara den biten spelas, och det är icke-förstörande (filen rörs inte). Använd In / Out-fälten nedanför för exakta tider, och Play region för att lyssna.',
        },
        nudge: {
          en: 'Drag a region edge (or type an In/Out value) in the sample editor to unlock Next.',
          sv: 'Dra i en regionkant (eller skriv ett In/Out-värde) i sample-editorn för att låsa upp Nästa.',
        },
        validate: (project, start, ctx) => {
          const l = lane(project, ctx)
          const lp = l?.params as SampleTrim | undefined
          return !!l && (lp?.trimStart != null || lp?.trimEnd != null)
        },
      },
      {
        id: 'tools',
        kind: 'read',
        target: '[data-tut="sample-tools"]',
        placement: 'top',
        text: {
          en: 'These tools change the audio itself (destructive, but Undo reverts each one): ✂ Crop cuts the file down to your region; Fade in / Fade out ramp the start or end; Reverse flips it backwards; Normalize lifts it to full volume. Try a few, then Undo.',
          sv: 'De här verktygen ändrar själva ljudet (förstörande, men Undo ångrar varje steg): ✂ Crop klipper ner filen till din region; Fade in / Fade out tonar in eller ut; Reverse vänder det baklänges; Normalize höjer det till full volym. Testa några och tryck sedan Undo.',
        },
      },
      {
        id: 'recap',
        kind: 'read',
        target: null,
        text: {
          en: 'That is the Sampler: load or record audio, save it to your library, trim a slice non-destructively, and crop, fade, reverse or normalize the file itself. Click Finish to return to your project.',
          sv: 'Det är Samplern: ladda eller spela in ljud, spara det i biblioteket, trimma en bit icke-förstörande, och crop, fade, reverse eller normalize själva filen. Klicka på Klart för att återgå till ditt projekt.',
        },
      },
    ],
  },
]

export function getChapter(id: string): TutorialChapter | null {
  return CHAPTERS.find((c) => c.id === id) ?? null
}
