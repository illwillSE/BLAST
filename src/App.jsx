import { useCallback, useEffect, useState } from 'react'
import { newProject, newSound, newBlock, uid } from './state/model'
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

  const playSound = useCallback(async (soundId) => {
    setSelectedId(soundId)
    setProject((p) => {
      const target = p.sounds.find((s) => s.id === soundId)
      if (target) {
        liveEngine.play(target).then(({ duration }) => {
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

  // ---- sound actions ------------------------------------------------------

  function addSound() {
    const s = newSound(`Sound ${project.sounds.length + 1}`)
    setProject((p) => ({ ...p, sounds: [...p.sounds, s] }))
    setSelectedId(s.id)
  }

  function duplicateSound(soundId) {
    const src = project.sounds.find((s) => s.id === soundId)
    if (!src) return
    const copy = {
      ...structuredClone({ ...src, name: `${src.name} copy` }),
      id: uid('snd'),
      blocks: src.blocks.map((b) => {
        const nb = { ...structuredClone(b), id: uid('blk') }
        const sample = getSample(b.id)
        if (sample) setSample(nb.id, sample)
        return nb
      }),
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

  const onParam = (blockId, key, value) =>
    updateSound(sound.id, (s) => ({
      ...s,
      blocks: s.blocks.map((b) =>
        b.id === blockId ? { ...b, params: { ...b.params, [key]: value } } : b,
      ),
    }))

  const onToggle = (blockId) =>
    updateSound(sound.id, (s) => ({
      ...s,
      blocks: s.blocks.map((b) => (b.id === blockId ? { ...b, enabled: !b.enabled } : b)),
    }))

  const onRemove = (blockId) =>
    updateSound(sound.id, (s) => ({ ...s, blocks: s.blocks.filter((b) => b.id !== blockId) }))

  const onAdd = (type) =>
    updateSound(sound.id, (s) => ({ ...s, blocks: [...s.blocks, newBlock(type)] }))

  const onMove = (from, to) =>
    updateSound(sound.id, (s) => {
      const blocks = [...s.blocks]
      const [moved] = blocks.splice(from, 1)
      blocks.splice(to, 0, moved)
      return { ...s, blocks }
    })

  const onSwapSource = (blockId, type) =>
    updateSound(sound.id, (s) => ({
      ...s,
      blocks: s.blocks.map((b) => (b.id === blockId ? newBlock(type) : b)),
    }))

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
              <div className="min-h-0 flex-1 overflow-y-auto">
                <ChainEditor
                  sound={sound}
                  onParam={onParam}
                  onToggle={onToggle}
                  onRemove={onRemove}
                  onMove={onMove}
                  onAdd={onAdd}
                  onSwapSource={onSwapSource}
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
