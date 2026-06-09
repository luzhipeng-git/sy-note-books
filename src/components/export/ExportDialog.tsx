import { useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useExportStore } from '../../stores/exportStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { openInFileManager, pickDirectory } from '../../services/dialogService';
import { invokeIPC } from '../../services/ipc';
import type { ExportType } from '../../types/export';

const EXPORT_CARDS: { type: ExportType; icon: string; title: string; desc: string }[] = [
  { type: 'chm', icon: '📘', title: 'CHM', desc: 'Windows 帮助文件' },
  { type: 'nginx', icon: '🌐', title: 'Nginx', desc: '静态网站目录' },
  { type: 'pdf', icon: '📄', title: 'PDF', desc: '当前文件打印' },
];

export function ExportDialog() {
  const isOpen = useExportStore((s) => s.isDialogOpen);
  const step = useExportStore((s) => s.step);
  const exportType = useExportStore((s) => s.exportType);
  const scope = useExportStore((s) => s.scope);
  const selectedChapter = useExportStore((s) => s.selectedChapter);
  const titleOverride = useExportStore((s) => s.titleOverride);
  const authorOverride = useExportStore((s) => s.authorOverride);
  const progress = useExportStore((s) => s.progress);
  const progressText = useExportStore((s) => s.progressText);
  const progressDetail = useExportStore((s) => s.progressDetail);
  const outputPath = useExportStore((s) => s.outputPath);
  const errorMessage = useExportStore((s) => s.errorMessage);

  const closeDialog = useExportStore((s) => s.closeDialog);
  const selectWorkspace = useExportStore((s) => s.selectWorkspace);
  const setExportType = useExportStore((s) => s.setExportType);
  const setScope = useExportStore((s) => s.setScope);
  const setTitleOverride = useExportStore((s) => s.setTitleOverride);
  const setAuthorOverride = useExportStore((s) => s.setAuthorOverride);
  const startExport = useExportStore((s) => s.startExport);
  const retry = useExportStore((s) => s.retry);

  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const fileTree = useWorkspaceStore((s) => s.fileTree);
  const workspaceMeta = useWorkspaceStore((s) => s.workspaceMeta);
  const recentWorkspaces = useSettingsStore((s) => s.recentWorkspaces);

  const selectedWorkspacePath = useExportStore((s) => s.selectedWorkspacePath);

  const handleStartExport = useCallback(() => {
    const path = rootPath ?? selectedWorkspacePath;
    if (path) startExport(path);
  }, [startExport, rootPath, selectedWorkspacePath]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) closeDialog();
    },
    [closeDialog],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeDialog();
      }
    },
    [closeDialog],
  );

  if (!isOpen) return null;

  // Determine whether this is a "no workspace open" flow
  const workspaceName = rootPath
    ? (workspaceMeta?.title ?? rootPath.split('/').pop())
    : null;

  return createPortal(
    <div className="export-overlay" onClick={handleBackdropClick}>
      <div className="export-dialog" onKeyDown={handleKeyDown}>

        {/* Step 0: Pick workspace (only when no workspace is open) */}
        {step === 'pick-workspace' && (
          <>
            <div className="export-header">
              <span className="export-title">📦 选择 Workspace 导出</span>
              <button className="export-close-btn" onClick={closeDialog}>✕</button>
            </div>

            {recentWorkspaces.length === 0 ? (
              <div className="export-pdf-hint">
                没有最近打开的 Workspace。请先打开一个 Workspace 再导出。
              </div>
            ) : (
              <div className="export-workspace-list">
                {recentWorkspaces.map((ws) => (
                  <button
                    key={ws.path}
                    className="export-workspace-item"
                    onClick={() => selectWorkspace(ws.path)}
                  >
                    <span className="export-workspace-icon">📂</span>
                    <div className="export-workspace-info">
                      <div className="export-workspace-name">{ws.title}</div>
                      <div className="export-workspace-path">{ws.path}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="export-actions">
              <button className="btn btn-ghost" onClick={closeDialog}>取消</button>
            </div>
          </>
        )}

        {/* Step 1: Config */}
        {step === 'config' && (
          <>
            <div className="export-header">
              <span className="export-title">📦 导出配置</span>
              <button className="export-close-btn" onClick={closeDialog}>✕</button>
            </div>

            {workspaceName && (
              <div className="export-workspace-badge">
                📂 {workspaceName}
              </div>
            )}

            <div className="export-cards">
              {EXPORT_CARDS.map((card) => (
                <button
                  key={card.type}
                  className={`export-card${exportType === card.type ? ' selected' : ''}`}
                  onClick={() => setExportType(card.type)}
                >
                  <div className="export-card-icon">{card.icon}</div>
                  <div className="export-card-title">{card.title}</div>
                  <div className="export-card-desc">{card.desc}</div>
                </button>
              ))}
            </div>

            {exportType !== 'pdf' ? (
              <>
                <div className="export-form-group">
                  <label className="export-label">导出范围</label>
                  <select
                    className="export-select"
                    value={scope === 'workspace' ? 'workspace' : selectedChapter ?? ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'workspace') {
                        setScope('workspace');
                      } else {
                        setScope('chapter', val);
                      }
                    }}
                  >
                    <option value="workspace">整个 Workspace</option>
                    {fileTree.map((folder) => (
                      <option key={folder.path} value={folder.path}>
                        {folder.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="export-form-group">
                  <label className="export-label">书名覆盖（可选）</label>
                  <input
                    className="export-input"
                    type="text"
                    placeholder="留空使用 workspace.json 中的书名"
                    value={titleOverride}
                    onChange={(e) => setTitleOverride(e.target.value)}
                  />
                </div>

                <div className="export-form-group">
                  <label className="export-label">作者覆盖（可选）</label>
                  <input
                    className="export-input"
                    type="text"
                    placeholder="留空使用 workspace.json 中的作者"
                    value={authorOverride}
                    onChange={(e) => setAuthorOverride(e.target.value)}
                  />
                </div>
              </>
            ) : (
              <div className="export-pdf-hint">
                将通过系统打印对话框导出当前文件为 PDF，支持选择纸张大小和边距。
              </div>
            )}

            <div className="export-actions">
              <button className="btn btn-ghost" onClick={closeDialog}>取消</button>
              <button className="btn btn-primary" onClick={handleStartExport}>
                {exportType === 'pdf' ? '导出 PDF' : '开始导出'}
              </button>
            </div>
          </>
        )}

        {/* Step 2: Progress */}
        {step === 'progress' && (
          <>
            <div className="export-header">
              <span className="export-title">正在导出...</span>
            </div>
            <div className="export-progress-bar">
              <div
                className="export-progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="export-progress-text">{progressText}</div>
            <div className="export-progress-detail">{progressDetail}</div>
          </>
        )}

        {/* Step 3: Success */}
        {step === 'success' && (
          <div className="export-result">
            <div className="export-result-icon">✅</div>
            <div className="export-result-title">导出成功</div>
            <div className="export-result-path">{outputPath ?? '未知路径'}</div>
            <div className="export-actions export-actions-center">
              <button className="btn btn-primary" onClick={async () => {
                if (!outputPath) return;
                const dst = await pickDirectory();
                if (!dst) return;
                try {
                  await invokeIPC('copy_export_output', { src: outputPath, dst });
                  openInFileManager(dst);
                } catch (e) {
                  alert(`复制失败：${e instanceof Error ? e.message : String(e)}`);
                }
              }}>另存为...</button>
              <button className="btn btn-secondary" onClick={() => {
                if (outputPath) {
                  // Open parent directory (e.g., workspace/dist/) since output dir may not exist yet
                  const parentDir = outputPath.replace(/[/\\][^/\\]+$/, '');
                  openInFileManager(parentDir || outputPath);
                }
              }}>
                打开文件夹
              </button>
              <button className="btn btn-ghost" onClick={closeDialog}>关闭</button>
            </div>
          </div>
        )}

        {/* Step 3b: Error */}
        {step === 'error' && (
          <div className="export-result">
            <div className="export-result-icon export-result-icon-error">❌</div>
            <div className="export-result-title export-result-title-error">导出失败</div>
            <div className="export-result-error-msg">{errorMessage}</div>
            <div className="export-actions export-actions-center">
              <button className="btn btn-primary" onClick={retry}>重试</button>
              <button className="btn btn-ghost" onClick={closeDialog}>关闭</button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
