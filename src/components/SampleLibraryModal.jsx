import { useEffect, useRef, useState } from 'react'
import { X, Play, Square } from 'lucide-react'
import { decodeBlob } from '../audio/sampleCache'
import { listLibrary, addToLibrary, removeFromLibrary } from '../utils/sampleLibrary'
import { useT } from '../state/uiPrefs'
import { Button } from './ui'
import { useModalAnimation, backdropAnim, panelAnim } from './useModalAnimation'

export default function SampleLibraryModal({ sample, onLoad, onClose }) {
  const t = useT()
  const { entered, handleClose } = useModalAnimation(onClose)
  const [entries, setEntries] = useState([])
  const [nameInput, setNameInput] = useState(sample?.fileName?.replace(/\.[^.]+$/, '') ?? '')
  const [previewingId, setPreviewingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const sourceRef = useRef(null)
  const ctxRef = useRef(null)
  const activeIdRef = useRef(null)

  useEffect(() => {
    listLibrary().then(setEntries)
  }, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleClose])

  useEffect(() => () => {
    stopPreview()
    ctxRef.current?.close().catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function stopPreview() {
    activeIdRef.current = null
    try { sourceRef.current?.stop() } catch {}
    sourceRef.current = null
    setPreviewingId(null)
  }

  async function togglePreview(entry) {
    const wasPlaying = previewingId === entry.id
    stopPreview()
    if (wasPlaying) return

    activeIdRef.current = entry.id
    setPreviewingId(entry.id)
    let buf
    try { buf = await decodeBlob(entry.blob) } catch { setPreviewingId(null); return }
    if (activeIdRef.current !== entry.id) return

    const ctx = ctxRef.current || (ctxRef.current = new AudioContext())
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    src.start()
    src.onended = () => setPreviewingId(p => (p === entry.id ? null : p))
    sourceRef.current = src
  }

  async function handleSave() {
    if (!sample?.blob) return
    setSaving(true)
    try {
      await addToLibrary({
        name: nameInput.trim() || sample.fileName,
        fileName: sample.fileName,
        blob: sample.blob,
      })
      setEntries(await listLibrary())
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(entry) {
    if (previewingId === entry.id) stopPreview()
    await removeFromLibrary(entry.id)
    setEntries(e => e.filter(x => x.id !== entry.id))
  }

  async function handleLoad(entry) {
    await onLoad(entry.blob, entry.fileName)
    onClose()
  }

  function handleBrowse() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'audio/*,.wav,.mp3,.ogg'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      await addToLibrary({
        name: file.name.replace(/\.[^.]+$/, ''),
        fileName: file.name,
        blob: file,
      })
      setEntries(await listLibrary())
    }
    input.click()
  }

  return (
    <div
      className={`fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-6 ${backdropAnim(entered)}`}
      onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div className={`flex w-full max-w-lg flex-col gap-3 rounded-xl border border-edge bg-panel p-4 shadow-2xl ${panelAnim(entered)}`}>
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-semibold uppercase tracking-wider text-accent">
            {t('library.title')}
          </span>
          <span className="flex-1" />
          <button onClick={handleClose} title={t('common.close')} className="text-muted transition-colors hover:text-ink"><X size={14} /></button>
        </div>

        {sample && (
          <div className="flex items-center gap-2 rounded border border-divider bg-well px-2.5 py-2">
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder={sample.fileName}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); e.stopPropagation() }}
              className="flex-1 rounded border border-edge bg-surface px-2 py-1 text-[11px] text-ink outline-none focus:border-accent-deep/60"
            />
            <Button onClick={handleSave} disabled={saving} variant="primary">
              {saving ? t('library.saving') : t('library.saveCurrent')}
            </Button>
          </div>
        )}

        <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
          {entries.length === 0 ? (
            <div className="py-8 text-center text-[11px] text-muted">{t('library.empty')}</div>
          ) : (
            entries.map(entry => (
              <div
                key={entry.id}
                className="flex items-center gap-2 rounded border border-edge bg-surface/70 px-2.5 py-1.5"
              >
                <span
                  className="flex-1 truncate font-mono text-[11px] text-ink-soft"
                  title={entry.name !== entry.fileName ? `${entry.name} (${entry.fileName})` : entry.fileName}
                >
                  {entry.name}
                  {entry.name !== entry.fileName && (
                    <span className="ml-1 text-[10px] text-faint">{entry.fileName}</span>
                  )}
                </span>
                <button
                  onClick={() => togglePreview(entry)}
                  title={previewingId === entry.id ? t('library.stop') : t('library.preview')}
                  className={`flex w-5 shrink-0 items-center justify-center transition-colors ${
                    previewingId === entry.id ? 'text-accent-bright' : 'text-muted hover:text-ink'
                  }`}
                >
                  {previewingId === entry.id ? <Square size={12} /> : <Play size={12} />}
                </button>
                <button
                  onClick={() => handleLoad(entry)}
                  title={t('library.load')}
                  className="shrink-0 rounded border border-edge px-1.5 py-0.5 text-[10px] font-medium text-ink-soft transition-colors hover:border-accent-deep/50 hover:text-accent-bright"
                >
                  {t('library.loadShort')}
                </button>
                <button
                  onClick={() => handleDelete(entry)}
                  title={t('library.remove')}
                  className="shrink-0 text-muted transition-colors hover:text-danger"
                >
                  <X size={12} />
                </button>
              </div>
            ))
          )}
        </div>

        <Button onClick={handleBrowse}>{t('library.browseInto')}</Button>
      </div>
    </div>
  )
}
