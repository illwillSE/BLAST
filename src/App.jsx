import { useCallback, useEffect, useRef, useState } from 'react'
import {
  newProject, newSound, newBlock, newLane, uid,
  mapBlock, removeBlock, addBlock, moveBlock, swapSource, isSource, allBlocks,
} from './state/model'
import { presetProject } from './state/presets'
import { useUndoableProject } from './state/useUndoableProject'
import { liveEngine } from './audio/engine'
import { newSequencer, sequenceToNotes } from './audio/sequencer'
import { renderSoundToWav, downloadBlob, safeFileName } from './audio/render'
import { getSample, setSample, decodeBlob, allSamples } from './audio/sampleCache'
import { loadAutosaveSamples, saveAutosaveSamples } from './utils/sampleLibrary'
import { getClipboard, setClipboard } from './state/clipboard'
import { normalizeProject } from './utils/projectZip'
import { emitPlay } from './utils/bus'
import Header from './components/Header'
import SoundList from './components/SoundList'
import ChainEditor from './components/ChainEditor'
import { Button } from './components/ui'

// Clone a block (or lane), giving it a fresh id and copying an embedded sample
// into the new id. Shared by sound duplication and clipboard paste.
function cloneWithSample(block, sample) {
  const nb = { ...structuredClone(block), id: uid('blk') }
  if (sample) setSample(nb.id, sample)
  return nb
}

