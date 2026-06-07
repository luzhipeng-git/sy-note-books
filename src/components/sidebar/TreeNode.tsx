import { useState } from 'react';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import type { FileTreeNode } from '../../types/workspace';
import { TreeNodeContextMenu } from './TreeNodeContextMenu';
import { InlineRename } from './InlineRename';

interface TreeNodeProps {
  node: FileTreeNode;
  depth: number;
}

export function TreeNode({ node, depth }: TreeNodeProps) {
  const { activeFilePath, expandedFolders, openFile, toggleFolder, renameNode, deleteNode, createPage } =
    useWorkspaceStore();
  const isFolder = node.type === 'folder';
  const isExpanded = expandedFolders.has(node.path);
  const isActive = !isFolder && activeFilePath === node.path;

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [newPageInput, setNewPageInput] = useState(false);

  const handleClick = () => {
    if (node.isMissing) return;
    if (isFolder) {
      toggleFolder(node.path);
    } else {
      openFile(node.path);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleRenameConfirm = (newTitle: string) => {
    setIsRenaming(false);
    renameNode(node.path, newTitle);
  };

  const handleDeleteConfirm = () => {
    setShowDeleteConfirm(false);
    deleteNode(node.path);
  };

  const handleNewPage = () => {
    setNewPageInput(true);
  };

  const handleNewPageConfirm = (title: string) => {
    setNewPageInput(false);
    createPage(node.path, title);
  };

  const indent = Array.from({ length: depth }, (_, i) => (
    <span key={i} className="tree-indent" />
  ));

  return (
    <>
      <div
        className={[
          'tree-item',
          isFolder ? 'folder' : '',
          isActive ? 'active' : '',
          node.isMissing ? 'missing' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onDoubleClick={() => {
          if (!node.isMissing && !isFolder) setIsRenaming(true);
        }}
        title={node.isMissing ? `文件缺失: ${node.path}` : undefined}
      >
        {indent}
        <span className="tree-icon">
          {isFolder ? (isExpanded ? '▼' : '▶') : '📄'}
        </span>
        {isRenaming ? (
          <InlineRename
            initialValue={node.name}
            onConfirm={handleRenameConfirm}
            onCancel={() => setIsRenaming(false)}
          />
        ) : (
          <span>{node.name}</span>
        )}
      </div>
      {isFolder && isExpanded && node.children?.map((child) => (
        <TreeNode key={child.path} node={child} depth={depth + 1} />
      ))}

      {/* New page inline input */}
      {newPageInput && isFolder && (
        <div className="tree-item" style={{ paddingLeft: (depth + 1) * 16 + 16 }}>
          <span className="tree-icon">📄</span>
          <InlineRename
            initialValue=""
            onConfirm={handleNewPageConfirm}
            onCancel={() => setNewPageInput(false)}
          />
        </div>
      )}

      {contextMenu && (
        <TreeNodeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          isFolder={isFolder}
          onNewPage={isFolder ? handleNewPage : undefined}
          onRename={() => setIsRenaming(true)}
          onDelete={() => setShowDeleteConfirm(true)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {showDeleteConfirm && (
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
        >
          <div
            style={{
              width: 360,
              padding: 'var(--sp-6)',
              background: 'var(--surface-1)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,.25)',
            }}
          >
            <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, marginBottom: 'var(--sp-2)' }}>
              确认删除
            </h3>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--main-text-secondary)', marginBottom: 'var(--sp-5)' }}>
              确定要删除「{node.name}」吗？{isFolder ? '将删除文件夹及所有内容。' : ''}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)' }}>
              <button className="btn btn-secondary" onClick={() => setShowDeleteConfirm(false)}>
                取消
              </button>
              <button
                className="btn"
                style={{ background: 'var(--accent-red)', color: 'white' }}
                onClick={handleDeleteConfirm}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
