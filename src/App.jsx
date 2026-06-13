import { useCallback, useEffect, useState } from 'react'
import {
  newProject, newSound, newBlock, newLane, uid,
  mapBlock, removeBlock, addBlock, moveBlock, swapSource,
} from './state/model'
import { liveEngine } from './audio/engine'
import { renderSoundToWav, downloadBlob, safeFileName } from './audio/render'
import { getSample, setSample } from './audio/sampleCache'
import { emitPlay } from './utils/bus'
import Header from './components/Header'
import SoundList from './components/SoundList'
import ChainEditor from './components/ChainEditor'
import { Button } from './components/ui'

export default function App() {
  const [project, setProject] = useState(newProject)
  const [selectedId, setSelectedId] = useState(() => project.sounds[0].id)
  const [exporting, setExporting] = useState(false)

  const sound = project.sounds.find((s) => s.id === selectedId) ?? project.sounds[0]

  // Keep the audio graph in step with the UI. sync() rebuilds only when the
  // chain structure changed; otherwise it just applies parameter values.
  useEffect(() => {
    if (sound) liveEngine.sync(sound)
  }, [sound])

  const updateSound = useCallback((soundId, fn) => {
    setProject((p) => ({
      ...p,
      sounds: p.sounds.map((s) => (s.id === soundId ? fn(s) : s)),
    }))
  }, [])

  const playSound = useCallback(async (soundId, transpose = 0) => {
    setSelectedId(soundId)
    setProject((p) => {
      const target = p.sounds.find((s) => s.id === soundId)
      if (target) {
        liveEngine.play(target, transpose).then(({ duration }) => {
          emitPlay({ soundId, duration })
        })
      }
      return p
    })
  }, [])

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

  // ---- sound actions ------------------------------------------------------

  function addSound() {
    const s = newSound(`Sound ${project.sounds.length + 1}`)
    setProject((p) => ({ ...p, sounds: [...p.sounds, s] }))
    setSelectedId(s.id)
  }

  function duplicateSound(soundId) {
    const src = project.sounds.find((s) => s.id === soundId)
    if (!src) return
    // Clone a block, giving it a fresh id and copying any embedded sample.
    const cloneBlock = (b) => {
      const nb = { ...structuredClone(b), id: uid('blk') }
      const sample = getSample(b.id)
      if (sample) setSample(nb.id, sample)
      return nb
    }
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
    setProject((p) => {
      const i = p.sounds.findIndex((s) => s.id === soundId)
      const sounds = [...p.sounds]
      sounds.splice(i + 1, 0, copy)
      return { ...p, sounds }
    })
    setSelectedId(copy.id)
  }

  function deleteSound(soundId) {
    setProject((p) => {
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
    }))

  const onAddSource = () => {
    const lane = newLane('synth')
    updateSound(sound.id, (s) => ({ ...s, sources: [...s.sources, lane] }))
    return lane.id
  }

  const onRemoveLane = (laneId) =>
    updateSound(sound.id, (s) =>
      s.sources.length <= 1 ? s : { ...s, sources: s.sources.filter((src) => src.id !== laneId) },
    )

  const onOutputVolume = (v) => updateSound(sound.id, (s) => ({ ...s, outputVolume: v }))

  const onOutputView = (v) => updateSound(sound.id, (s) => ({ ...s, outputView: v }))

  // ---- export -------------------------------------------------------------

  async function exportWav() {
    setExporting(true)
    try {
      const blob = await renderSoundToWav(sound)
      downloadBlob(blob, `${safeFileName(sound.name)}.wav`)
    } catch (e) {
      console.error('Export failed', e)
    }
    setExporting(false)
  }

  function loadProject(loaded) {
    setProject(loaded)
    setSelectedId(loaded.sounds[0]?.id)
  }

  return (
    <div className="flex h-screen flex-col">
      <Header
        project={project}
        onRenameProject={(name) => setProject((p) => ({ ...p, name }))}
        onLoadProject={loadProject}
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
        />
        <main className="flex min-w-0 flex-1 flex-col">
          {sound ? (
            <>
              <div className="flex items-center gap-3 border-b border-slate-800/60 px-4 py-2.5">
                <button
                  onClick={() => playSound(sound.id)}
                  title="Play (Space)"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-amber-500/60 bg-amber-500/15 text-sm text-amber-300 transition-all hover:scale-105 hover:bg-amber-500/30 active:scale-95"
                >
                  ▶
                </button>
                <h2 className="flex-1 truncate text-[14px] font-semibold text-slate-200">{sound.name}</h2>
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
                  onOutputView={onOutputView}
                />
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-slate-600">
              Add a sound to get started
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
