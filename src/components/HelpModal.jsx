import { useEffect } from 'react'
import { X } from 'lucide-react'
import { useUIPrefs } from '../state/uiPrefs'
import { useModalAnimation, backdropAnim, panelAnim } from './useModalAnimation'

// Shared chrome for the (i) help dialogs — backdrop, card, a header with an
// optional category dot, the title, the English/Swedish flag toggle, and close
// (also closes on Esc / backdrop click). The flag flips the shared UI language
// so the body re-renders in the chosen language, like the rest of the app.
// Body content is passed as children.
export default function HelpModal({ dot, title, titleClass, onClose, children }) {
  const { lang, setLang } = useUIPrefs()
  const { entered, handleClose } = useModalAnimation(onClose)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleClose])

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 ${backdropAnim(entered)}`}
      onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div className={`flex max-h-[80vh] w-full max-w-md flex-col rounded-xl border border-edge bg-panel shadow-2xl ${panelAnim(entered)}`}>
        <div className="flex items-center gap-2 border-b border-divider px-4 py-3">
          {dot && <span className={`h-2 w-2 rounded-full ${dot}`} />}
          <span className={`flex-1 text-[13px] font-semibold uppercase tracking-wider ${titleClass}`}>
            {title}
          </span>
          <button
            onClick={() => setLang(lang === 'en' ? 'sv' : 'en')}
            title={lang === 'en' ? 'Visa på svenska' : 'Show in English'}
            className="rounded px-1 text-[15px] leading-none transition-transform hover:scale-110"
          >
            {lang === 'en' ? '🇸🇪' : '🇬🇧'}
          </button>
          <button
            onClick={handleClose}
            title={lang === 'en' ? 'Close (Esc)' : 'Stäng (Esc)'}
            className="text-muted transition-colors hover:text-ink"
          >
            <X size={14} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
