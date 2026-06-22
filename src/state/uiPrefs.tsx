import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { STRINGS } from '../i18n/strings'
import type { StringTree } from '../i18n/strings'

// User preferences — mode (Beginner/Advanced) and UI language. These are NOT
// project data: they never go through the undo reducer and are never serialized
// in the project ZIP/autosave. They live in localStorage only, the same pattern
// as the original help-language flag. `lang` reuses the existing 'blast-help-lang'
// key so the in-help-modal flag and the global UI language are one setting.
const MODE_KEY = 'blast-mode'
const LANG_KEY = 'blast-help-lang'
const BACKGROUND_VIZ_KEY = 'blast-background-viz'

export type Mode = 'beginner' | 'advanced'
export type Lang = 'en' | 'sv'

export interface UIPrefs {
  mode: Mode
  setMode: (m: Mode) => void
  lang: Lang
  setLang: (l: Lang) => void
  backgroundViz: boolean
  setBackgroundViz: (on: boolean) => void
}

const UIPrefsContext = createContext<UIPrefs | null>(null)

function readMode(): Mode {
  return localStorage.getItem(MODE_KEY) === 'advanced' ? 'advanced' : 'beginner'
}
function readLang(): Lang {
  return localStorage.getItem(LANG_KEY) === 'sv' ? 'sv' : 'en'
}
function readBackgroundViz(): boolean {
  return localStorage.getItem(BACKGROUND_VIZ_KEY) !== 'off'
}

export function UIPrefsProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState(readMode)
  const [lang, setLangState] = useState(readLang)
  const [backgroundViz, setBackgroundVizState] = useState(readBackgroundViz)

  const setMode = (m: Mode) => {
    setModeState(m)
    try { localStorage.setItem(MODE_KEY, m) } catch { /* storage full / disabled */ }
  }
  const setLang = (l: Lang) => {
    setLangState(l)
    try { localStorage.setItem(LANG_KEY, l) } catch { /* storage full / disabled */ }
  }
  const setBackgroundViz = (on: boolean) => {
    setBackgroundVizState(on)
    try { localStorage.setItem(BACKGROUND_VIZ_KEY, on ? 'on' : 'off') } catch { /* storage full / disabled */ }
  }

  // Keep the document language in sync so screen readers, spell-check and search
  // engines see the actual UI language (the static index.html only declares 'en').
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const value = useMemo<UIPrefs>(() => ({
    mode, setMode, lang, setLang, backgroundViz, setBackgroundViz,
  }), [mode, lang, backgroundViz])
  return <UIPrefsContext.Provider value={value}>{children}</UIPrefsContext.Provider>
}

export function useUIPrefs(): UIPrefs {
  const ctx = useContext(UIPrefsContext)
  if (!ctx) throw new Error('useUIPrefs must be used within a UIPrefsProvider')
  return ctx
}

// Resolve a dot-path key against STRINGS for the active language, falling back
// to English when a Swedish string is missing, then to the key itself.
function resolve(lang: Lang, key: string): string {
  const fromLang = lookup(STRINGS[lang], key)
  if (fromLang != null) return fromLang
  const fromEn = lookup(STRINGS.en, key)
  return fromEn != null ? fromEn : key
}

function lookup(tree: StringTree, key: string): string | null {
  let node: string | StringTree | (string | StringTree)[] | undefined = tree
  for (const part of key.split('.')) {
    if (node == null || typeof node === 'string' || Array.isArray(node)) return null
    node = node[part]
  }
  return typeof node === 'string' ? node : null
}

// `t(key)` resolver bound to the active language. Returns a stable function so
// it can be a dependency without re-running effects every render.
export function useT(): (key: string) => string {
  const { lang } = useUIPrefs()
  return useMemo(() => (key: string) => resolve(lang, key), [lang])
}
