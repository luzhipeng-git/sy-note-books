import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Breadcrumb } from './Breadcrumb';
import { useWorkspaceStore } from '../../stores/workspaceStore';

describe('Breadcrumb', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      activeFilePath: null,
      fileTree: [
        {
          name: '入门指南',
          path: '01-getting-started',
          type: 'folder',
          children: [
            { name: '快速开始', path: '01-getting-started/index.md', type: 'file' },
          ],
        },
        {
          name: '系统架构',
          path: '02-architecture',
          type: 'folder',
          children: [
            { name: '架构概览', path: '02-architecture/index.md', type: 'file' },
            { name: 'API 总览', path: '02-architecture/api-overview.md', type: 'file' },
          ],
        },
      ],
      workspaceMeta: { title: '我的文档', author: '', language: '', version: '', created: '' },
    });
  });

  it('returns null when no file is active', () => {
    const { container } = render(<Breadcrumb />);
    expect(container.firstChild).toBeNull();
  });

  it('shows workspace title and file name for sub-page', () => {
    useWorkspaceStore.setState({
      activeFilePath: '02-architecture/api-overview.md',
    });

    render(<Breadcrumb />);
    expect(screen.getByText('我的文档')).toBeDefined();
    expect(screen.getByText('系统架构')).toBeDefined();
    expect(screen.getByText('api-overview')).toBeDefined();
  });

  it('shows chapter name without duplication for index file', () => {
    useWorkspaceStore.setState({
      activeFilePath: '02-architecture/index.md',
    });

    render(<Breadcrumb />);
    // Should show: 我的文档 / 系统架构 (not "系统架构 / 系统架构")
    const text = screen.getByText('系统架构');
    expect(text.className).toContain('breadcrumb-current');
    // Should NOT show chapter name as a separate breadcrumb segment
    expect(screen.queryByText('系统架构', { selector: ':not(.breadcrumb-current)' })).toBeNull();
  });
});