export default function App() {
  const { project, dispatch, reset, undo, redo } = useUndoableProject(() => {
    try {
      const raw = localStorage.getItem('blast_autosave')
      if (raw) {
        const parsed = JSON.parse(raw)
        return normalizeProject(parsed.project ?? parsed) // compat: old format was a bare project
      }
    } catch {}
    return presetProject()
  })
  const [selectedId, setSelectedId] = useState(() => project.sounds[0].id)
  const [exporting, setExporting] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')

  const sound = project.sounds.find((s) => s.id === selectedId) ?? project.sounds[0]

  // Cancel inline name editing when switching sounds.
  useEffect(() => { setEditingName(false) }, [selectedId])

  // Keep the audio graph in step with the UI. sync() rebuilds only when the
  // chain structure changed; otherwise it just applies parameter values.
  useEffect(() => {
    if (sound) liveEngine.sync(sound)
  }, [sound])

  // On mount: restore sample blobs from IndexedDB using the manifest stored in localStorage.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('blast_autosave')
      const { sampleManifest = {} } = raw ? JSON.parse(raw) : {}
      loadAutosaveSamples(sampleManifest).then(async (entries) => {
        for (const { blockId, blob, fileName } of entries) {
          setSample(blockId, { blob, fileName, audioBuffer: await decodeBlob(blob) })
        }
      })
    } catch {}
  }, [])

  // Auto-save project JSON + sample manifest on every change (debounced 1 s).
  // Skip the first render so we never overwrite a loaded autosave with presets.
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    const timer = setTimeout(async () => {
      const usedIds = new Set(project.sounds.flatMap(s => allBlocks(s).map(b => b.id)))
      const samples = allSamples()
        .filter(([id]) => usedIds.has(id))
        .map(([blockId, { blob, fileName }]) => ({ blockId, blob, fileName }))
      const sampleManifest = await saveAutosaveSamples(samples)
      try { localStorage.setItem('blast_autosave', JSON.stringify({ project, sampleManifest })) } catch {}
    }, 1000)
    return () => clearTimeout(timer)
  }, [project])

  const updateSound = useCallback((soundId, fn, coalesceKey) => {
    dispatch((p) => ({
      ...p,
      sounds: p.sounds.map((s) => (s.id === soundId ? fn(s) : s)),
    }), coalesceKey)
  }, [dispatch])

  const playSound = useCallback(async (soundId, transpose = 0) => {
    setSelectedId(soundId)
    dispatch((p) => {
      const target = p.sounds.find((s) => s.id === soundId)
      if (target) {
        // When the sequencer is on, Play runs the whole sequence (the held
        // key transposes it); otherwise it's a single note at `transpose`.
        const notes = sequenceToNotes(target.sequencer, transpose)
        liveEngine.play(target, notes).then(({ duration }) => {
          emitPlay({ soundId, duration })
        })
      }
      return p
    })
  }, [dispatch])

  // Spacebar always plays — like a DAW transport. Only true text entry
  // (name fields, value popups) keeps Space for typing; focused sliders,
  // selects and buttons don't swallow it (use Enter to activate a button,
  // arrow keys to fine-tune a slider).
  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== 'Space') return
      const el = document.activeElement
      const isTextEntry =
        el?.tagName === 'TEXTAREA' || (el?.tagName === 'INPUT' && el.type !== 'range')
      if (isTextEntry) return
      e.preventDefault()
      playSound(selectedId)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, playSound])

  // QWERTY piano: play the selected sound at different pitches. Keyed by
  // physical position (`e.code`, not `e.key`) so the layout works the same on
  // any keyboard. Offsets are semitones from the source's own Pitch (q = root),
  // so the chromatic octave rides on top of the Pitch control. Monophonic —
  // the engine has a single synth voice and samples retrigger.
  useEffect(() => {
    const KEY_SEMIS = {
      KeyQ: 0, Digit2: 1, KeyW: 2, Digit3: 3, KeyE: 4, KeyR: 5, Digit5: 6,
      KeyT: 7, Digit6: 8, KeyY: 9, Digit7: 10, KeyU: 11, KeyI: 12,
    }
    const onKey = (e) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      const semis = KEY_SEMIS[e.code]
      if (semis === undefined) return
      const el = document.activeElement
      const isTextEntry =
        el?.tagName === 'TEXTAREA' || (el?.tagName === 'INPUT' && el.type !== 'range')
      if (isTextEntry) return
      e.preventDefault()
      playSound(selectedId, semis)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, playSound])

  // Undo / redo. Skipped in text-entry fields so the browser's native text
  // undo keeps working in name fields and value popups.
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      const isUndo = e.key === 'z' && !e.shiftKey
      const isRedo = (e.key === 'z' && e.shiftKey) || e.key === 'y'
      if (!isUndo && !isRedo) return
      const el = document.activeElement
      const isTextEntry =
        el?.tagName === 'TEXTAREA' || (el?.tagName === 'INPUT' && el.type !== 'range')
      if (isTextEntry) return
      e.preventDefault()
      if (isUndo) undo()
      else redo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  // ---- sound actions ------------------------------------------------------

  function addSound() {
    const s = newSound(`Sound ${project.sounds.length + 1}`)
    dispatch((p) => ({ ...p, sounds: [...p.sounds, s] }))
    setSelectedId(s.id)
  }

  function duplicateSound(soundId) {
    const src = project.sounds.find((s) => s.id === soundId)
    if (!src) return
    const cloneBlock = (b) => cloneWithSample(b, getSample(b.id))
    const copy = {
      ...structuredClone({ ...src, name: `${src.name} copy` }),
      id: uid('snd'),
      sources: src.sources.map((lane) => {
        const nl = cloneBlock(lane) // new id + sample for the source head
        nl.chain = lane.chain.map(cloneBlock)
        return nl
      }),
      master: src.master.map(cloneBlock),
    }
    dispatch((p) => {
      const i = p.sounds.findIndex((s) => s.id === soundId)
      const sounds = [...p.sounds]
      sounds.splice(i + 1, 0, copy)
      return { ...p, sounds }
    })
    setSelectedId(copy.id)
  }

  function deleteSound(soundId) {
    dispatch((p) => {
      const sounds = p.sounds.filter((s) => s.id !== soundId)
      if (soundId === selectedId && sounds.length > 0) setSelectedId(sounds[0].id)
      return { ...p, sounds }
    })
  }

  // ---- block actions ------------------------------------------------------
  // A block lives either in a lane's chain (target = lane/source id) or in the
  // master chain (target = 'master'). Param/toggle/remove find it by id.

  const onParam = (blockId, key, value) =>
    updateSound(sound.id, (s) =>
      mapBlock(s, blockId, (b) => ({ ...b, params: { ...b.params, [key]: value } })),
      `param:${blockId}:${key}`,
    )

  const onToggle = (blockId) =>
    updateSound(sound.id, (s) => mapBlock(s, blockId, (b) => ({ ...b, enabled: !b.enabled })))

  const onRemove = (blockId) => updateSound(sound.id, (s) => removeBlock(s, blockId))

  const onAdd = (target, type) => {
    const block = newBlock(type)
    updateSound(sound.id, (s) => addBlock(s, target, block))
    return block.id
  }

  const onMove = (target, from, to) =>
    updateSound(sound.id, (s) => moveBlock(s, target, from, to))

  const onSwapSource = (laneId, type) =>
    updateSound(sound.id, (s) => ({
      ...s,
      sources: s.sources.map((src) => (src.id === laneId ? swapSource(src, type) : src)),
    }))

  // ---- lane actions -------------------------------------------------------

  const onLaneProp = (laneId, key, value) =>
    updateSound(sound.id, (s) => ({
      ...s,
      sources: s.sources.map((src) => (src.id === laneId ? { ...src, [key]: value } : src)),
    }), `lane:${laneId}:${key}`)

  const onAddSource = () => {
    const lane = newLane('synth')
    updateSound(sound.id, (s) => ({ ...s, sources: [...s.sources, lane] }))
    return lane.id
  }

  const onRemoveLane = (laneId) =>
    updateSound(sound.id, (s) =>
      s.sources.length <= 1 ? s : { ...s, sources: s.sources.filter((src) => src.id !== laneId) },
    )

  const onOutputVolume = (v) => updateSound(sound.id, (s) => ({ ...s, outputVolume: v }), 'output:volume')

  const onVoicing = (v) => updateSound(sound.id, (s) => ({ ...s, voicing: v }))

  // Patch the sound-level sequencer (merge so callers send only changed fields).
  const onSequencer = (patch) =>
    updateSound(sound.id, (s) => ({ ...s, sequencer: { ...(s.sequencer ?? newSequencer()), ...patch } }))

  // ---- export -------------------------------------------------------------

  const setExport = (patch) =>
    dispatch((p) => ({ ...p, export: { ...p.export, ...patch } }))

  async function exportWav() {
    setExporting(true)
    try {
      const blob = await renderSoundToWav(sound, project.export)
      downloadBlob(blob, `${safeFileName(sound.name)}.wav`)
    } catch (e) {
      console.error('Export failed', e)
    }
    setExporting(false)
  }

  // ---- clipboard paste (copy lives in the clipboard module) ---------------

  // Paste a non-source block as a clone into a lane chain (target = lane id) or
  // the master chain (target = MASTER). Returns the new block id for selection.
  const pasteBlock = (target) => {
    const c = getClipboard()
    if (c?.kind !== 'block' || isSource(c.block)) return
    const block = cloneWithSample(c.block, c.sample)
    updateSound(sound.id, (s) => addBlock(s, target, block))
    return block.id
  }

  // A copied source always pastes as a new source lane (empty chain).
  const pasteSourceLane = () => {
    const c = getClipboard()
    if (c?.kind !== 'block' || !isSource(c.block)) return
    const lane = { ...newLane(c.block.type), params: structuredClone(c.block.params), enabled: c.block.enabled }
    if (c.sample) setSample(lane.id, c.sample)
    updateSound(sound.id, (s) => ({ ...s, sources: [...s.sources, lane] }))
    return lane.id
  }

  // Overwrite an existing block's params from a copied block of the same type.
  const pasteValues = (blockId) => {
    const c = getClipboard()
    if (c?.kind !== 'block') return
    updateSound(sound.id, (s) =>
      mapBlock(s, blockId, (b) =>
        b.type === c.block.type ? { ...b, params: structuredClone(c.block.params) } : b),
    )
  }

  // Drop a copied sample into a brand-new sound as a Sample source.
  const pasteAsNewSound = () => {
    const c = getClipboard()
    if (c?.kind !== 'sample') return
    const s = newSound(c.label || 'Sample')
    s.sources[0] = swapSource(s.sources[0], 'sample')
    setSample(s.sources[0].id, c.sample)
    dispatch((p) => ({ ...p, sounds: [...p.sounds, s] }))
    setSelectedId(s.id)
  }

  // Render the current sound to audio and put it on the clipboard as a sample.
  async function copyOutputAsSample() {
    const blob = await renderSoundToWav(sound, project.export)
    const audioBuffer = await decodeBlob(blob)
    setClipboard({ kind: 'sample', sample: { blob, fileName: `${sound.name}.wav`, audioBuffer }, label: `${sound.name}_copy` })
  }

  // Toolbar one-click: render output → new Sample sound (also leaves it on the
  // clipboard, so it can instead be pasted into an existing sample block).
  async function outputToSampleSound() {
    setExporting(true)
    try {
      await copyOutputAsSample()
      pasteAsNewSound()
    } catch (e) {
      console.error('Render to sample failed', e)
    }
    setExporting(false)
  }

  function loadProject(loaded) {
    reset(loaded)
    setSelectedId(loaded.sounds[0]?.id)
  }

  // Start fresh. Uses reset (like loadProject) so it clears undo history —
  // this is the "cannot be undone" action the Settings modal warns about.
  function newBlankProject() {
    loadProject(newProject())
  }

  return (
    <div className="flex h-screen flex-col">
      <Header
        project={project}
        onRenameProject={(name) => dispatch((p) => ({ ...p, name }))}
        onLoadProject={loadProject}
        onSetExport={setExport}
        onNewProject={newBlankProject}
      />
      <div className="flex min-h-0 flex-1">
        <SoundList
          sounds={project.sounds}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onPlay={playSound}
          onAdd={addSound}
          onRename={(id, name) => updateSound(id, (s) => ({ ...s, name }))}
          onDuplicate={duplicateSound}
          onDelete={deleteSound}
          onPasteAsNewSound={pasteAsNewSound}
        />
        <main className="flex min-w-0 flex-1 flex-col">
          {sound ? (
            <>
              <div className="flex items-center gap-3 border-b border-divider px-4 py-2.5">
                <button
                  onClick={() => playSound(sound.id)}
                  title="Play (Space)"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-accent-deep/60 bg-accent-deep/15 text-sm text-accent-bright transition-all hover:scale-105 hover:bg-accent-deep/30 active:scale-95"
                >
                  ▶
                </button>
                {editingName ? (
                  <input
                    autoFocus
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onBlur={() => {
                      setEditingName(false)
                      const name = nameDraft.trim()
                      if (name && name !== sound.name) updateSound(sound.id, (s) => ({ ...s, name }))
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                      if (e.key === 'Escape') { setEditingName(false) }
                    }}
                    className="flex-1 rounded border border-accent-deep/50 bg-well px-2 py-0.5 text-[14px] font-semibold text-ink outline-none"
                  />
                ) : (
                  <h2
                    className="flex-1 cursor-text truncate text-[14px] font-semibold text-ink"
                    onDoubleClick={() => { setEditingName(true); setNameDraft(sound.name) }}
                    title="Double-click to rename"
                  >
                    {sound.name}
                  </h2>
                )}
                <Button onClick={outputToSampleSound} disabled={exporting} title="Render this sound and drop it into a new Sample sound">
                  → Sample sound
                </Button>
                <Button onClick={exportWav} variant="primary" disabled={exporting}>
                  {exporting ? 'Rendering…' : 'Export WAV'}
                </Button>
              </div>
              <div className="min-h-0 flex-1">
                <ChainEditor
                  sound={sound}
                  onParam={onParam}
                  onToggle={onToggle}
                  onRemove={onRemove}
                  onMove={onMove}
                  onAdd={onAdd}
                  onSwapSource={onSwapSource}
                  onLaneProp={onLaneProp}
                  onAddSource={onAddSource}
                  onRemoveLane={onRemoveLane}
                  onOutputVolume={onOutputVolume}
                  onVoicing={onVoicing}
                  onSequencer={onSequencer}
                  onPasteBlock={pasteBlock}
                  onPasteSourceLane={pasteSourceLane}
                  onPasteValues={pasteValues}
                />
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-muted">
              Add a sound to get started
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
