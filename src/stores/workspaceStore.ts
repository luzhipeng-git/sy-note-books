import { create } from 'zustand';
import type {
  WorkspaceMeta,
  SummaryNode,
  FileTreeNode,
  WhiteboardAnchor,
  RepairAction,
} from '../types/workspace';
import type { EditorType } from '../types/editor';
import { invokeIPC } from '../services/ipc';
import { useEditorStore } from './editorStore';
import { useSearchStore } from './searchStore';
import { useSettingsStore } from './settingsStore';

interface WorkspaceState {
  rootPath: string | null;
  workspaceMeta: WorkspaceMeta | null;
  fileTree: FileTreeNode[];
  expandedFolders: Set<string>;
  activeFilePath: string | null;
  activeEditorType: EditorType;
  whiteboardAnchor: WhiteboardAnchor | null;
  repairs: RepairAction[];
  errorMessage: string | null;

  openWorkspace: (path: string) => Promise<void>;
  createWorkspace: (path: string, title: string, author: string, language?: string) => Promise<void>;
  openFile: (path: string) => Promise<void>;
  closeFile: () => void;
  closeWorkspace: () => void;
  enterWhiteboard: (anchor: WhiteboardAnchor) => void;
  exitWhiteboard: () => void;
  toggleFolder: (path: string) => void;
  createChapter: (title: string) => Promise<void>;
  createPage: (chapterPath: string, title: string) => Promise<void>;
  renameNode: (path: string, newTitle: string) => Promise<void>;
  deleteNode: (path: string) => Promise<void>;
  refreshTree: () => Promise<void>;
  clearError: () => void;
}

function summaryToTree(nodes: SummaryNode[]): FileTreeNode[] {
  const folders: FileTreeNode[] = [];

  for (const node of nodes) {
    if (node.level === 1) {
      const folder: FileTreeNode = {
        name: node.title,
        path: node.path.replace(/\/index\.md$/, ''),
        type: 'folder',
        children: [],
        isMissing: node.isMissing,
      };
      folders.push(folder);

      for (const child of node.children ?? []) {
        if (!folder.children) folder.children = [];
        folder.children.push({
          name: child.title,
          path: child.path,
          type: 'file',
          isMissing: child.isMissing,
        });
      }
    }
  }

  return folders;
}

