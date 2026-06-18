import { Fragment, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import WaveSurfer from 'wavesurfer.js'
import { onPlay } from '../utils/bus'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'
import ZoomPlugin from 'wavesurfer.js/dist/plugins/zoom.esm.js'
import { reverseBuffer, normalizeBuffer, fadeBuffer } from '../audio/bufferOps'
import { Button } from './ui'
import { useUIPrefs, useT } from '../state/uiPrefs'
import { useModalAnimation, backdropAnim, panelAnim } from './useModalAnimation'
import { getColor } from '../theme/colors'

function ToolButton({ children, onClick, disabled, title }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="rounded border border-edge bg-surface px-2 py-1 text-[11px] font-medium text-ink-soft transition-colors hover:border-edge-hover hover:text-ink disabled:cursor-default disabled:opacity-30"
    >
      {children}
    </button>
  )
}

function TimeField({ label, value, onCommit }) {
  const [draft, setDraft] = useState(value.toFixed(3))
  useEffect(() => setDraft(value.toFixed(3)), [value])

  function commit() {
    const parsed = parseFloat(draft.replace(',', '.'))
    if (!Number.isNaN(parsed)) onCommit(parsed)
    else setDraft(value.toFixed(3))
  }

  return (
    <label className="flex items-center gap-1.5">
      <span className="text-[11px] uppercase tracking-wide text-muted">{label}</span>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setDraft(value.toFixed(3))
          e.stopPropagation() // keep Esc-in-field from closing the modal
        }}
        className="w-20 rounded border border-edge bg-well px-1.5 py-0.5 font-mono text-[12px] text-ink outline-none focus:border-accent-deep/60"
      />
      <span className="text-[10px] text-faint">s</span>
    </label>
  )
}

const HELP_ITEMS = {
  en: [
    { label: 'Zoom', text: 'Mouse wheel zooms the waveform. Scroll left/right when zoomed in.' },
    { label: 'Trim', text: "Drag the highlighted region's edges to set in/out points. Only the trimmed part plays." },
    { label: 'In / Out', text: 'Type exact times in the fields for precise cuts. Enter or blur to apply.' },
    { label: 'Play region', text: 'Auditions only the trimmed slice — lets you check your edit before committing.' },
    { label: 'Reverse', text: 'Flips the sample backwards. Destructive — use Undo to revert.' },
    { label: 'Normalize', text: 'Boosts the peak to full volume. Destructive — use Undo to revert.' },
    { label: 'Fade in / out', text: 'Applies a linear fade over the full sample start or end. Destructive.' },
    { label: '✂ Crop', text: 'Permanently trims the file to the current region — active only when a region is set. Destructive.' },
  ],
  sv: [
    { label: 'Zoom', text: 'Mushjulet zoomar vågformen. Scrolla vänster/höger när du zoomat in.' },
    { label: 'Trim', text: 'Dra i regionens kanter för att sätta in/ut-punkter. Bara den trimmade delen spelas.' },
    { label: 'In / Out', text: 'Skriv exakta tider i fälten för precisa klipp. Enter eller klick utanför för att bekräfta.' },
    { label: 'Play region', text: 'Spelar upp bara den trimmade biten — låter dig kontrollera klippet innan du sparar.' },
    { label: 'Reverse', text: 'Vänder samplet bakåt. Destruktiv — använd Ångra för att återgå.' },
    { label: 'Normalize', text: 'Höjer toppnivån till full volym. Destruktiv — använd Ångra för att återgå.' },
    { label: 'Fade in / out', text: 'Lägger på en linjär fade i början eller slutet av samplet. Destruktiv.' },
    { label: '✂ Crop', text: 'Klipper permanent samplet till den markerade regionen — aktiv bara när en region är satt. Destruktiv.' },
  ],
}

