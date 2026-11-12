// Undo / redo history for the site document. Rapid edits to the same field are merged into
// one history step so "undo" reverts a whole typing burst, not a single keystroke.
import { useCallback, useReducer } from 'react';
import type { SiteDoc } from '@shared/site/schema';

type Path = (string | number)[];

/** Immutable set: returns a new object with `value` at `path`, sharing untouched branches. */
export function setIn<T>(obj: T, path: Path, value: unknown): T {
  if (path.length === 0) return value as T;
  const [head, ...rest] = path;
  if (Array.isArray(obj)) {
    const copy = obj.slice();
    copy[head as number] = setIn(copy[head as number], rest, value);
    return copy as T;
  }
  const source = (obj ?? {}) as Record<string, unknown>;
  return { ...source, [head]: setIn(source[head as string], rest, value) } as T;
}

export interface HistoryState {
  past: SiteDoc[];
  present: SiteDoc;
  future: SiteDoc[];
  /** the document as last saved to the database (draft) */
  saved: SiteDoc;
  lastKey: string | null;
  lastAt: number;
}

type Action =
  | { type: 'commit'; doc: SiteDoc; key: string | null; at: number }
  | { type: 'set'; path: Path; value: unknown; key: string | null; at: number }
  | { type: 'undo' } | { type: 'redo' }
  | { type: 'reset'; doc: SiteDoc }
  | { type: 'replace'; doc: SiteDoc }
  | { type: 'saved' };

const LIMIT = 100;
const MERGE_MS = 900;

export function historyReducer(state: HistoryState, action: Action): HistoryState {
  switch (action.type) {
    case 'set':
      return historyReducer(state, { type: 'commit', doc: setIn(state.present, action.path, action.value), key: action.key, at: action.at });
    case 'commit': {
      if (action.doc === state.present) return state;
      const merge = action.key !== null && action.key === state.lastKey && action.at - state.lastAt < MERGE_MS && state.past.length > 0;
      return {
        ...state,
        past: merge ? state.past : [...state.past, state.present].slice(-LIMIT),
        present: action.doc, future: [], lastKey: action.key, lastAt: action.at,
      };
    }
    case 'undo':
      if (state.past.length === 0) return state;
      return { ...state, past: state.past.slice(0, -1), present: state.past[state.past.length - 1], future: [state.present, ...state.future], lastKey: null };
    case 'redo':
      if (state.future.length === 0) return state;
      return { ...state, past: [...state.past, state.present], present: state.future[0], future: state.future.slice(1), lastKey: null };
    case 'reset':
      return { past: [], present: action.doc, future: [], saved: action.doc, lastKey: null, lastAt: 0 };
    case 'replace': // e.g. restoring a version: undoable, and marks the doc as needing a save
      return { ...state, past: [...state.past, state.present].slice(-LIMIT), present: action.doc, future: [], lastKey: null };
    case 'saved':
      return { ...state, saved: state.present };
  }
}

export function useHistory(initial: SiteDoc) {
  const [state, dispatch] = useReducer(historyReducer, { past: [], present: initial, future: [], saved: initial, lastKey: null, lastAt: 0 });
  /** Sets one value in the document. Edits to the same path within a short window share one undo step. */
  const update = useCallback((path: Path, value: unknown, key: string | null = path.join('.')) => {
    dispatch({ type: 'set', path, value, key, at: Date.now() });
  }, []);
  return { state, dispatch, update };
}
