import { useEffect, useState } from 'react'
import { useUIPrefs } from '../state/uiPrefs'
import { STRINGS } from '../i18n/strings'
import { Button } from './ui'

const SEEN_KEY = 'blast-intro-seen'

// Light, dismissible first-run intro. Shown once (gated by localStorage), then
// never again. Not project data — purely a one-time UI nudge. Steps come from
// the i18n table so they translate with the rest of the chrome.
export default function IntroModal() {
  const { lang } = useUIPrefs()
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(SEEN_KEY) !== '1' } catch { return false }
  })
  const [step, setStep] = useState(0)

  const intro = (STRINGS[lang] ?? STRINGS.en).intro
  const steps = intro.steps
  const last = step >= steps.length - 1

  function dismiss() {
    try { localStorage.setItem(SEEN_KEY, '1') } catch {}
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') dismiss() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null
  const cur = steps[step]

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-6"
      onMouseDown={(e) => { if (e.target === e.currentTarget) dismiss() }}
    >
      <div className="flex w-full max-w-sm flex-col rounded-xl border border-edge bg-panel shadow-2xl">
        <div className="flex items-center gap-2 border-b border-divider px-4 py-3">
          <span className="flex-1 text-[13px] font-semibold uppercase tracking-wider text-accent">{intro.title}</span>
          <button onClick={dismiss} className="text-[11px] text-muted transition-colors hover:text-ink">{intro.skip}</button>
        </div>

        <div className="px-4 py-4">
          <div className="text-[13px] font-semibold text-ink">{cur.title}</div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{cur.body}</p>
        </div>

        <div className="flex items-center gap-2 border-t border-divider px-4 py-3">
          <div className="flex flex-1 gap-1.5">
            {steps.map((_, i) => (
              <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === step ? 'bg-accent' : 'bg-edge-2'}`} />
            ))}
          </div>
          {step > 0 && <Button onClick={() => setStep((s) => s - 1)}>{intro.back}</Button>}
          {last ? (
            <Button variant="primary" onClick={dismiss}>{intro.done}</Button>
          ) : (
            <Button variant="primary" onClick={() => setStep((s) => s + 1)}>{intro.next}</Button>
          )}
        </div>
      </div>
    </div>
  )
}
