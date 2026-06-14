import JSZip from 'jszip'
import { allSamples, setSample, decodeBlob } from '../audio/sampleCache'
import { downloadBlob, safeFileName, DEFAULT_EXPORT } from '../audio/render'
import { BLOCK_DEFS } from '../blocks/registry'
import { defaultParams, isSource, allBlocks } from '../state/model'
import { newSequencer } from '../audio/sequencer'

// Migrate a pre-multi-lane sound (flat `blocks` array) to the lane model:
// the single source becomes one lane, every other block becomes that lane's
// effects chain (audio-identical to the old flat chain), master starts empty.
function migrateSound(sound) {
  if (sound.sources) return sound // already the lane model
  const blocks = sound.blocks ?? []
  const srcIdx = blocks.findIndex(isSource)
  const source = srcIdx >= 0 ? blocks[srcIdx] : null
  const chain = blocks.filter((_, i) => i !== srcIdx)
  const lane = source
    ? { ...source, chain, delay: 0, level: 0, pan: 0 }
    : { ...newLaneFallback(), chain }
  delete sound.blocks
  return { ...sound, sources: [lane], master: [] }
}

// A defensive fallback if a saved sound somehow has no source block at all.
function newLaneFallback() {
  return { id: `blk_${Date.now().toString(36)}`, type: 'synth', enabled: true, params: defaultParams('synth'), delay: 0, level: 0, pan: 0 }
}

// Backfill params introduced after a project was saved (e.g. the synth's
// partials/width/harmonics) and lane-level props, so older files open with
// sensible defaults.
export function normalizeProject(project) {
  project.export = { ...DEFAULT_EXPORT, ...project.export }
  project.sounds = project.sounds.map((raw) => {
    const sound = migrateSound(raw)
    if (!sound.master) sound.master = []
    // Backfill the sequencer onto projects saved before it existed; merge so a
    // saved sequencer keeps its steps while gaining any newer default fields.
    sound.sequencer = { ...newSequencer(), ...sound.sequencer }
    // Migrate early-format steps whose notes were bare semitone numbers to the
    // { pitch, len } shape that carries per-note length.
    sound.sequencer.steps = (sound.sequencer.steps ?? []).map((s) => ({
      ...s,
      notes: (s.notes ?? []).map((n) => (typeof n === 'number' ? { pitch: n, len: 1 } : n)),
    }))
    for (const src of sound.sources) {
      if (src.delay == null) src.delay = 0
      if (src.level == null) src.level = 0
      if (src.pan == null) src.pan = 0
      if (!src.chain) src.chain = []
    }
    for (const block of allBlocks(sound)) {
      if (!BLOCK_DEFS[block.type]) continue
      block.params = { ...defaultParams(block.type), ...block.params }
    }
    return sound
  })
  return project
}

const FORMAT_VERSION = 1

// ZIP layout:
//   project.json          — project state + sample manifest
//   samples/<blockId>_<originalname>  — original sample bytes, untouched
export async function saveProjectZip(project) {
  const zip = new JSZip()
  const usedBlockIds = new Set(
    project.sounds.flatMap((s) => allBlocks(s).map((b) => b.id)),
  )

  const sampleManifest = {}
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

export async function loadProjectZip(file) {
  const zip = await JSZip.loadAsync(file)
  const jsonFile = zip.file('project.json')
  if (!jsonFile) throw new Error('Not a BLAST project: project.json missing from ZIP')
  const data = JSON.parse(await jsonFile.async('string'))
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
