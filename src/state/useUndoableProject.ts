import { useCallback, useReducer } from 'react'
import type { Project } from '../types'

// Undo/redo history over the single project object. The project model is
// already immutable (every transform returns a new project), so history is just
// a stack of old references — cheap. Sample blobs live outside the project (in
// sampleCache) and are NOT tracked here; they have their own per-block undo.

const MAX = 50

export type ProjectUpdater = (project: Project) => Project

interface HistoryState {
  past: Project[]
  present: Project
  future: Project[]
  lastKey: string | null
}

type Action =
  | { type: 'dispatch'; updater: ProjectUpdater; key?: string }
  | { type: 'reset'; present: Project }
  | { type: 'undo' }
  | { type: 'redo' }

const init = (present: Project): HistoryState => ({ past: [], present, future: [], lastKey: null })

function reducer(state: HistoryState, action: Action): HistoryState {
  switch (action.type) {
    case 'dispatch': {
      const next = action.updater(state.present)
      // Read-only updates (e.g. playSound returns the same project) don't touch
      // history and don't re-render.
      if (next === state.present) return state
      // Coalesce: a continuous edit to the same param replaces the present
      // without growing the past, so one Cmd+Z reverts the whole drag.
      const coalesce = action.key != null && action.key === state.lastKey
      if (coalesce) return { ...state, present: next, future: [], lastKey: action.key ?? null }
      const past = [...state.past, state.present]
      if (past.length > MAX) past.shift()
      return { past, present: next, future: [], lastKey: action.key ?? null }
    }
    case 'reset':
      return init(action.present)
    case 'undo': {
      if (state.past.length === 0) return state
      const past = state.past.slice(0, -1)
      const present = state.past[state.past.length - 1]!
      return { past, present, future: [state.present, ...state.future], lastKey: null }
    }
    case 'redo': {
      if (state.future.length === 0) return state
      const [present, ...future] = state.future
      return { past: [...state.past, state.present], present: present!, future, lastKey: null }
    }
    default:
      return state
  }
}

// `initializer` is a function returning the initial project (lazy, like the
// useState initializer it replaces — runs once on mount).
export function useUndoableProject(initializer: () => Project) {
  const [state, dispatchAction] = useReducer(reducer, initializer, (fn) => init(fn()))

  // updater: (project) => project'; key: optional coalesce key (param edits).
  const dispatch = useCallback((updater: ProjectUpdater, key?: string) => {
    dispatchAction({ type: 'dispatch', updater, key })
  }, [])
  const reset = useCallback((present: Project) => dispatchAction({ type: 'reset', present }), [])
  const undo = useCallback(() => dispatchAction({ type: 'undo' }), [])
  const redo = useCallback(() => dispatchAction({ type: 'redo' }), [])

  return {
    project: state.present,
    dispatch,
    reset,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  }
}
