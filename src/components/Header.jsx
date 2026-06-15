import { useRef, useState } from 'react'
import { Button } from './ui'
import { saveProjectZip, loadProjectZip } from '../utils/projectZip'
import SettingsModal from './SettingsModal'

export default function Header({ project, onRenameProject, onLoadProject, onSetExport, onNewProject }) {
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(null) // 'save' | 'load' | null
  const [error, setError] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  async function save() {
    setBusy('save')
    setError(null)
    try {
      await saveProjectZip(project)
    } catch (e) {
      setError(`Save failed: ${e.message}`)
    }
    setBusy(null)
  }

  async function load(file) {
    setBusy('load')
    setError(null)
    try {
      const loaded = await loadProjectZip(file)
      onLoadProject(loaded)
    } catch (e) {
      setError(e.message)
    }
    setBusy(null)
  }

  return (
    <header className="flex items-center gap-4 border-b border-divider bg-panel px-4 py-2.5">
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-black tracking-[0.2em] text-accent">BLAST</span>
        <span className="text-[10px] font-semibold text-faint">0.9</span>
        <span className="hidden text-[10px] uppercase tracking-[0.05em] text-faint md:block">
          {[['B','ig'],['L','oud'],['A','wesome'],['S','ound'],['T','ool']].map(([first, rest]) => (
            <span key={first}>
              <span className="text-[13px] font-bold text-yellow-400">{first}</span><span className="text-zinc-400">{rest}</span>{' '}
            </span>
          ))}
        </span>
      </div>

      <input
        value={project.name}
        onChange={(e) => onRenameProject(e.target.value)}
        spellCheck={false}
        className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-2 py-1 text-[13px] text-ink outline-none transition-colors hover:border-edge focus:border-accent-deep/50 focus:bg-well"
      />

      {error && <span className="max-w-64 truncate text-[11px] text-danger" title={error}>{error}</span>}

      <div className="flex gap-1.5">
        <Button onClick={save} disabled={busy !== null}>
          {busy === 'save' ? 'Saving…' : 'Save ZIP'}
        </Button>
        <Button onClick={() => fileRef.current?.click()} disabled={busy !== null}>
          {busy === 'load' ? 'Loading…' : 'Load ZIP'}
        </Button>
        <Button onClick={() => setSettingsOpen(true)} title="Settings">⚙</Button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) load(f)
          e.target.value = ''
        }}
      />
      {settingsOpen && (
        <SettingsModal
          project={project}
          onRenameProject={onRenameProject}
          onSetExport={onSetExport}
          onNewProject={onNewProject}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </header>
  )
}
