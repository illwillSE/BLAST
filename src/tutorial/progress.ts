// Tutorial progress — NOT project data. Lives in localStorage only, the same
// pattern as uiPrefs (mode/lang): never goes through the undo reducer, never
// serialized into the ZIP/autosave. Shape:
//   { completed: { [chapterId]: true }, current: { chapterId, stepIndex } | null }
const KEY = 'blast_tutorial'

export interface TutorialCurrent {
  chapterId: string
  stepIndex: number
}

export interface TutorialProgress {
  completed: Record<string, boolean>
  current: TutorialCurrent | null
}

function read(): TutorialProgress {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { completed: {}, current: null }
    const parsed = JSON.parse(raw) as Partial<TutorialProgress>
    return { completed: parsed.completed ?? {}, current: parsed.current ?? null }
  } catch {
    return { completed: {}, current: null }
  }
}

function write(state: TutorialProgress): void {
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* storage full / disabled */ }
}

export function getProgress(): TutorialProgress {
  return read()
}

// Remember where the learner is, so a chapter resumes mid-stream after reload.
export function setCurrent(chapterId: string, stepIndex: number): void {
  write({ ...read(), current: { chapterId, stepIndex } })
}

export function markCompleted(chapterId: string): void {
  const p = read()
  write({ completed: { ...p.completed, [chapterId]: true }, current: null })
}

// "Restartable" = clear the key entirely.
export function resetProgress(): void {
  try { localStorage.removeItem(KEY) } catch { /* storage full / disabled */ }
}
