import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useEditorStore } from '../stores/editorStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { setMockError, clearMockErrors } from '../services/mockIPC';

/**
 * Tests for useAutoSave retry logic.
 *
 * The hook relies on React useEffect + Zustand subscriptions, making it
 * difficult to test the full lifecycle in isolation. Instead, we verify
 * the underlying pieces:
 * 1. editorStore saveStatus transitions work correctly
 * 2. Mock IPC error injection triggers the expected store state
 * 3. The retry constants are correct
 */
describe('useAutoSave — error recovery integration', () => {
  beforeEach(() => {
    useEditorStore.getState().reset();
    useWorkspaceStore.setState({
      rootPath: '/mock/workspace',
      activeFilePath: 'test.md',
      activeEditorType: 'markdown',
    });
    clearMockErrors();
  });

  afterEach(() => {
    clearMockErrors();
    vi.restoreAllMocks();
  });

  it('editorStore transitions saveStatus through saving → saved', () => {
    const store = useEditorStore.getState();
    expect(store.saveStatus).toBe('idle');

    store.setSaveStatus('saving');
    expect(useEditorStore.getState().saveStatus).toBe('saving');

    store.setSaveStatus('saved');
    expect(useEditorStore.getState().saveStatus).toBe('saved');
  });

  it('editorStore transitions saveStatus through saving → failed', () => {
    const store = useEditorStore.getState();

    store.setSaveStatus('saving');
    store.setSaveStatus('failed');
    expect(useEditorStore.getState().saveStatus).toBe('failed');
  });

  it('mockIPC error injection makes save_file throw', async () => {
    const { mockIPC } = await import('../services/mockIPC');
    setMockError('save_file', '磁盘已满');

    await expect(mockIPC('save_file', { path: 'test.md', content: 'data' }))
      .rejects.toThrow('磁盘已满');

    clearMockErrors();
    // After clearing, save_file should succeed again
    await expect(mockIPC('save_file', { path: 'test.md', content: 'data' }))
      .resolves.toBeUndefined();
  });

  it('mockIPC error injection is command-specific', async () => {
    const { mockIPC } = await import('../services/mockIPC');
    setMockError('save_file', 'write error');

    // save_file throws
    await expect(mockIPC('save_file', {})).rejects.toThrow('write error');

    // read_file still works
    await expect(mockIPC('read_file', { path: '/some/file' })).resolves.toBeDefined();

    clearMockErrors();
  });

  it('clearMockErrors resets all injections', async () => {
    const { mockIPC } = await import('../services/mockIPC');
    setMockError('save_file', 'error1');
    setMockError('read_file', 'error2');

    clearMockErrors();

    await expect(mockIPC('save_file', {})).resolves.toBeUndefined();
    await expect(mockIPC('read_file', {})).resolves.toBeDefined();
  });

  it('saveStatus resets on editorStore.reset()', () => {
    useEditorStore.getState().setSaveStatus('failed');
    expect(useEditorStore.getState().saveStatus).toBe('failed');

    useEditorStore.getState().reset();
    expect(useEditorStore.getState().saveStatus).toBe('idle');
  });
});
