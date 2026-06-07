import { useState } from 'react';

interface CreateWorkspaceDialogProps {
  onSubmit: (path: string, title: string, author: string) => void;
  onCancel: () => void;
}

export function CreateWorkspaceDialog({ onSubmit, onCancel }: CreateWorkspaceDialogProps) {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [path, setPath] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !path.trim()) return;
    onSubmit(path.trim(), title.trim(), author.trim() || '未知');
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.5)',
      }}
      onClick={onCancel}
    >
      <div
        className="modal-card"
        style={{
          width: 420,
          padding: 'var(--sp-6)',
          background: 'var(--bg-primary)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,.25)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          style={{
            fontSize: 'var(--text-lg)',
            fontWeight: 600,
            marginBottom: 'var(--sp-4)',
          }}
        >
          新建 Workspace
        </h3>

        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}
        >
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 'var(--text-sm)',
                fontWeight: 500,
                marginBottom: 'var(--sp-1)',
              }}
            >
              名称 *
            </label>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="我的技术文档"
              autoFocus
            />
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: 'var(--text-sm)',
                fontWeight: 500,
                marginBottom: 'var(--sp-1)',
              }}
            >
              作者
            </label>
            <input
              className="input"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="张三"
            />
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: 'var(--text-sm)',
                fontWeight: 500,
                marginBottom: 'var(--sp-1)',
              }}
            >
              保存路径 *
            </label>
            <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
              <input
                className="input"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/home/user/my-docs"
                style={{ flex: 1 }}
              />
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 'var(--sp-2)',
              marginTop: 'var(--sp-4)',
            }}
          >
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              取消
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!title.trim() || !path.trim()}
            >
              创建
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
