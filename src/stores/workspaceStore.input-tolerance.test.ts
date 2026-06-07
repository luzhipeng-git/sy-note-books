import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useWorkspaceStore } from './workspaceStore';
import { useEditorStore } from './editorStore';
import { clearMockErrors } from '../services/mockIPC';

/**
 * Input tolerance tests — verify the store handles edge-case inputs
 * gracefully (no crashes, state remains consistent).
 *
 * Note: In mock IPC mode, the backend validation is bypassed.
 * These tests verify the frontend layer doesn't crash on bad input.
 * Path traversal rejection is tested at the Rust layer (path_util tests).
 */
describe('workspaceStore — input tolerance', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      rootPath: null,
      workspaceMeta: null,
      fileTree: [],
      expandedFolders: new Set(),
      activeFilePath: null,
      activeEditorType: 'empty',
      whiteboardAnchor: null,
      repairs: [],
      errorMessage: null,
    });
    useEditorStore.getState().reset();
    clearMockErrors();
  });

  afterEach(() => {
    clearMockErrors();
  });

  // ─── openWorkspace with edge-case paths ───────────────
  // These succeed in mock mode (no backend validation) but must not crash.

  it('openWorkspace with empty string does not crash', async () => {
    const store = useWorkspaceStore.getState();
    await store.openWorkspace('');
    // No crash = pass. State may vary depending on mock behavior.
    const state = useWorkspaceStore.getState();
    expect(state).toBeDefined();
  });

  it('openWorkspace with path containing null byte does not crash', async () => {
    const store = useWorkspaceStore.getState();
    await store.openWorkspace('/tmp/test\0path');
    const state = useWorkspaceStore.getState();
    expect(state).toBeDefined();
  });

  // ─── createWorkspace with edge-case inputs ────────────

  it('createWorkspace with empty title does not crash', async () => {
    const store = useWorkspaceStore.getState();
    await store.createWorkspace('/tmp/test-ws-empty-title', '');
    const state = useWorkspaceStore.getState();
    expect(state).toBeDefined();
  });

  it('createWorkspace with very long title does not crash', async () => {
    const longTitle = 'A'.repeat(500);
    const store = useWorkspaceStore.getState();
    await store.createWorkspace('/tmp/test-ws-long-title', longTitle);
    const state = useWorkspaceStore.getState();
    expect(state).toBeDefined();
  });

  it('createWorkspace with unicode title does not crash', async () => {
    const store = useWorkspaceStore.getState();
    await store.createWorkspace('/tmp/test-ws-unicode', '中文标题 🎉 émojis');
    const state = useWorkspaceStore.getState();
    expect(state).toBeDefined();
  });

  it('createWorkspace with special characters in title does not crash', async () => {
    const store = useWorkspaceStore.getState();
    await store.createWorkspace(
      '/tmp/test-ws-special',
      '<script>alert(1)</script>',
    );
    const state = useWorkspaceStore.getState();
    expect(state).toBeDefined();
  });

  // ─── Operations without an open workspace ─────────────
  // Store should guard against operations when no workspace is open.

  it('createChapter without open workspace does not crash', async () => {
    const store = useWorkspaceStore.getState();
    await store.createChapter('New Chapter');
    const state = useWorkspaceStore.getState();
    expect(state).toBeDefined();
    expect(state.rootPath).toBeNull();
  });

  it('deleteNode without open workspace does not crash', async () => {
    const store = useWorkspaceStore.getState();
    await store.deleteNode('01-getting-started');
    const state = useWorkspaceStore.getState();
    expect(state).toBeDefined();
    expect(state.rootPath).toBeNull();
  });

  it('renameNode without open workspace does not crash', async () => {
    const store = useWorkspaceStore.getState();
    await store.renameNode('01-getting-started', 'New Name');
    const state = useWorkspaceStore.getState();
    expect(state).toBeDefined();
    expect(state.rootPath).toBeNull();
  });

  // ─── Operations with edge-case titles ─────────────────

  describe('with open workspace', () => {
    beforeEach(async () => {
      const store = useWorkspaceStore.getState();
      await store.openWorkspace('/mock/workspace');
    });

    it('createChapter with empty title does not crash', async () => {
      const store = useWorkspaceStore.getState();
      await store.createChapter('');
      const state = useWorkspaceStore.getState();
      expect(state).toBeDefined();
    });

    it('createChapter with very long title does not crash', async () => {
      const store = useWorkspaceStore.getState();
      await store.createChapter('X'.repeat(300));
      const state = useWorkspaceStore.getState();
      expect(state).toBeDefined();
    });

    it('renameNode with special characters does not crash', async () => {
      const store = useWorkspaceStore.getState();
      await store.renameNode('01-getting-started', '../../etc/passwd');
      const state = useWorkspaceStore.getState();
      expect(state).toBeDefined();
    });

    it('deleteNode with path traversal does not crash', async () => {
      // In mock mode this succeeds; in production the Rust path_util rejects it
      const store = useWorkspaceStore.getState();
      await store.deleteNode('../../important-dir');
      const state = useWorkspaceStore.getState();
      expect(state).toBeDefined();
    });

    it('deleteNode with empty path does not crash', async () => {
      const store = useWorkspaceStore.getState();
      await store.deleteNode('');
      const state = useWorkspaceStore.getState();
      expect(state).toBeDefined();
    });
  });
});