export const useWorkspaceStore = create<WorkspaceState>()((set, get) => ({
  rootPath: null,
  workspaceMeta: null,
  fileTree: [],
  expandedFolders: new Set(),
  activeFilePath: null,
  activeEditorType: 'empty',
  whiteboardAnchor: null,
  repairs: [],
  errorMessage: null,

  clearError: () => set({ errorMessage: null }),

  openWorkspace: async (path: string) => {
    try {
      set({ errorMessage: null });
      const info = await invokeIPC<{
        rootPath: string;
        workspaceMeta: WorkspaceMeta;
        summary: SummaryNode[];
        repairs: RepairAction[];
      }>('open_workspace', { path });

      set({
        rootPath: info.rootPath,
        workspaceMeta: info.workspaceMeta,
        fileTree: summaryToTree(info.summary),
        expandedFolders: new Set(
          info.summary.map((n) => n.path.replace(/\/index\.md$/, '')),
        ),
        activeFilePath: null,
        activeEditorType: 'empty',
        whiteboardAnchor: null,
        repairs: info.repairs ?? [],
      });

      // Build search index
      await useSearchStore.getState().buildIndex(info.rootPath, info.summary);

      // Record in recent workspaces
      useSettingsStore.getState().addRecentWorkspace(info.rootPath, info.workspaceMeta.title);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      set({ errorMessage: msg || '打开 Workspace 失败' });
    }
  },

  createWorkspace: async (path: string, title: string, author: string, language?: string) => {
    try {
      set({ errorMessage: null });
      const info = await invokeIPC<{
        rootPath: string;
        workspaceMeta: WorkspaceMeta;
        summary: SummaryNode[];
        repairs: RepairAction[];
      }>('create_workspace', { path, title, author, language });

      set({
        rootPath: info.rootPath,
        workspaceMeta: info.workspaceMeta,
        fileTree: summaryToTree(info.summary),
        expandedFolders: new Set(),
        activeFilePath: null,
        activeEditorType: 'empty',
        whiteboardAnchor: null,
        repairs: [],
      });

      // Build search index (empty for new workspace)
      await useSearchStore.getState().buildIndex(info.rootPath, info.summary);

      // Record in recent workspaces
      useSettingsStore.getState().addRecentWorkspace(info.rootPath, info.workspaceMeta.title);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      set({ errorMessage: msg || '创建 Workspace 失败' });
    }
  },

  openFile: async (path: string) => {
    // Skip if the same file is already open
    if (get().activeFilePath === path) return;

    try {
      const rootPath = get().rootPath;
      const fullPath = rootPath ? `${rootPath}/${path}` : path;
      const content = await invokeIPC<string>('read_file', { path: fullPath });
      useEditorStore.getState().reset();
      useEditorStore.getState().setContent(content);
      set({
        activeFilePath: path,
        activeEditorType: 'markdown',
        errorMessage: null,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      set({ errorMessage: msg || '打开文件失败' });
    }
  },

  closeFile: () =>
    set({
      activeFilePath: null,
      activeEditorType: 'empty',
    }),

  closeWorkspace: () => {
    useEditorStore.getState().reset();
    useSearchStore.getState().reset();
    set({
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
  },

  enterWhiteboard: (anchor) =>
    set({
      whiteboardAnchor: anchor,
      activeEditorType: 'whiteboard',
    }),

  exitWhiteboard: () =>
    set({
      activeEditorType: 'markdown',
      whiteboardAnchor: null,
    }),

  toggleFolder: (path: string) => {
    const next = new Set(get().expandedFolders);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    set({ expandedFolders: next });
  },

  createChapter: async (title: string) => {
    const rootPath = get().rootPath;
    if (!rootPath) return;
    try {
      set({ errorMessage: null });
      await invokeIPC('create_chapter', { workspacePath: rootPath, title });
      await get().refreshTree();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      set({ errorMessage: msg || '创建章节失败' });
    }
  },

  createPage: async (chapterPath: string, title: string) => {
    const rootPath = get().rootPath;
    if (!rootPath) return;
    try {
      set({ errorMessage: null });
      await invokeIPC('create_page', { workspacePath: rootPath, chapterPath, title });
      await get().refreshTree();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      set({ errorMessage: msg || '创建页面失败' });
    }
  },

  renameNode: async (path: string, newTitle: string) => {
    const rootPath = get().rootPath;
    if (!rootPath) return;
    try {
      set({ errorMessage: null });
      await invokeIPC('rename_node', { workspacePath: rootPath, path, newTitle });
      await get().refreshTree();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      set({ errorMessage: msg || '重命名失败' });
    }
  },

  deleteNode: async (path: string) => {
    const rootPath = get().rootPath;
    if (!rootPath) return;
    try {
      set({ errorMessage: null });
      await invokeIPC('delete_node', { workspacePath: rootPath, path });
      // If the deleted file was active, clear the editor
      if (get().activeFilePath === path || get().activeFilePath?.startsWith(path)) {
        set({ activeFilePath: null, activeEditorType: 'empty' });
      }
      await get().refreshTree();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      set({ errorMessage: msg || '删除失败' });
    }
  },

  refreshTree: async () => {
    const rootPath = get().rootPath;
    if (!rootPath) return;
    try {
      const info = await invokeIPC<{
        rootPath: string;
        workspaceMeta: WorkspaceMeta;
        summary: SummaryNode[];
        repairs: RepairAction[];
      }>('open_workspace', { path: rootPath });
      set({
        fileTree: summaryToTree(info.summary),
        workspaceMeta: info.workspaceMeta,
        repairs: info.repairs ?? [],
      });

      // Rebuild search index after tree changes
      await useSearchStore.getState().buildIndex(rootPath, info.summary);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      set({ errorMessage: msg || '刷新文件树失败' });
    }
  },
}));
