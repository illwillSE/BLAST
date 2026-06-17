import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { STRINGS } from '../i18n/strings'

// User preferences — mode (Beginner/Advanced) and UI language. These are NOT
// project data: they never go through the undo reducer and are never serialized
// in the project ZIP/autosave. They live in localStorage only, the same pattern
// as the original help-language flag. `lang` reuses the existing 'blast-help-lang'
// key so the in-help-modal flag and the global UI language are one setting.
const MODE_KEY = 'blast-mode'
const LANG_KEY = 'blast-help-lang'
const BACKGROUND_VIZ_KEY = 'blast-background-viz'

const UIPrefsContext = createContext(null)

function readMode() {
  return localStorage.getItem(MODE_KEY) === 'advanced' ? 'advanced' : 'beginner'
}
function readLang() {
  return localStorage.getItem(LANG_KEY) === 'sv' ? 'sv' : 'en'
}
function readBackgroundViz() {
  return localStorage.getItem(BACKGROUND_VIZ_KEY) !== 'off'
}

export function UIPrefsProvider({ children }) {
  const [mode, setModeState] = useState(readMode)
  const [lang, setLangState] = useState(readLang)
  const [backgroundViz, setBackgroundVizState] = useState(readBackgroundViz)

  const setMode = (m) => {
    setModeState(m)
    try { localStorage.setItem(MODE_KEY, m) } catch {}
  }
  const setLang = (l) => {
    setLangState(l)
    try { localStorage.setItem(LANG_KEY, l) } catch {}
  }
  const setBackgroundViz = (on) => {
    setBackgroundVizState(on)
    try { localStorage.setItem(BACKGROUND_VIZ_KEY, on ? 'on' : 'off') } catch {}
  }

  // Keep the document language in sync so screen readers, spell-check and search
  // engines see the actual UI language (the static index.html only declares 'en').
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const value = useMemo(() => ({
    mode, setMode, lang, setLang, backgroundViz, setBackgroundViz,
  }), [mode, lang, backgroundViz])
  return <UIPrefsContext.Provider value={value}>{children}</UIPrefsContext.Provider>
}

export function useUIPrefs() {
  const ctx = useContext(UIPrefsContext)
  if (!ctx) throw new Error('useUIPrefs must be used within a UIPrefsProvider')
  return ctx
}

// Resolve a dot-path key against STRINGS for the active language, falling back
// to English when a Swedish string is missing, then to the key itself.
function resolve(lang, key) {
  const fromLang = lookup(STRINGS[lang], key)
  if (fromLang != null) return fromLang
  const fromEn = lookup(STRINGS.en, key)
  return fromEn != null ? fromEn : key
}

function lookup(tree, key) {
  let node = tree
  for (const part of key.split('.')) {
    if (node == null) return null
    node = node[part]
  }
  return typeof node === 'string' ? node : null
}

// `t(key)` resolver bound to the active language. Returns a stable function so
// it can be a dependency without re-running effects every render.
export function useT() {
  const { lang } = useUIPrefs()
  return useMemo(() => (key) => resolve(lang, key), [lang])
}
