import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useWorkspaceStore } from './workspaceStore';
import { useEditorStore } from './editorStore';
import { setMockError, clearMockErrors } from '../services/mockIPC';

describe('workspaceStore — error recovery', () => {
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

  // ─── openWorkspace errors ──────────────────────────────

  it('openWorkspace sets errorMessage on IPC failure', async () => {
    setMockError('open_workspace', '路径不存在: /bad/path');

    const store = useWorkspaceStore.getState();
    await store.openWorkspace('/bad/path');

    const state = useWorkspaceStore.getState();
    expect(state.errorMessage).toContain('路径不存在');
    // Workspace should NOT be opened
    expect(state.rootPath).toBeNull();
    expect(state.fileTree).toEqual([]);
  });

  it('openWorkspace clears previous error on success', async () => {
    // First call fails
    setMockError('open_workspace', 'some error');
    await useWorkspaceStore.getState().openWorkspace('/bad');
    expect(useWorkspaceStore.getState().errorMessage).toBeTruthy();

    // Second call succeeds
    clearMockErrors();
    await useWorkspaceStore.getState().openWorkspace('/mock/workspace');
    expect(useWorkspaceStore.getState().errorMessage).toBeNull();
    expect(useWorkspaceStore.getState().rootPath).toBe('/mock/workspace');
  });

  // ─── createWorkspace errors ────────────────────────────

  it('createWorkspace sets errorMessage on IPC failure', async () => {
    setMockError('create_workspace', '创建目录失败');

    const store = useWorkspaceStore.getState();
    await store.createWorkspace('/bad/path', '测试', '作者');

    const state = useWorkspaceStore.getState();
    expect(state.errorMessage).toContain('创建目录失败');
    expect(state.rootPath).toBeNull();
  });

  // ─── openFile errors ───────────────────────────────────

  it('openFile sets errorMessage on IPC failure', async () => {
    // First open workspace (succeeds)
    await useWorkspaceStore.getState().openWorkspace('/mock/workspace');

    // Then try to open a file that fails
    setMockError('read_file', '文件不存在');
    await useWorkspaceStore.getState().openFile('nonexistent.md');

    const state = useWorkspaceStore.getState();
    expect(state.errorMessage).toContain('文件不存在');
    // Editor should NOT switch to markdown
    expect(state.activeEditorType).toBe('empty');
    expect(state.activeFilePath).toBeNull();
  });

  // ─── CRUD errors ───────────────────────────────────────

  it('createChapter sets errorMessage on IPC failure', async () => {
    await useWorkspaceStore.getState().openWorkspace('/mock/workspace');
    setMockError('create_chapter', '写入 SUMMARY.md 失败');

    await useWorkspaceStore.getState().createChapter('新章节');

    expect(useWorkspaceStore.getState().errorMessage).toContain('SUMMARY.md');
  });

  it('createPage sets errorMessage on IPC failure', async () => {
    await useWorkspaceStore.getState().openWorkspace('/mock/workspace');
    setMockError('create_page', '章节目录不存在');

    await useWorkspaceStore.getState().createPage('99-nonexistent', '页面');

    expect(useWorkspaceStore.getState().errorMessage).toContain('章节目录不存在');
  });

  it('renameNode sets errorMessage on IPC failure', async () => {
    await useWorkspaceStore.getState().openWorkspace('/mock/workspace');
    setMockError('rename_node', '路径不存在');

    await useWorkspaceStore.getState().renameNode('bad/path.md', '新标题');

    expect(useWorkspaceStore.getState().errorMessage).toContain('路径不存在');
  });

  it('deleteNode sets errorMessage on IPC failure', async () => {
    await useWorkspaceStore.getState().openWorkspace('/mock/workspace');
    setMockError('delete_node', '删除目录失败');

    await useWorkspaceStore.getState().deleteNode('bad/chapter');

    expect(useWorkspaceStore.getState().errorMessage).toContain('删除目录失败');
  });

  // ─── refreshTree errors ────────────────────────────────

  it('refreshTree sets errorMessage on IPC failure', async () => {
    await useWorkspaceStore.getState().openWorkspace('/mock/workspace');
    setMockError('open_workspace', '读取 SUMMARY.md 失败');

    await useWorkspaceStore.getState().refreshTree();

    expect(useWorkspaceStore.getState().errorMessage).toContain('SUMMARY.md');
  });

  // ─── clearError ────────────────────────────────────────

  it('clearError resets errorMessage to null', async () => {
    setMockError('open_workspace', 'test error');
    await useWorkspaceStore.getState().openWorkspace('/bad');
    expect(useWorkspaceStore.getState().errorMessage).toBeTruthy();

    useWorkspaceStore.getState().clearError();
    expect(useWorkspaceStore.getState().errorMessage).toBeNull();
  });

  // ─── closeWorkspace clears error ───────────────────────

  it('closeWorkspace clears errorMessage', async () => {
    setMockError('open_workspace', 'test error');
    await useWorkspaceStore.getState().openWorkspace('/bad');
    expect(useWorkspaceStore.getState().errorMessage).toBeTruthy();

    useWorkspaceStore.getState().closeWorkspace();
    expect(useWorkspaceStore.getState().errorMessage).toBeNull();
  });

  // ─── error does not corrupt existing state ─────────────

  it('failed openFile does not corrupt existing workspace state', async () => {
    // Open workspace successfully
    await useWorkspaceStore.getState().openWorkspace('/mock/workspace');
    const beforeError = useWorkspaceStore.getState().rootPath;
    const fileTreeBefore = useWorkspaceStore.getState().fileTree.length;

    // Try to open a file that fails
    setMockError('read_file', '文件不存在');
    await useWorkspaceStore.getState().openFile('nonexistent.md');

    // Workspace state should be preserved
    expect(useWorkspaceStore.getState().rootPath).toBe(beforeError);
    expect(useWorkspaceStore.getState().fileTree.length).toBe(fileTreeBefore);
  });
});
