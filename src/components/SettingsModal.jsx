import { useEffect, useState } from 'react'
import { SAMPLE_RATES, EXPORT_CHANNELS, EXPORT_FORMATS } from '../audio/render'
import { useUIPrefs, useT } from '../state/uiPrefs'
import { useModalAnimation, backdropAnim, panelAnim } from './useModalAnimation'
import { Button } from './ui'

// A labelled native <select>, matching the chain editor's select styling.
function SelectField({ label, value, onChange, children }) {
  return (
    <label className="block select-none">
      <div className="mb-0.5 text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <select
        value={value}
        onChange={onChange}
        className="w-full rounded border border-edge bg-surface px-1.5 py-1 font-mono text-[12px] text-ink outline-none focus:border-accent-deep/60"
      >
        {children}
      </select>
    </label>
  )
}

// Per-project settings, opened from the ⚙ button in the header. Tabbed so more
// project-level settings can slot in later. The Export tab holds the sample
// export options (sample rate / channels / format) that also drive
// "→ Sample sound" and copy-to-sample, so rendered audio matches.
export default function SettingsModal({ project, onRenameProject, onSetExport, onNewProject, onLoadPresets, onClose }) {
  const { mode, setMode, lang, setLang, backgroundViz, setBackgroundViz } = useUIPrefs()
  const t = useT()
  const [tab, setTab] = useState('general')
  const [confirmingNew, setConfirmingNew] = useState(false)
  const [confirmingPresets, setConfirmingPresets] = useState(false)
  const { entered, handleClose } = useModalAnimation(onClose)

  const TABS = [
    { id: 'general', label: t('settings.general') },
    { id: 'export', label: t('settings.export') },
  ]

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleClose])

  const ex = project.export

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 ${backdropAnim(entered)}`}
      onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div className={`flex max-h-[80vh] w-full max-w-md flex-col rounded-xl border border-edge bg-panel shadow-2xl ${panelAnim(entered)}`}>
        <div className="flex items-center gap-2 border-b border-divider px-4 py-3">
          <span className="flex-1 text-[13px] font-semibold uppercase tracking-wider text-ink">{t('settings.title')}</span>
          <button onClick={handleClose} title={t('common.close')} className="text-muted transition-colors hover:text-ink">✕</button>
        </div>

        <div className="flex gap-1 border-b border-divider px-3 pt-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-t px-3 py-1.5 text-[12px] font-medium transition-colors ${
                tab === t.id
                  ? 'border-b-2 border-accent-deep text-accent-bright'
                  : 'text-muted hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="space-y-3 overflow-y-auto px-4 py-4">
          {tab === 'general' && (
            <>
              <label className="block select-none">
                <div className="mb-0.5 text-[11px] uppercase tracking-wide text-muted">{t('settings.projectName')}</div>
                <input
                  value={project.name}
                  onChange={(e) => onRenameProject(e.target.value)}
                  spellCheck={false}
                  className="w-full rounded border border-edge bg-surface px-1.5 py-1 text-[13px] text-ink outline-none focus:border-accent-deep/60"
                />
              </label>

              <div>
                <div className="mb-0.5 text-[11px] uppercase tracking-wide text-muted">{t('settings.mode')}</div>
                <div className="flex items-center gap-px rounded-md border border-edge bg-surface p-0.5">
                  {[['beginner', t('settings.beginner')], ['advanced', t('settings.advanced')]].map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => setMode(id)}
                      className={`flex-1 rounded px-2 py-1 text-[12px] font-semibold transition-colors ${
                        mode === id ? 'bg-accent-deep/20 text-accent-bright' : 'text-faint hover:text-text'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[10px] leading-relaxed text-faint">{t('settings.modeHint')}</p>
              </div>

              <div>
                <div className="mb-0.5 text-[11px] uppercase tracking-wide text-muted">{t('settings.language')}</div>
                <div className="flex items-center gap-px rounded-md border border-edge bg-surface p-0.5">
                  {[['en', '🇬🇧 English'], ['sv', '🇸🇪 Svenska']].map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => setLang(id)}
                      className={`flex-1 rounded px-2 py-1 text-[12px] font-semibold transition-colors ${
                        lang === id ? 'bg-accent-deep/20 text-accent-bright' : 'text-faint hover:text-text'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-0.5 text-[11px] uppercase tracking-wide text-muted">{t('settings.backgroundViz')}</div>
                <button
                  onClick={() => setBackgroundViz(!backgroundViz)}
                  className={`w-full rounded border px-2 py-1 text-left text-[12px] font-semibold transition-colors ${
                    backgroundViz
                      ? 'border-accent-deep/50 bg-accent-deep/15 text-accent-bright'
                      : 'border-edge bg-surface text-faint hover:text-text'
                  }`}
                >
                  {backgroundViz ? t('settings.backgroundVizOn') : t('settings.backgroundVizOff')}
                </button>
                <p className="mt-1 text-[10px] leading-relaxed text-faint">{t('settings.backgroundVizHint')}</p>
              </div>

              <div className="flex gap-1.5 border-t border-divider pt-3">
                {!confirmingNew ? (
                  <Button onClick={() => setConfirmingNew(true)}>{t('settings.newProject')}</Button>
                ) : (
                  <div className="flex-1 space-y-2 rounded border border-danger/60 bg-danger/10 p-2.5">
                    <p className="text-[12px] leading-relaxed text-ink">
                      {t('settings.newProjectConfirm')}
                    </p>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => { setConfirmingNew(false); onNewProject(); handleClose() }}
                        className="rounded border border-danger bg-danger px-2 py-0.5 text-[12px] text-white transition-colors"
                      >
                        {t('settings.startNewProject')}
                      </button>
                      <Button onClick={() => setConfirmingNew(false)}>{t('common.cancel')}</Button>
                    </div>
                  </div>
                )}
                {!confirmingPresets ? (
                  <Button onClick={() => setConfirmingPresets(true)}>{t('settings.loadPresets')}</Button>
                ) : (
                  <div className="flex-1 space-y-2 rounded border border-danger/60 bg-danger/10 p-2.5">
                    <p className="text-[12px] leading-relaxed text-ink">
                      {t('settings.loadPresetsConfirm')}
                    </p>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => { setConfirmingPresets(false); onLoadPresets(); handleClose() }}
                        className="rounded border border-danger bg-danger px-2 py-0.5 text-[12px] text-white transition-colors"
                      >
                        {t('settings.loadPresetsConfirmBtn')}
                      </button>
                      <Button onClick={() => setConfirmingPresets(false)}>{t('common.cancel')}</Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {tab === 'export' && (
            <>
              <SelectField label={t('settings.sampleRate')} value={ex.sampleRate} onChange={(e) => onSetExport({ sampleRate: Number(e.target.value) })}>
                {SAMPLE_RATES.map((r) => <option key={r} value={r}>{r / 1000} kHz</option>)}
              </SelectField>
              <SelectField label={t('settings.channels')} value={ex.channels} onChange={(e) => onSetExport({ channels: Number(e.target.value) })}>
                {EXPORT_CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </SelectField>
              <SelectField label={t('settings.format')} value={ex.format} onChange={(e) => onSetExport({ format: e.target.value })}>
                {EXPORT_FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </SelectField>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
