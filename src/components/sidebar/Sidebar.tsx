import { useState } from 'react';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { TreeNode } from './TreeNode';

interface SidebarProps {
  collapsed?: boolean;
}

export function Sidebar({ collapsed = false }: SidebarProps) {
  const { workspaceMeta, fileTree, createChapter, closeWorkspace } = useWorkspaceStore();
  const { toggleSidebarCollapse } = useSettingsStore();
  const [showNewChapter, setShowNewChapter] = useState(false);
  const [newChapterTitle, setNewChapterTitle] = useState('');

  const pageCount = fileTree.reduce((acc, f) => acc + (f.children?.length ?? 0), 0);

  const handleCreateChapter = () => {
    if (newChapterTitle.trim()) {
      createChapter(newChapterTitle.trim());
      setNewChapterTitle('');
      setShowNewChapter(false);
    }
  };

  if (collapsed) {
    return (
      <div className="sidebar sidebar-collapsed">
        <div className="sidebar-collapsed-icons">
          <button className="sidebar-btn" title="展开侧边栏" onClick={toggleSidebarCollapse}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
          <button className="sidebar-btn" title="返回 Workspace 管理" onClick={closeWorkspace}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M2 12h20" />
              <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
            </svg>
          </button>
          <div style={{ width: '100%', height: 1, background: 'rgba(255,255,255,0.08)', margin: 'var(--sp-1) 0' }} />
          {fileTree.slice(0, 5).map((node) => (
            <div key={node.path} className="sidebar-collapsed-icon" title={node.name}>
              📁
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <button
          className="sidebar-btn"
          title="收起侧边栏"
          onClick={toggleSidebarCollapse}
          style={{ marginRight: 'var(--sp-1)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span>{workspaceMeta?.title ?? '书昀笔记'}</span>
        <div className="sidebar-actions">
          <button
            className="sidebar-btn"
            title="新建章节"
            onClick={() => setShowNewChapter(true)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <button
            className="sidebar-btn"
            title="返回 Workspace 管理"
            onClick={closeWorkspace}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M2 12h20" />
              <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
            </svg>
          </button>
        </div>
      </div>

      {showNewChapter && (
        <div style={{ padding: 'var(--sp-2) var(--sp-4)' }}>
          <input
            className="inline-rename-input"
            value={newChapterTitle}
            onChange={(e) => setNewChapterTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateChapter();
              if (e.key === 'Escape') { setShowNewChapter(false); setNewChapterTitle(''); }
            }}
            onBlur={() => {
              if (newChapterTitle.trim()) handleCreateChapter();
              else { setShowNewChapter(false); setNewChapterTitle(''); }
            }}
            placeholder="章节标题"
            autoFocus
          />
        </div>
      )}
      <div className="file-tree">
        {fileTree.map((node) => (
          <TreeNode key={node.path} node={node} depth={0} />
        ))}
      </div>
      <div className="sidebar-footer">
        {fileTree.length} 章 · {pageCount} 页
      </div>
    </div>
  );
}
