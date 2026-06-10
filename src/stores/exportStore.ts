import { create } from 'zustand';
import { invokeIPC } from '../services/ipc';
import type { ExportType, ExportStep } from '../types/export';

interface ExportState {
  // Dialog visibility
  isDialogOpen: boolean;

  // Wizard step: 'pick-workspace' | 'config' | 'progress' | 'success' | 'error'
  step: ExportStep | 'pick-workspace';

  // When no workspace open, user picks one from recent list
  selectedWorkspacePath: string | null;

  // Config
  exportType: ExportType;
  scope: 'workspace' | 'chapter';
  selectedChapter: string | null;
  titleOverride: string;
  authorOverride: string;

  // Progress
  progress: number;
  progressText: string;
  progressDetail: string;

  // Result
  outputPath: string | null;
  errorMessage: string | null;

  // Actions
  openDialog: (hasWorkspace: boolean) => void;
  closeDialog: () => void;
  selectWorkspace: (path: string) => void;
  setExportType: (type: ExportType) => void;
  setScope: (scope: 'workspace' | 'chapter', chapter?: string | null) => void;
  setTitleOverride: (title: string) => void;
  setAuthorOverride: (author: string) => void;
  startExport: (workspacePath: string) => Promise<void>;
  retry: () => void;
  reset: () => void;
}

const PROGRESS_STEPS = [
  { progress: 10, text: '清理临时文件...', detail: '清理 temp/' },
  { progress: 30, text: '启动导出引擎...', detail: '初始化导出流程' },
  { progress: 60, text: '生成输出文件...', detail: '处理 Markdown → HTML' },
  { progress: 85, text: '写入磁盘...', detail: '写入 dist/' },
  { progress: 100, text: '完成！', detail: '清理 temp/ 目录' },
] as const;

const initialState = {
  isDialogOpen: false,
  step: 'config' as ExportStep | 'pick-workspace',
  selectedWorkspacePath: null as string | null,
  exportType: 'chm' as ExportType,
  scope: 'workspace' as const,
  selectedChapter: null as string | null,
  titleOverride: '',
  authorOverride: '',
  progress: 0,
  progressText: '',
  progressDetail: '',
  outputPath: null as string | null,
  errorMessage: null as string | null,
};

export const useExportStore = create<ExportState>()((set, get) => ({
  ...initialState,

  openDialog: (hasWorkspace) => {
    set({
      ...initialState,
      isDialogOpen: true,
      step: hasWorkspace ? 'config' : 'pick-workspace',
    });
  },

  closeDialog: () => set(initialState),

  selectWorkspace: (path) => set({ selectedWorkspacePath: path, step: 'config' }),

  setExportType: (type) => set({ exportType: type }),

  setScope: (scope, chapter) => set({ scope, selectedChapter: chapter ?? null }),

  setTitleOverride: (title) => set({ titleOverride: title }),

  setAuthorOverride: (author) => set({ authorOverride: author }),

  startExport: async (workspacePath) => {
    const { exportType, scope, selectedChapter, titleOverride, authorOverride } = get();
    if (!workspacePath) return;

    // PDF: trigger browser print via Rust-generated HTML
    if (exportType === 'pdf') {
      const chapter = scope === 'chapter' ? selectedChapter : undefined;
      set({ step: 'progress', progress: 30, progressText: '生成 PDF 内容...', progressDetail: '' });
      try {
        const { exportPdfViaIpc } = await import('../services/exportService');
        await exportPdfViaIpc(workspacePath, chapter ?? undefined, titleOverride || undefined, authorOverride || undefined);
        set(initialState); // close dialog after print dialog appears
      } catch (e) {
        set({ step: 'error', errorMessage: e instanceof Error ? e.message : String(e) });
      }
      return;
    }

    set({ step: 'progress', progress: 0, progressText: '准备中...', progressDetail: '' });

    try {
      const chapter = scope === 'chapter' ? selectedChapter : undefined;
      const outputPath = `${workspacePath}/dist/${exportType}-v1`;

      const command = exportType === 'chm' ? 'export_chm' : 'export_nginx';

      // Start IPC call and progress animation in parallel
      let ipcDone = false;
      const ipcPromise = invokeIPC<string>(command, {
        workspacePath,
        outputPath,
        chapter,
        title: titleOverride || undefined,
        author: authorOverride || undefined,
      }).then((result) => {
        ipcDone = true;
        return result;
      });

      // Progress animation runs while IPC executes
      // Stops early if IPC completes before animation finishes
      const stepDelays = [400, 800, 1200, 600, 300];
      for (let i = 0; i < PROGRESS_STEPS.length - 1; i++) {
        if (ipcDone) break;
        await new Promise<void>((resolve) => setTimeout(resolve, stepDelays[i]));
        if (ipcDone) break;
        const s = PROGRESS_STEPS[i];
        set({ progress: s.progress, progressText: s.text, progressDetail: s.detail });
      }

      // Wait for IPC to complete (may already be done)
      const result = await ipcPromise;
      set({ progress: 100, progressText: '完成！', progressDetail: '清理 temp/ 目录' });
      set({ step: 'success', outputPath: result });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      set({ step: 'error', errorMessage: msg || '导出失败，请重试' });
    }
  },

  retry: () => set({ step: 'config', progress: 0, progressText: '', progressDetail: '', errorMessage: null }),

  reset: () => set(initialState),
}));
