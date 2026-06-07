import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TreeNode } from './TreeNode';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import type { FileTreeNode } from '../../types/workspace';

describe('TreeNode', () => {
  const mockFolder: FileTreeNode = {
    name: '入门指南',
    path: '01-getting-started',
    type: 'folder',
    children: [
      { name: '快速开始', path: '01-getting-started/index.md', type: 'file' },
      { name: '安装', path: '01-getting-started/install.md', type: 'file' },
    ],
  };

  const mockFile: FileTreeNode = {
    name: 'API 总览',
    path: '02-architecture/api-overview.md',
    type: 'file',
  };

  const mockMissing: FileTreeNode = {
    name: '缺失文件',
    path: '99-missing/lost.md',
    type: 'file',
    isMissing: true,
  };

  beforeEach(() => {
    useWorkspaceStore.setState({
      activeFilePath: null,
      expandedFolders: new Set(),
    });
  });

  it('renders folder name', () => {
    render(<TreeNode node={mockFolder} depth={0} />);
    expect(screen.getByText('入门指南')).toBeDefined();
  });

  it('renders file name', () => {
    render(<TreeNode node={mockFile} depth={0} />);
    expect(screen.getByText('API 总览')).toBeDefined();
  });

  it('toggles folder on click', () => {
    render(<TreeNode node={mockFolder} depth={0} />);
    const folder = screen.getByText('入门指南').closest('.tree-item')!;
    fireEvent.click(folder);

    const state = useWorkspaceStore.getState();
    expect(state.expandedFolders.has('01-getting-started')).toBe(true);
  });

  it('shows children when expanded', () => {
    useWorkspaceStore.setState({
      expandedFolders: new Set(['01-getting-started']),
    });

    render(<TreeNode node={mockFolder} depth={0} />);
    expect(screen.getByText('快速开始')).toBeDefined();
    expect(screen.getByText('安装')).toBeDefined();
  });

  it('hides children when collapsed', () => {
    useWorkspaceStore.setState({
      expandedFolders: new Set(),
    });

    render(<TreeNode node={mockFolder} depth={0} />);
    expect(screen.queryByText('快速开始')).toBeNull();
  });

  it('applies active class to active file', () => {
    useWorkspaceStore.setState({
      activeFilePath: '02-architecture/api-overview.md',
    });

    render(<TreeNode node={mockFile} depth={0} />);
    const item = screen.getByText('API 总览').closest('.tree-item')!;
    expect(item.className).toContain('active');
  });

  it('applies missing class and prevents click', () => {
    render(<TreeNode node={mockMissing} depth={0} />);
    const item = screen.getByText('缺失文件').closest('.tree-item')!;
    expect(item.className).toContain('missing');

    fireEvent.click(item);
    // openFile should not have been called — activeFilePath stays null
    expect(useWorkspaceStore.getState().activeFilePath).toBeNull();
  });

  it('indents children based on depth', () => {
    useWorkspaceStore.setState({
      expandedFolders: new Set(['01-getting-started']),
    });

    const { container } = render(<TreeNode node={mockFolder} depth={0} />);
    const indents = container.querySelectorAll('.tree-indent');
    // Children at depth 1 should have 1 indent each
    expect(indents.length).toBe(2);
  });
});
