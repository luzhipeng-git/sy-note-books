import { useEffect } from 'react';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useEditorStore } from '../../stores/editorStore';

const saveLabels: Record<string, string> = {
  idle: '',
  saving: '保存中...',
  saved: '✓ 已保存',
  failed: '⚠ 保存失败',
};

/** Auto-dismiss error message after 5 seconds. */
const ERROR_DISPLAY_MS = 5000;

export function StatusBar() {
  const activeEditorType = useWorkspaceStore((s) => s.activeEditorType);
  const cursorLine = useEditorStore((s) => s.cursorLine);
  const cursorColumn = useEditorStore((s) => s.cursorColumn);
  const saveStatus = useEditorStore((s) => s.saveStatus);
  const errorMessage = useWorkspaceStore((s) => s.errorMessage);
  const clearError = useWorkspaceStore((s) => s.clearError);

  // Auto-dismiss workspace errors after timeout
  useEffect(() => {
    if (!errorMessage) return;
    const timer = setTimeout(clearError, ERROR_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [errorMessage, clearError]);

  const editorLabel =
    activeEditorType === 'markdown'
      ? 'Markdown'
      : activeEditorType === 'whiteboard'
        ? 'Whiteboard'
        : 'Ready';

  return (
    <div className="status-bar">
      <span>{editorLabel}</span>
      <span>UTF-8</span>
      <div style={{ flex: 1 }} />
      {errorMessage && (
        <span
          style={{ color: 'var(--color-error, #e53e3e)', cursor: 'pointer' }}
          onClick={clearError}
          title="点击关闭"
        >
          ⚠ {errorMessage}
        </span>
      )}
      {!errorMessage && activeEditorType === 'markdown' && saveStatus !== 'idle' && (
        <span>{saveLabels[saveStatus]}</span>
      )}
      {activeEditorType === 'markdown' && (
        <span>
          行 {cursorLine}, 列 {cursorColumn}
        </span>
      )}
    </div>
  );
}
