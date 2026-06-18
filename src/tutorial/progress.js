// Tutorial progress — NOT project data. Lives in localStorage only, the same
// pattern as uiPrefs (mode/lang): never goes through the undo reducer, never
// serialized into the ZIP/autosave. Shape:
//   { completed: { [chapterId]: true }, current: { chapterId, stepIndex } | null }
const KEY = 'blast_tutorial'

function read() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { completed: {}, current: null }
    const parsed = JSON.parse(raw)
    return { completed: parsed.completed ?? {}, current: parsed.current ?? null }
  } catch {
    return { completed: {}, current: null }
  }
}

function write(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch {}
}

export function getProgress() {
  return read()
}

// Remember where the learner is, so a chapter resumes mid-stream after reload.
export function setCurrent(chapterId, stepIndex) {
  write({ ...read(), current: { chapterId, stepIndex } })
}

export function markCompleted(chapterId) {
  const p = read()
  write({ completed: { ...p.completed, [chapterId]: true }, current: null })
}

// "Restartable" = clear the key entirely.
export function resetProgress() {
  try { localStorage.removeItem(KEY) } catch {}
}
