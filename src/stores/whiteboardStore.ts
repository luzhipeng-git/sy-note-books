import { create } from 'zustand';
import type { PlaitElement, PlaitBoard } from '@plait/core';
import type { WhiteboardAnchor } from '../types/workspace';

export type WhiteboardMode = 'new' | 'edit';

interface WhiteboardState {
  mode: WhiteboardMode;
  anchor: WhiteboardAnchor | null;
  elements: PlaitElement[];
  boardRef: PlaitBoard | null;
  editingImagePath: string | null;
  isSaving: boolean;
  isDirty: boolean;

  initNew: (anchor: WhiteboardAnchor) => void;
  initEdit: (anchor: WhiteboardAnchor, drawnixPath: string, elements: PlaitElement[]) => void;
  setBoardRef: (board: PlaitBoard | null) => void;
  setDirty: (dirty: boolean) => void;
  setSaving: (saving: boolean) => void;
  reset: () => void;
}

const initialState = {
  mode: 'new' as WhiteboardMode,
  anchor: null as WhiteboardAnchor | null,
  elements: [] as PlaitElement[],
  boardRef: null as PlaitBoard | null,
  editingImagePath: null as string | null,
  isSaving: false,
  isDirty: false,
};

export const useWhiteboardStore = create<WhiteboardState>()((set) => ({
  ...initialState,

  initNew: (anchor) =>
    set({
      ...initialState,
      mode: 'new',
      anchor,
      elements: [],
    }),

  initEdit: (anchor, drawnixPath, elements) =>
    set({
      ...initialState,
      mode: 'edit',
      anchor,
      editingImagePath: drawnixPath,
      elements,
    }),

  setBoardRef: (board) => set({ boardRef: board }),
  setDirty: (dirty) => set({ isDirty: dirty }),
  setSaving: (saving) => set({ isSaving: saving }),
  reset: () => set(initialState),
}));
