import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useEditorStore } from '../../stores/editorStore';
import { useAutoSave } from '../../hooks/useAutoSave';
import { EmptyState } from './EmptyState';
import { MarkdownEditor } from './MarkdownEditor';
import { WhiteboardFullscreen } from '../whiteboard/WhiteboardFullscreen';

function EditorContent() {
  useAutoSave();

  const activeFilePath = useWorkspaceStore((s) => s.activeFilePath);
  const fileContent = useEditorStore((s) => s.fileContent);

  if (!activeFilePath || fileContent === null) return null;

  return <MarkdownEditor filePath={activeFilePath} content={fileContent} />;
}

export function EditorHost() {
  const { activeEditorType, rootPath, workspaceMeta } = useWorkspaceStore();

  if (activeEditorType === 'empty') {
    // No workspace open → show welcome/management page
    if (!rootPath) return <EmptyState />;

    // Workspace open but no file selected → show blank prompt
    return (
      <div className="welcome">
        <div style={{ fontSize: 32, opacity: 0.2 }}>📄</div>
        <div style={{ fontSize: 'var(--text-lg)', color: 'var(--main-text-secondary)', marginTop: 'var(--sp-2)' }}>
          {workspaceMeta?.title ?? 'Workspace'}
        </div>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--main-text-secondary)', marginTop: 'var(--sp-1)' }}>
          从左侧选择一个文件开始编辑
        </div>
      </div>
    );
  }

  if (activeEditorType === 'whiteboard') {
    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <WhiteboardFullscreen />
      </div>
    );
  }

  return (
    <div className="editor-area">
      <EditorContent />
    </div>
  );
}
