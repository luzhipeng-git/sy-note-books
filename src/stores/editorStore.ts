import { create } from 'zustand';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

interface EditorState {
  fileContent: string | null;
  isModified: boolean;
  cursorLine: number;
  cursorColumn: number;
  saveStatus: SaveStatus;
  tocOpen: boolean;
  insertTable: ((rows: number, cols: number) => void) | null;
  vditorAction: ((action: string) => void) | null;
  setContent: (content: string) => void;
  setModified: (modified: boolean) => void;
  setCursorPosition: (line: number, column: number) => void;
  setSaveStatus: (status: SaveStatus) => void;
  setTocOpen: (open: boolean) => void;
  toggleToc: () => void;
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
  tocOpen: false,
  insertTable: null as ((rows: number, cols: number) => void) | null,
  vditorAction: null as ((action: string) => void) | null,
};

export const useEditorStore = create<EditorState>()((set) => ({
  ...initialState,
  setContent: (content) => set({ fileContent: content, isModified: true }),
  setModified: (modified) => set({ isModified: modified }),
  setCursorPosition: (line, column) => set({ cursorLine: line, cursorColumn: column }),
  setSaveStatus: (status) => set({ saveStatus: status }),
  setTocOpen: (open) => set({ tocOpen: open }),
  toggleToc: () => set((s) => ({ tocOpen: !s.tocOpen })),
  setInsertTable: (fn) => set({ insertTable: fn }),
  setVditorAction: (fn) => set({ vditorAction: fn }),
  reset: () => set(initialState),
}));
