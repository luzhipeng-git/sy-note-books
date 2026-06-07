import { describe, it, expect, beforeEach } from 'vitest';
import { useWhiteboardStore } from './whiteboardStore';

const mockAnchor = {
  sourceFilePath: '02-architecture/api-overview.md',
  cursorPosition: 5,
  nearestHeading: 'API 总览',
};

describe('whiteboardStore', () => {
  beforeEach(() => {
    useWhiteboardStore.getState().reset();
  });

  it('starts with initial state', () => {
    const state = useWhiteboardStore.getState();
    expect(state.mode).toBe('new');
    expect(state.anchor).toBeNull();
    expect(state.elements).toEqual([]);
    expect(state.boardRef).toBeNull();
    expect(state.editingImagePath).toBeNull();
    expect(state.isSaving).toBe(false);
    expect(state.isDirty).toBe(false);
  });

  it('initNew sets new mode with anchor', () => {
    useWhiteboardStore.getState().initNew(mockAnchor);
    const state = useWhiteboardStore.getState();

    expect(state.mode).toBe('new');
    expect(state.anchor).toEqual(mockAnchor);
    expect(state.elements).toEqual([]);
    expect(state.editingImagePath).toBeNull();
  });

  it('initEdit sets edit mode with elements', () => {
    const elements = [{ id: '1', type: 'rectangle', children: [] }];
    const drawnixPath = 'assets/api-overview-img-001.drawnix';

    useWhiteboardStore.getState().initEdit(mockAnchor, drawnixPath, elements);
    const state = useWhiteboardStore.getState();

    expect(state.mode).toBe('edit');
    expect(state.anchor).toEqual(mockAnchor);
    expect(state.elements).toEqual(elements);
    expect(state.editingImagePath).toBe(drawnixPath);
  });

  it('setDirty marks dirty state', () => {
    useWhiteboardStore.getState().setDirty(true);
    expect(useWhiteboardStore.getState().isDirty).toBe(true);

    useWhiteboardStore.getState().setDirty(false);
    expect(useWhiteboardStore.getState().isDirty).toBe(false);
  });

  it('setSaving tracks saving state', () => {
    useWhiteboardStore.getState().setSaving(true);
    expect(useWhiteboardStore.getState().isSaving).toBe(true);

    useWhiteboardStore.getState().setSaving(false);
    expect(useWhiteboardStore.getState().isSaving).toBe(false);
  });

  it('reset clears all state', () => {
    useWhiteboardStore.getState().initNew(mockAnchor);
    useWhiteboardStore.getState().setDirty(true);
    useWhiteboardStore.getState().setSaving(true);
    useWhiteboardStore.getState().reset();

    const state = useWhiteboardStore.getState();
    expect(state.anchor).toBeNull();
    expect(state.isDirty).toBe(false);
    expect(state.isSaving).toBe(false);
    expect(state.elements).toEqual([]);
  });
});