// Full-screen sample editor: zoomable waveform (mouse wheel), draggable
// trim region with exact in/out fields, edit tools, region audition.
export default function SampleEditorModal({
  block, sample, soundId, onParam, onApplyEdit, onCrop, onUndo, canUndo, onClose,
}) {
  const containerRef = useRef(null)
  const wsRef = useRef(null)
  const regionRef = useRef(null)
  const animRef = useRef(null)
  const { lang, setLang } = useUIPrefs()
  const t = useT()
  const [playing, setPlaying] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const { entered, handleClose } = useModalAnimation(onClose)

  function toggleLang() {
    setLang(lang === 'en' ? 'sv' : 'en')
  }
  const paramsRef = useRef(block.params)
  paramsRef.current = block.params

  const full = sample.audioBuffer.duration
  const trimStart = Math.max(0, block.params.trimStart ?? 0)
  const trimEnd = Math.min(full, block.params.trimEnd ?? full)
  const trimmed = block.params.trimStart != null || block.params.trimEnd != null

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleClose])

  useEffect(() => {
    if (!containerRef.current) return
    const ws = WaveSurfer.create({
      container: containerRef.current,
      height: 200,
      waveColor: getColor('accent-deep', '88'),
      progressColor: getColor('accent'),
      cursorColor: getColor('cursor'),
      cursorWidth: 1,
      interact: false,
      normalize: true,
      autoScroll: true,
      autoCenter: true,
    })
    ws.registerPlugin(ZoomPlugin.create({ scale: 0.35, maxZoom: 2000 }))
    const regions = ws.registerPlugin(RegionsPlugin.create())

    ws.on('decode', (duration) => {
      const p = paramsRef.current
      const start = Math.min(Math.max(0, p.trimStart ?? 0), duration)
      const end = Math.min(p.trimEnd ?? duration, duration)
      const region = regions.addRegion({
        start,
        end: end > start ? end : duration,
        color: getColor('accent-deep', '24'), // amber wash ≈ rgba(…,0.14)
        drag: true,
        resize: true,
      })
      region.on('update-end', () => {
        const atFull = region.start < 0.005 && region.end > duration - 0.005
        onParam('trimStart', atFull ? null : region.start)
        onParam('trimEnd', atFull ? null : region.end)
      })
      regionRef.current = region
    })

    // Stop audition when playback leaves the region.
    ws.on('timeupdate', (t) => {
      const region = regionRef.current
      if (region && ws.isPlaying() && t >= region.end) {
        ws.pause()
        ws.setTime(region.start)
      }
    })
    ws.on('pause', () => setPlaying(false))
    ws.on('play', () => setPlaying(true))

    ws.loadBlob(sample.blob)
    wsRef.current = ws
    return () => {
      ws.destroy()
      wsRef.current = null
      regionRef.current = null
    }
  }, [sample]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => onPlay(({ soundId: playedId }) => {
    const ws = wsRef.current
    if (playedId !== soundId || !ws || !sample?.audioBuffer) return
    cancelAnimationFrame(animRef.current)
    if (ws.isPlaying()) ws.pause()
    const p = paramsRef.current
    const full = sample.audioBuffer.duration
    const trimStart = Math.max(0, p.trimStart ?? 0)
    const trimEnd = Math.min(full, p.trimEnd ?? full)
    // A looping grain cloud has no single sweep — leave the cursor put.
    if (p.mode === 'granular' && p.loop) return
    // Granular speed is decoupled from pitch; normal mode is pitch-as-varispeed.
    const rate = p.mode === 'granular' ? Math.max(0.1, p.speed || 1) : Math.pow(2, (p.pitch ?? 0) / 12)
    const dur = Math.max(0.01, (trimEnd - trimStart) / Math.max(0.05, rate))
    const t0 = performance.now()
    const step = (now) => {
      const t = (now - t0) / 1000 / dur
      if (t >= 1 || !wsRef.current) return
      wsRef.current.setTime(trimStart + t * (trimEnd - trimStart))
      animRef.current = requestAnimationFrame(step)
    }
    animRef.current = requestAnimationFrame(step)
  }), [soundId, sample]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => cancelAnimationFrame(animRef.current), [])

  function setTrim(start, end) {
    const s = Math.max(0, Math.min(start, full))
    const e = Math.max(s + 0.002, Math.min(end, full))
    regionRef.current?.setOptions({ start: s, end: e })
    const atFull = s < 0.005 && e > full - 0.005
    onParam('trimStart', atFull ? null : s)
    onParam('trimEnd', atFull ? null : e)
  }

  function audition() {
    const ws = wsRef.current
    if (!ws) return
    if (ws.isPlaying()) {
      ws.pause()
      return
    }
    ws.setTime(regionRef.current?.start ?? 0)
    ws.play()
  }

  return (
    <div
      className={`fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-6 ${backdropAnim(entered)}`}
      onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div className={`flex w-full max-w-5xl flex-col gap-3 rounded-xl border border-edge bg-panel p-4 shadow-2xl ${panelAnim(entered)}`}>
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-semibold uppercase tracking-wider text-accent">
            {t('sample.editorTitle')}
          </span>
          <span className="flex-1 truncate font-mono text-[11px] text-muted">
            {sample.fileName} · {full.toFixed(2)}s
          </span>
          <button
            onClick={() => setHelpOpen((v) => !v)}
            title={helpOpen ? t('sample.hideHelp') : t('sample.showHelp')}
            className={`rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors ${helpOpen ? 'bg-accent-deep/20 text-accent-bright' : 'text-muted hover:text-ink'}`}
          >
            ?
          </button>
          <button
            onClick={handleClose}
            title={t('common.close')}
            className="text-muted transition-colors hover:text-ink"
          >
            <X size={14} />
          </button>
        </div>

        {helpOpen && (
          <div className="rounded border border-divider bg-well px-3 py-2.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-faint">
                {t('sample.howToUse')}
              </span>
              <button
                onClick={toggleLang}
                title={lang === 'en' ? t('help.toSwedish') : t('help.toEnglish')}
                className="rounded px-1 text-[15px] leading-none transition-transform hover:scale-110"
              >
                {lang === 'en' ? '🇸🇪' : '🇬🇧'}
              </button>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
              {HELP_ITEMS[lang].map(({ label, text }) => (
                <Fragment key={label}>
                  <dt className="whitespace-nowrap text-[11px] font-semibold text-ink-soft">{label}</dt>
                  <dd className="text-[11px] text-muted">{text}</dd>
                </Fragment>
              ))}
            </dl>
          </div>
        )}

        <div ref={containerRef} data-tut="sample-editor-region" className="rounded border border-divider bg-well" />
        <div className="text-[10px] text-faint">
          {t('sample.zoomHint')}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <Button onClick={audition} variant="primary">
            {playing ? t('sample.stop') : t('sample.playRegion')}
          </Button>
          <TimeField label={t('sample.in')} value={trimStart} onCommit={(v) => setTrim(v, trimEnd)} />
          <TimeField label={t('sample.out')} value={trimEnd} onCommit={(v) => setTrim(trimStart, v)} />
          <div data-tut="sample-tools" className="ml-auto flex flex-wrap gap-1.5">
            <ToolButton onClick={onUndo} disabled={!canUndo} title={t('sample.undoTitle')}>{t('sample.undo')}</ToolButton>
            <ToolButton onClick={() => onApplyEdit(reverseBuffer)} title={t('sample.reverseTitle')}>{t('sample.reverse')}</ToolButton>
            <ToolButton onClick={() => onApplyEdit(normalizeBuffer)} title={t('sample.normalizeTitle')}>{t('sample.normalize')}</ToolButton>
            <ToolButton onClick={() => onApplyEdit((b) => fadeBuffer(b, 'in'))} title={t('sample.fadeInTitle')}>{t('sample.fadeIn')}</ToolButton>
            <ToolButton onClick={() => onApplyEdit((b) => fadeBuffer(b, 'out'))} title={t('sample.fadeOutTitle')}>{t('sample.fadeOut')}</ToolButton>
            <ToolButton onClick={onCrop} disabled={!trimmed} title={t('sample.cropTitle')}>
              {t('sample.crop')}
            </ToolButton>
          </div>
        </div>
      </div>
    </div>
  )
}
