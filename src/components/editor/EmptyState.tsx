import { useState } from 'react';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { CreateWorkspaceDialog } from '../dialogs/CreateWorkspaceDialog';
import { pickDirectory } from '../../services/dialogService';

export function EmptyState() {
  const { openWorkspace, createWorkspace } = useWorkspaceStore();
  const { recentWorkspaces, removeRecentWorkspace } = useSettingsStore();
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const handleCreateSubmit = (path: string, title: string, author: string) => {
    createWorkspace(path, title, author);
    setShowCreateDialog(false);
  };

  return (
    <div className="welcome">
      <div style={{ fontSize: 48, opacity: 0.15 }}>📓</div>
      <div className="welcome-title">书昀笔记电子书</div>
      <div className="welcome-subtitle">面向技术写作者的桌面笔记应用</div>

      <div style={{ display: 'flex', gap: 'var(--sp-3)', marginTop: 'var(--sp-4)' }}>
        <button className="btn btn-primary" onClick={() => setShowCreateDialog(true)}>
          新建 Workspace
        </button>
        <button className="btn btn-secondary" onClick={async () => {
          const selected = await pickDirectory();
          if (selected) openWorkspace(selected);
        }}>
          打开文件夹
        </button>
      </div>

      {recentWorkspaces.length > 0 && (
        <div style={{ marginTop: 'var(--sp-8)', width: 320 }}>
          <div
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              color: 'var(--main-text-secondary)',
              marginBottom: 'var(--sp-2)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            最近打开
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}>
            {recentWorkspaces.map((item) => (
              <div key={item.path} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-1)' }}>
                <button
                  className="btn btn-ghost"
                  style={{ justifyContent: 'flex-start', width: '100%', flex: 1, minWidth: 0 }}
                  onClick={() => openWorkspace(item.path)}
                >
                  <span style={{ fontSize: 14 }}>📂</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                  <span
                    style={{
                      marginLeft: 'auto',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--main-text-secondary)',
                      flexShrink: 0,
                    }}
                  >
                    {item.path}
                  </span>
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ padding: '2px 6px', fontSize: 'var(--text-xs)', color: 'var(--main-text-secondary)', flexShrink: 0 }}
                  title="移除此记录"
                  onClick={(e) => { e.stopPropagation(); removeRecentWorkspace(item.path); }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dev mode: quick open mock workspace */}
      <div style={{ marginTop: 'var(--sp-4)', fontSize: 'var(--text-xs)', color: 'var(--main-text-secondary)', opacity: 0.6 }}>
        开发模式：点击上方「打开文件夹」输入任意路径（如 /mock）即可进入模拟 Workspace
      </div>

      <div
        style={{
          marginTop: 'var(--sp-8)',
          display: 'flex',
          gap: 'var(--sp-6)',
          fontSize: 'var(--text-xs)',
          color: 'var(--main-text-secondary)',
        }}
      >
        <span>
          <span className="shortcut-tag">Ctrl+Shift+F</span> 全局搜索
        </span>
        <span>
          <span className="shortcut-tag">Ctrl+Shift+D</span> 白板画图
        </span>
        <span>
          <span className="shortcut-tag">Ctrl+P</span> 导出 PDF
        </span>
      </div>

      {showCreateDialog && (
        <CreateWorkspaceDialog
          onSubmit={handleCreateSubmit}
          onCancel={() => setShowCreateDialog(false)}
        />
      )}
    </div>
  );
}
