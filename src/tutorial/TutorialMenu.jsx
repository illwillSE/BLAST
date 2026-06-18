import { Check, CircleDot } from 'lucide-react'
import { useUIPrefs } from '../state/uiPrefs'
import { STRINGS } from '../i18n/strings'
import { Button } from '../components/ui'
import { useModalAnimation, backdropAnim, panelAnim } from '../components/useModalAnimation'

// Course screen: lists every chapter with a done/in-progress badge, a Resume
// shortcut when progress exists, and per-chapter Start/Replay/Continue. Stub
// chapters render as disabled, titled placeholders. Mirrors the IntroModal /
// SettingsModal chrome.
export default function TutorialMenu({ tutorial, onClose }) {
  const { lang } = useUIPrefs()
  const tut = (STRINGS[lang] ?? STRINGS.en).tutorial
  const { entered, handleClose } = useModalAnimation(onClose)

  return (
    <div
      className={`fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-6 ${backdropAnim(entered)}`}
      onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div className={`flex w-full max-w-md flex-col rounded-xl border border-edge bg-panel shadow-2xl ${panelAnim(entered)}`}>
        <div className="flex items-center gap-2 border-b border-divider px-4 py-3">
          <span className="flex-1 text-[13px] font-semibold uppercase tracking-wider text-accent">{tut.menuTitle}</span>
          <button onClick={handleClose} className="text-[11px] text-muted transition-colors hover:text-ink">{tut.close}</button>
        </div>

        {tutorial.resumeAvailable && (
          <div className="border-b border-divider px-4 py-3">
            <Button variant="primary" onClick={tutorial.resume}>{tut.resume}</Button>
          </div>
        )}

        <div className="flex flex-col gap-1 px-2 py-2">
          {tutorial.chapters.map((c) => {
            const title = c.title[lang] ?? c.title.en
            const desc = c.description ? (c.description[lang] ?? c.description.en) : null
            return (
              <div key={c.id} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${c.stub ? 'opacity-50' : 'hover:bg-surface'}`}>
                <span className="shrink-0">
                  {c.completed
                    ? <Check size={16} className="text-on-bright" />
                    : c.isCurrent
                      ? <CircleDot size={16} className="text-accent-bright" />
                      : <span className="block h-4 w-4 rounded-full border border-edge-2" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-semibold text-ink">{title}</div>
                  {desc && <div className="truncate text-[10px] text-muted">{desc}</div>}
                  {c.stub && <div className="text-[10px] text-faint">{tut.comingSoon}</div>}
                </div>
                {!c.stub && (
                  <Button onClick={() => tutorial.startChapter(c.id)}>
                    {c.completed ? tut.replay : c.isCurrent ? tut.continue : tut.start}
                  </Button>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-end border-t border-divider px-4 py-3">
          <button onClick={tutorial.restartAll} className="text-[11px] text-muted transition-colors hover:text-danger-bright">
            {tut.restartAll}
          </button>
        </div>
      </div>
    </div>
  )
}
