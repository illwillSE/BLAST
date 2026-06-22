import type { Project } from '../types'

// Bilingual text (Swedish optional — falls back to English).
export interface LangText {
  en: string
  sv?: string
}

// Per-chapter context resolved by `makeCtx` and threaded through `validate` /
// `onEnter` / `onExit`. Open-ended (chapters add their own keys) but the common
// handles are named.
export interface TutorialCtx {
  soundId?: string
  laneId?: string
  blockId?: string
  selectId?: string
  [key: string]: unknown
}

export interface TutorialStep {
  id: string
  kind: 'do' | 'read'
  target: string | null // a `data-tut="…"` selector, or null for a centered card
  placement?: 'top' | 'bottom' | 'left' | 'right'
  text: LangText
  nudge?: LangText
  // A gated `read` step keeps Next disabled until validate passes.
  requireValidate?: boolean
  // Advances a `do` step when the live model reaches the goal.
  validate?: (project: Project, stepStartProject: Project, ctx: TutorialCtx) => boolean
}

export interface TutorialChapter {
  id: string
  title: LangText
  description?: LangText
  stub?: boolean // titled placeholder reserved for a future build
  sandbox?: 'demo'
  buildDemo?: () => Project
  makeCtx?: (project: Project) => TutorialCtx
  onEnter?: (project: Project, ctx: TutorialCtx) => void
  onExit?: (ctx: TutorialCtx) => void
  steps?: TutorialStep[]
}
