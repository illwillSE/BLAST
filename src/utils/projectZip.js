import JSZip from 'jszip'
import { allSamples, setSample, decodeBlob } from '../audio/sampleCache'
import { downloadBlob, safeFileName } from '../audio/render'

const FORMAT_VERSION = 1

// ZIP layout:
//   project.json          — project state + sample manifest
//   samples/<blockId>_<originalname>  — original sample bytes, untouched
export async function saveProjectZip(project) {
  const zip = new JSZip()
  const usedBlockIds = new Set(
    project.sounds.flatMap((s) => s.blocks.map((b) => b.id)),
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

  return data.project
}
