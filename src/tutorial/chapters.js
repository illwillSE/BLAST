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
import { newProject, newSound, newBlock, findLane } from '../state/model'

// The lane this chapter operates on, resolved fresh from a given project.
function lane(project, ctx) {
  const sound = project.sounds.find((s) => s.id === ctx.soundId)
  if (!sound) return null
  return findLane(sound, ctx.laneId) ?? sound.sources.find((s) => s.id === ctx.laneId) ?? null
}

function chainIds(project, ctx) {
  return lane(project, ctx)?.chain.map((b) => b.id) ?? []
}

// Curated throwaway demo for the Core flow chapter: one synth lane seeded with
// a Filter block, so a "reorder" step has two blocks to work with once the
// learner adds a second one.
function buildCoreFlowDemo() {
  const project = newProject()
  const sound = newSound('Tutorial Sound')
  sound.sources[0].chain = [newBlock('filter')]
  project.sounds = [sound]
  return project
}

export const CHAPTERS = [
  {
    id: 'core-flow',
    title: { en: 'Core flow', sv: 'Grundflödet' },
    description: {
      en: 'Orient, play, add an effect, tweak it, reorder, bypass.',
      sv: 'Orientera, spela, lägg till en effekt, justera, ordna om, koppla förbi.',
    },
    sandbox: 'demo',
    buildDemo: buildCoreFlowDemo,
    makeCtx: (demo) => ({ soundId: demo.sounds[0].id, laneId: demo.sounds[0].sources[0].id }),
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
  { id: 'sources', title: { en: 'Sources & synthesis', sv: 'Källor & syntes' }, stub: true },
  { id: 'effects', title: { en: 'Effects & control blocks', sv: 'Effekter & kontrollblock' }, stub: true },
  { id: 'layers', title: { en: 'Layers, sequencer & projects', sv: 'Lager, sequencer & projekt' }, stub: true },
]

export function getChapter(id) {
  return CHAPTERS.find((c) => c.id === id) ?? null
}
