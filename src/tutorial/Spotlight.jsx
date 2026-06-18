import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useUIPrefs } from '../state/uiPrefs'
import { STRINGS } from '../i18n/strings'

const PAD = 6 // px of breathing room around the cut-out

// Spotlight overlay: dims the screen, cuts a highlight out around the current
// step's target (a giant box-shadow on the cut-out rect — no SVG mask needed),
// and shows an anchored tooltip. A `null` target shows a centered card over a
// full dim (orientation / recap). The target may not exist yet (e.g. a block's
// control panel only renders once selected), so we poll for it; once found, a
// ResizeObserver + scroll/resize listeners keep the cut-out aligned — the same
// getBoundingClientRect pattern the inspector uses. Dev-time console.warn if a
// target never resolves, per the authoring spec.
export default function Spotlight({ step, stepIndex, totalSteps, canBack, canAdvance = true, onNext, onBack, onSkip }) {
  const { lang } = useUIPrefs()
  const [rect, setRect] = useState(null)
  const warnedRef = useRef(false)
  const startRef = useRef(0)
  // Measured tooltip size, so we can keep it inside the viewport on both axes —
  // the inspector dock resizes when a panel's content changes (e.g. swapping the
  // source type), which moves anchored targets and could push the tooltip (and
  // its Next button) off-screen.
  const tipRef = useRef(null)
  const [tipSize, setTipSize] = useState(null)

  useEffect(() => { startRef.current = Date.now(); warnedRef.current = false }, [step])

  useEffect(() => {
    if (!step?.target) { setRect(null); return }
    let ro
    const update = () => {
      const el = document.querySelector(step.target)
      if (el) {
        const r = el.getBoundingClientRect()
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
        if (!ro) { ro = new ResizeObserver(update); ro.observe(el) }
      } else {
        setRect(null)
        if (!warnedRef.current && Date.now() - startRef.current > 4000) {
          warnedRef.current = true
          console.warn(`[tutorial] step "${step.id}" target "${step.target}" not found`)
        }
      }
    }
    update()
    const poll = setInterval(update, 300)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      clearInterval(poll)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      if (ro) ro.disconnect()
    }
  }, [step])

  // Track the tooltip's own size so positioning can clamp it into the viewport.
  useLayoutEffect(() => {
    if (!tipRef.current) return
    const ro = new ResizeObserver(() => {
      const r = tipRef.current?.getBoundingClientRect()
      if (r) setTipSize({ w: r.width, h: r.height })
    })
    ro.observe(tipRef.current)
    return () => ro.disconnect()
  }, [step])

  if (!step) return null
  const tut = (STRINGS[lang] ?? STRINGS.en).tutorial
  const text = step.text[lang] ?? step.text.en
  const last = stepIndex >= totalSteps - 1

  const cutout = rect
    ? {
        position: 'fixed', top: rect.top - PAD, left: rect.left - PAD,
        width: rect.width + PAD * 2, height: rect.height + PAD * 2,
        borderRadius: 10, boxShadow: '0 0 0 9999px rgba(0,0,0,0.65)',
        border: '2px solid rgba(245,200,80,0.9)', pointerEvents: 'none', zIndex: 70,
        transition: 'top 120ms ease, left 120ms ease, width 120ms ease, height 120ms ease',
      }
    : { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', pointerEvents: 'none', zIndex: 70 }

  // Anchor the tooltip near the cut-out per `placement`, then clamp the whole
  // card into the viewport using its measured size on both axes — so a resize
  // that moves the target (e.g. the inspector dock growing/shrinking on a source
  // swap) can't push the card, or its Next button, off-screen.
  // Tooltip sits above modals (e.g. the sequencer, z-80) so its instructions and
  // Next stay visible while the learner works in a modal; the dim/cut-out (z-70)
  // stays behind the modal so the modal itself reads bright.
  let tip = { position: 'fixed', zIndex: 90, maxWidth: 320 }
  if (rect) {
    const place = step.placement ?? 'bottom'
    const w = tipSize?.w ?? 320
    const h = tipSize?.h ?? 0
    let top, left
    if (place === 'right') { top = rect.top; left = rect.left + rect.width + PAD * 2 + 8 }
    else if (place === 'left') { top = rect.top; left = rect.left - PAD * 2 - 8 - w }
    else if (place === 'top') { top = rect.top - PAD - 8 - h; left = rect.left }
    else { top = rect.top + rect.height + PAD * 2 + 8; left = rect.left }
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8))
    top = Math.max(8, Math.min(top, window.innerHeight - h - 8))
    tip = { ...tip, top, left }
  } else {
    tip = { ...tip, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  }

  // A gated `read` step whose goal isn't met yet shows its nudge until Next unlocks.
  const gated = step.kind === 'read' && step.requireValidate && !canAdvance
  const hint = step.kind === 'do'
    ? (!rect && step.nudge ? (step.nudge[lang] ?? step.nudge.en) : tut.doHint)
    : gated
      ? (step.nudge ? (step.nudge[lang] ?? step.nudge.en) : tut.doHint)
      : null

  return (
    <>
      <div style={cutout} />
      <div ref={tipRef} style={tip} className="flex flex-col rounded-xl border border-edge bg-panel shadow-2xl">
        <div className="flex items-center gap-2 border-b border-divider px-4 py-2.5">
          <span className="flex-1 text-[11px] font-semibold uppercase tracking-wider text-accent">
            {tut.step} {stepIndex + 1}/{totalSteps}
          </span>
          <button onClick={onSkip} className="text-[11px] text-muted transition-colors hover:text-ink">{tut.skip}</button>
        </div>
        <div className="px-4 py-4">
          <p className="text-[12px] leading-relaxed text-ink-soft">{text}</p>
          {hint && <p className="mt-2 text-[11px] italic text-muted">{hint}</p>}
        </div>
        <div className="flex items-center gap-2 border-t border-divider px-4 py-3">
          <div className="flex-1" />
          {canBack && step.kind === 'read' && (
            <button onClick={onBack} className="rounded border border-edge px-2.5 py-1 text-[11px] text-text transition-colors hover:border-edge-hover">
              {tut.back}
            </button>
          )}
          {step.kind === 'read' && (
            <button
              onClick={onNext}
              disabled={!canAdvance}
              className={`rounded border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                canAdvance
                  ? 'border-accent-deep/60 bg-accent-deep/15 text-accent-bright hover:bg-accent-deep/30'
                  : 'cursor-not-allowed border-edge bg-transparent text-muted opacity-50'
              }`}
            >
              {last ? tut.finish : tut.next}
            </button>
          )}
        </div>
      </div>
    </>
  )
}
