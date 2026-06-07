import { create } from 'zustand';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

interface EditorState {
  fileContent: string | null;
  isModified: boolean;
  cursorLine: number;
  cursorColumn: number;
  saveStatus: SaveStatus;
  insertTable: ((rows: number, cols: number) => void) | null;
  vditorAction: ((action: string) => void) | null;
  setContent: (content: string) => void;
  setModified: (modified: boolean) => void;
  setCursorPosition: (line: number, column: number) => void;
  setSaveStatus: (status: SaveStatus) => void;
  setInsertTable: (fn: ((rows: number, cols: number) => void) | null) => void;
  setVditorAction: (fn: ((action: string) => void) | null) => void;
  reset: () => void;
}

const initialState = {
  fileContent: null,
  isModified: false,
  cursorLine: 1,
  cursorColumn: 1,
  saveStatus: 'idle' as SaveStatus,
  insertTable: null as ((rows: number, cols: number) => void) | null,
  vditorAction: null as ((action: string) => void) | null,
};

export const useEditorStore = create<EditorState>()((set) => ({
  ...initialState,
  setContent: (content) => set({ fileContent: content, isModified: true }),
  setModified: (modified) => set({ isModified: modified }),
  setCursorPosition: (line, column) => set({ cursorLine: line, cursorColumn: column }),
  setSaveStatus: (status) => set({ saveStatus: status }),
  setInsertTable: (fn) => set({ insertTable: fn }),
  setVditorAction: (fn) => set({ vditorAction: fn }),
  reset: () => set(initialState),
}));
