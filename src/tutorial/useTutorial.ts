import { useEffect, useRef, useState } from 'react'
import { CHAPTERS, getChapter } from './chapters'
import { getProgress, setCurrent, markCompleted, resetProgress } from './progress'
import type { Project } from '../types'
import type { TutorialCtx } from './types'

interface ActiveState {
  chapterId: string
  stepIndex: number
  ctx: TutorialCtx
  stepStartProject: Project
}

interface UseTutorialArgs {
  project: Project
  reset: (project: Project) => void
  setSelectedId: (id: string) => void
}

// Tutorial engine. Owns which chapter/step is active, drives the per-chapter
// sandbox swap, and auto-advances `do` steps by watching the real project
// state (never by trusting a click). `read` steps advance via Next only.
//
// `project`/`reset`/`setSelectedId` are the same handles App.jsx already uses
// for load/new-project — a demo sandbox is just reset() under the hood, with
// the live project stashed and restored on exit.
export function useTutorial({ project, reset, setSelectedId }: UseTutorialArgs) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [active, setActive] = useState<ActiveState | null>(null)
  // Latch for gated `read` steps: once the goal is met Next stays unlocked, so
  // an A/B action that returns to the original state (e.g. bypass then re-enable)
  // doesn't re-lock the button. Reset whenever the active step changes.
  const [unlocked, setUnlocked] = useState(false)
  const stash = useRef<{ project: Project; selectedId: string | undefined } | null>(null) // while a demo sandbox is live

  // Latest project, so non-reactive callbacks read fresh state.
  const projectRef = useRef(project)
  projectRef.current = project

  // Auto-advance `do` steps: whenever the live project changes, re-check the
  // current step's validate against the snapshot taken when the step began.
  useEffect(() => {
    if (!active) return
    const step = getChapter(active.chapterId)?.steps?.[active.stepIndex]
    if (!step || step.kind !== 'do' || !step.validate) return
    if (step.validate(project, active.stepStartProject, active.ctx)) advance()
  }, [project]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset the gated-step latch whenever the active step changes.
  useEffect(() => { setUnlocked(false) }, [active?.chapterId, active?.stepIndex])

  function startChapter(chapterId: string, { resumeStep }: { resumeStep?: number } = {}) {
    const chapter = getChapter(chapterId)
    if (!chapter || chapter.stub) return
    setMenuOpen(false)
    const stepIndex = resumeStep ?? 0

    if (chapter.sandbox === 'demo') {
      stash.current = { project: projectRef.current, selectedId: projectRef.current.sounds[0]?.id }
      const demo = chapter.buildDemo!()
      const ctx = chapter.makeCtx?.(demo) ?? {}
      reset(demo)
      if (ctx.soundId) setSelectedId(ctx.soundId)
      // Optional side-effects outside the serializable project (e.g. loading a
      // demo sample into the cache). onExit cleans them up on teardown.
      chapter.onEnter?.(demo, ctx)
      setActive({ chapterId, stepIndex, ctx, stepStartProject: demo })
    } else {
      stash.current = null
      const ctx = chapter.makeCtx ? chapter.makeCtx(projectRef.current) : {}
      setActive({ chapterId, stepIndex, ctx, stepStartProject: projectRef.current })
    }
    setCurrent(chapterId, stepIndex)
  }

  function advance() {
    setActive((cur) => {
      if (!cur) return cur
      const chapter = getChapter(cur.chapterId)
      const next = cur.stepIndex + 1
      if (next >= (chapter?.steps?.length ?? 0)) {
        markCompleted(cur.chapterId)
        teardown(cur)
        return null
      }
      setCurrent(cur.chapterId, next)
      // Re-snapshot so the next `do` step measures change from this moment.
      return { ...cur, stepIndex: next, stepStartProject: projectRef.current }
    })
  }

  function back() {
    setActive((cur) => {
      if (!cur || cur.stepIndex === 0) return cur
      const prev = cur.stepIndex - 1
      setCurrent(cur.chapterId, prev)
      return { ...cur, stepIndex: prev, stepStartProject: projectRef.current }
    })
  }

  // Restore the stashed live project (demo sandbox only), run the chapter's
  // onExit cleanup (e.g. drop a demo sample from the cache), and clear state.
  function teardown(act: ActiveState | null) {
    if (act) getChapter(act.chapterId)?.onExit?.(act.ctx)
    if (stash.current) {
      reset(stash.current.project)
      if (stash.current.selectedId) setSelectedId(stash.current.selectedId)
      stash.current = null
    }
  }

  // Skip/escape: leave the chapter but keep progress so Resume picks it back up.
  function exitChapter() {
    teardown(active)
    setActive(null)
  }

  function restartAll() {
    resetProgress()
    teardown(active)
    setActive(null)
  }

  const progress = getProgress()
  const chapters = CHAPTERS.map((c) => ({
    ...c,
    completed: !!progress.completed[c.id],
    isCurrent: progress.current?.chapterId === c.id,
  }))
  const resumeChapter = progress.current && getChapter(progress.current.chapterId)
  const activeChapter = active ? getChapter(active.chapterId) : null
  const activeStep = active && activeChapter ? (activeChapter.steps?.[active.stepIndex] ?? null) : null

  // A gated `read` step (`requireValidate`) keeps Next disabled until its
  // validate passes — the learner can then play freely and continue when ready.
  // `gatedReady` is recomputed from the reactive `project` each render so the
  // button unlocks the moment the model reaches the goal; `unlocked` latches it
  // so it stays available afterwards. Normal steps are always advanceable.
  const gatedReady =
    activeStep?.kind === 'read' && activeStep.requireValidate && activeStep.validate && active
      ? activeStep.validate(project, active.stepStartProject, active.ctx)
      : true
  const canAdvance =
    activeStep?.kind === 'read' && activeStep.requireValidate ? (unlocked || gatedReady) : true
  useEffect(() => { if (gatedReady) setUnlocked(true) }, [gatedReady])

  return {
    menuOpen,
    openMenu: () => setMenuOpen(true),
    closeMenu: () => setMenuOpen(false),
    chapters,
    resumeAvailable: !!resumeChapter && !resumeChapter.stub,
    resume: () => progress.current && startChapter(progress.current.chapterId, { resumeStep: progress.current.stepIndex }),
    startChapter,
    restartAll,
    active,
    activeChapter,
    activeStep,
    stepIndex: active?.stepIndex ?? 0,
    canAdvance,
    advance,
    back,
    exitChapter,
  }
}

export type Tutorial = ReturnType<typeof useTutorial>
