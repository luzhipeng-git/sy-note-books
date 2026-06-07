import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEditorStore } from '../stores/editorStore';
import { useWorkspaceStore } from '../stores/workspaceStore';

describe('useAutoSave', () => {
  beforeEach(() => {
    useEditorStore.getState().reset();
    useWorkspaceStore.setState({
      rootPath: '/mock/workspace',
      activeFilePath: '01-getting-started/index.md',
      activeEditorType: 'markdown',
    });
  });

  it('editorStore saveStatus transitions correctly for save flow', async () => {
    const store = useEditorStore.getState();

    store.setContent('# Test');
    store.setSaveStatus('saving');
    expect(useEditorStore.getState().saveStatus).toBe('saving');

    store.setSaveStatus('saved');
    expect(useEditorStore.getState().saveStatus).toBe('saved');
    expect(useEditorStore.getState().isModified).toBe(true);
  });

  it('save status reflects failure', () => {
    const store = useEditorStore.getState();
    store.setSaveStatus('saving');
    store.setSaveStatus('failed');
    expect(useEditorStore.getState().saveStatus).toBe('failed');
  });

  it('reset clears save status', () => {
    const store = useEditorStore.getState();
    store.setSaveStatus('saving');
    store.reset();
    expect(useEditorStore.getState().saveStatus).toBe('idle');
  });
});
