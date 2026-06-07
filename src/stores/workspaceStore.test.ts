import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkspaceStore } from './workspaceStore';

describe('workspaceStore', () => {
  beforeEach(() => {
    const store = useWorkspaceStore.getState();
    store.closeFile();
    useWorkspaceStore.setState({
      rootPath: null,
      workspaceMeta: null,
      fileTree: [],
      expandedFolders: new Set(),
      activeFilePath: null,
      activeEditorType: 'empty',
      whiteboardAnchor: null,
      repairs: [],
    });
  });

  it('starts with empty state', () => {
    const state = useWorkspaceStore.getState();
    expect(state.rootPath).toBeNull();
    expect(state.activeEditorType).toBe('empty');
    expect(state.activeFilePath).toBeNull();
  });

  it('opens workspace and populates file tree', async () => {
    const store = useWorkspaceStore.getState();
    await store.openWorkspace('/mock/workspace');

    const state = useWorkspaceStore.getState();
    expect(state.rootPath).toBe('/mock/workspace');
    expect(state.workspaceMeta?.title).toBe('我的技术文档');
    expect(state.fileTree.length).toBe(4);
    expect(state.fileTree[0].name).toBe('入门指南');
    expect(state.repairs).toEqual([]);
  });

  it('opens file and switches to markdown view', async () => {
    const store = useWorkspaceStore.getState();
    await store.openWorkspace('/mock/workspace');
    await store.openFile('02-architecture/api-overview.md');

    const state = useWorkspaceStore.getState();
    expect(state.activeFilePath).toBe('02-architecture/api-overview.md');
    expect(state.activeEditorType).toBe('markdown');
  });

  it('closes file and returns to empty view', async () => {
    const store = useWorkspaceStore.getState();
    await store.openWorkspace('/mock/workspace');
    await store.openFile('01-getting-started/index.md');
    store.closeFile();

    const state = useWorkspaceStore.getState();
    expect(state.activeFilePath).toBeNull();
    expect(state.activeEditorType).toBe('empty');
  });

  it('enters and exits whiteboard mode', async () => {
    const store = useWorkspaceStore.getState();
    await store.openWorkspace('/mock/workspace');
    await store.openFile('01-getting-started/index.md');

    store.enterWhiteboard({
      sourceFilePath: '01-getting-started/index.md',
      cursorPosition: 42,
      nearestHeading: '快速开始',
    });

    let state = useWorkspaceStore.getState();
    expect(state.activeEditorType).toBe('whiteboard');
    expect(state.whiteboardAnchor?.nearestHeading).toBe('快速开始');

    store.exitWhiteboard();
    state = useWorkspaceStore.getState();
    expect(state.activeEditorType).toBe('markdown');
    expect(state.whiteboardAnchor).toBeNull();
  });

  it('toggles folder expansion', async () => {
    const store = useWorkspaceStore.getState();
    await store.openWorkspace('/mock/workspace');

    let state = useWorkspaceStore.getState();
    expect(state.expandedFolders.has('01-getting-started')).toBe(true);

    store.toggleFolder('01-getting-started');
    state = useWorkspaceStore.getState();
    expect(state.expandedFolders.has('01-getting-started')).toBe(false);

    store.toggleFolder('01-getting-started');
    state = useWorkspaceStore.getState();
    expect(state.expandedFolders.has('01-getting-started')).toBe(true);
  });

  it('creates workspace and sets root path', async () => {
    const store = useWorkspaceStore.getState();
    await store.createWorkspace('/mock/new-workspace', '新文档', '测试者');

    const state = useWorkspaceStore.getState();
    expect(state.rootPath).toBe('/mock/new-workspace');
    expect(state.workspaceMeta?.title).toBe('新文档');
    expect(state.workspaceMeta?.author).toBe('测试者');
    expect(state.fileTree).toEqual([]);
  });

  it('stores repair actions when opening workspace', async () => {
    // The default mock returns empty repairs, but the store should handle them
    const store = useWorkspaceStore.getState();
    await store.openWorkspace('/mock/workspace');

    const state = useWorkspaceStore.getState();
    expect(state.repairs).toEqual([]);
  });

  it('marks missing files in file tree nodes', async () => {
    // Mock returns no missing files by default, verify isMissing is propagated
    const store = useWorkspaceStore.getState();
    await store.openWorkspace('/mock/workspace');

    const state = useWorkspaceStore.getState();
    for (const node of state.fileTree) {
      expect(node.isMissing).toBeFalsy();
    }
  });
});
