import { useRef, useState } from 'react'
import { Button } from './ui'
import { saveProjectZip, loadProjectZip } from '../utils/projectZip'

export default function Header({ project, onRenameProject, onLoadProject }) {
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(null) // 'save' | 'load' | null
  const [error, setError] = useState(null)

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
    <header className="flex items-center gap-4 border-b border-slate-800 bg-slate-950/80 px-4 py-2.5">
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-black tracking-[0.2em] text-amber-400">BLAST</span>
        <span className="hidden text-[10px] uppercase tracking-wider text-slate-600 md:block">
          Big Loud Awesome Sound Tool
        </span>
      </div>

      <input
        value={project.name}
        onChange={(e) => onRenameProject(e.target.value)}
        spellCheck={false}
        className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-2 py-1 text-[13px] text-slate-200 outline-none transition-colors hover:border-slate-700 focus:border-amber-500/50 focus:bg-slate-900"
      />

      {error && <span className="max-w-64 truncate text-[11px] text-red-400" title={error}>{error}</span>}

      <div className="flex gap-1.5">
        <Button onClick={save} disabled={busy !== null}>
          {busy === 'save' ? 'Saving…' : 'Save ZIP'}
        </Button>
        <Button onClick={() => fileRef.current?.click()} disabled={busy !== null}>
          {busy === 'load' ? 'Loading…' : 'Load ZIP'}
        </Button>
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
    </header>
  )
}
