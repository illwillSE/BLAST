import JSZip from 'jszip'
import { allSamples, setSample, decodeBlob } from '../audio/sampleCache'
import { downloadBlob, safeFileName, DEFAULT_EXPORT } from '../audio/render'
import { BLOCK_DEFS } from '../blocks/registry'
import { defaultParams, isSource, allBlocks } from '../state/model'
import { newSequencer } from '../audio/sequencer'
import type { Block, Lane, Project, SeqNote, Sound } from '../types'

// Migrate a pre-multi-lane sound (flat `blocks` array) to the lane model:
// the single source becomes one lane, every other block becomes that lane's
// effects chain (audio-identical to the old flat chain), master starts empty.
function migrateSound(raw: Sound): Sound {
  // Pre-multi-lane saves carry a flat `blocks` array instead of `sources`.
  const legacy = raw as Sound & { blocks?: Block[] }
  if (raw.sources) return raw // already the lane model
  const blocks = legacy.blocks ?? []
  const srcIdx = blocks.findIndex((b) => isSource(b))
  const source = srcIdx >= 0 ? blocks[srcIdx] : null
  const chain = blocks.filter((_, i) => i !== srcIdx)
  const lane: Lane = source
    ? ({ ...source, chain, delay: 0, level: 0, pan: 0 } as Lane)
    : { ...newLaneFallback(), chain }
  delete legacy.blocks
  return { ...raw, sources: [lane], master: [] }
}

// A defensive fallback if a saved sound somehow has no source block at all.
function newLaneFallback(): Lane {
  return { id: `blk_${Date.now().toString(36)}`, type: 'synth', enabled: true, params: defaultParams('synth'), chain: [], delay: 0, level: 0, pan: 0 }
}

// Backfill params introduced after a project was saved (e.g. the synth's
// partials/width/harmonics) and lane-level props, so older files open with
// sensible defaults.
export function normalizeProject(project: Project): Project {
  project.export = { ...DEFAULT_EXPORT, ...project.export }
  project.sounds = project.sounds.map((raw) => {
    const sound = migrateSound(raw)
    if (!sound.master) sound.master = []
    if (!sound.voicing) sound.voicing = 'poly'
    // Backfill the sequencer onto projects saved before it existed; merge so a
    // saved sequencer keeps its steps while gaining any newer default fields.
    sound.sequencer = { ...newSequencer(), ...sound.sequencer }
    // Migrate early-format steps whose notes were bare semitone numbers to the
    // { pitch, len } shape that carries per-note length.
    sound.sequencer.steps = (sound.sequencer.steps ?? []).map((s) => ({
      ...s,
      notes: ((s.notes ?? []) as (number | SeqNote)[]).map((n) => (typeof n === 'number' ? { pitch: n, len: 1 } : n)),
    }))
    for (const src of sound.sources) {
      if (src.delay == null) src.delay = 0
      if (src.level == null) src.level = 0
      if (src.pan == null) src.pan = 0
      if (!src.chain) src.chain = []
    }
    // The old Debug + Visualizer blocks were merged into one Monitor block (Debug
    // became Monitor's `meter` view mode). Remap saved instances before the
    // unknown-type drop below, so they reopen as Monitor instead of vanishing.
    for (const block of [...sound.sources.flatMap((s) => s.chain), ...sound.master]) {
      // Legacy type strings ('debug'/'visualizer') aren't in the BlockType union.
      const b = block as { type: string; params: Record<string, unknown> }
      if (b.type === 'debug') { b.type = 'monitor'; b.params = { ...b.params, mode: 'meter' } }
      else if (b.type === 'visualizer') b.type = 'monitor'
    }
    // Drop chain/master blocks whose type no longer exists in the registry
    // (e.g. a removed block kind in an older autosave) so they can't crash the
    // UI or engine on load.
    for (const src of sound.sources) src.chain = src.chain.filter((b) => BLOCK_DEFS[b.type])
    sound.master = sound.master.filter((b) => BLOCK_DEFS[b.type])
    for (const block of allBlocks(sound)) {
      if (!BLOCK_DEFS[block.type]) continue
      block.params = { ...defaultParams(block.type), ...block.params } as typeof block.params
    }
    return sound
  })
  return project
}

const FORMAT_VERSION = 1

// ZIP layout:
//   project.json          — project state + sample manifest
//   samples/<blockId>_<originalname>  — original sample bytes, untouched
export async function saveProjectZip(project: Project): Promise<void> {
  const zip = new JSZip()
  const usedBlockIds = new Set(
    project.sounds.flatMap((s) => allBlocks(s).map((b) => b.id)),
  )

  const sampleManifest: Record<string, { path: string; fileName: string }> = {}
  for (const [blockId, { blob, fileName }] of allSamples()) {
    if (!usedBlockIds.has(blockId)) continue
    const path = `samples/${blockId}_${safeFileName(fileName || 'sample')}`
    sampleManifest[blockId] = { path, fileName }
    zip.file(path, blob)
  }

  zip.file(
    'project.json',
    JSON.stringify({ formatVersion: FORMAT_VERSION, project, samples: sampleManifest }, null, 2),
  )

  const blob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(blob, `${safeFileName(project.name)}.blast.zip`)
}

export async function loadProjectZip(file: Blob): Promise<Project> {
  const zip = await JSZip.loadAsync(file)
  const jsonFile = zip.file('project.json')
  if (!jsonFile) throw new Error('Not a BLAST project: project.json missing from ZIP')
  const data = JSON.parse(await jsonFile.async('string')) as {
    project?: Project
    samples?: Record<string, { path: string; fileName: string }>
  }
  if (!data.project?.sounds) throw new Error('Not a BLAST project: invalid project.json')

  for (const [blockId, { path, fileName }] of Object.entries(data.samples || {})) {
    const entry = zip.file(path)
    if (!entry) continue
    const blob = await entry.async('blob')
    const audioBuffer = await decodeBlob(blob)
    setSample(blockId, { blob, fileName, audioBuffer })
  }

  return normalizeProject(data.project)
}
