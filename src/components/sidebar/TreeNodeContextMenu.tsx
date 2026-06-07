import { useEffect, useRef } from 'react';

interface TreeNodeContextMenuProps {
  x: number;
  y: number;
  isFolder: boolean;
  onNewPage?: () => void;
  onRename: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function TreeNodeContextMenu({
  x,
  y,
  isFolder,
  onNewPage,
  onRename,
  onDelete,
  onClose,
}: TreeNodeContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: x,
        top: y,
        zIndex: 100,
        background: 'var(--surface-1)',
        border: '1px solid var(--main-border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-lg)',
        padding: 'var(--sp-1) 0',
        minWidth: 140,
      }}
    >
      {isFolder && onNewPage && (
        <button
          className="context-menu-item"
          onClick={() => {
            onNewPage();
            onClose();
          }}
        >
          新建子页面
        </button>
      )}
      <button
        className="context-menu-item"
        onClick={() => {
          onRename();
          onClose();
        }}
      >
        重命名
      </button>
      <button
        className="context-menu-item"
        style={{ color: 'var(--accent-red)' }}
        onClick={() => {
          onDelete();
          onClose();
        }}
      >
        删除
      </button>
    </div>
  );
}
