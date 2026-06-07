import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from './editorStore';

describe('editorStore', () => {
  beforeEach(() => {
    useEditorStore.getState().reset();
  });

  it('starts with idle state', () => {
    const state = useEditorStore.getState();
    expect(state.fileContent).toBeNull();
    expect(state.isModified).toBe(false);
    expect(state.saveStatus).toBe('idle');
    expect(state.cursorLine).toBe(1);
    expect(state.cursorColumn).toBe(1);
  });

  it('sets content and marks modified', () => {
    useEditorStore.getState().setContent('# Hello');
    const state = useEditorStore.getState();
    expect(state.fileContent).toBe('# Hello');
    expect(state.isModified).toBe(true);
  });

  it('resets to initial state', () => {
    useEditorStore.getState().setContent('content');
    useEditorStore.getState().setSaveStatus('saved');
    useEditorStore.getState().reset();

    const state = useEditorStore.getState();
    expect(state.fileContent).toBeNull();
    expect(state.isModified).toBe(false);
    expect(state.saveStatus).toBe('idle');
  });

  it('tracks save status transitions', () => {
    const store = useEditorStore.getState();

    store.setSaveStatus('saving');
    expect(useEditorStore.getState().saveStatus).toBe('saving');

    store.setSaveStatus('saved');
    expect(useEditorStore.getState().saveStatus).toBe('saved');

    store.setSaveStatus('failed');
    expect(useEditorStore.getState().saveStatus).toBe('failed');
  });

  it('updates cursor position', () => {
    useEditorStore.getState().setCursorPosition(10, 5);
    const state = useEditorStore.getState();
    expect(state.cursorLine).toBe(10);
    expect(state.cursorColumn).toBe(5);
  });
});
