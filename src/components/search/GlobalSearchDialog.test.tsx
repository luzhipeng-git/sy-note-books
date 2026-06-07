import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GlobalSearchDialog } from './GlobalSearchDialog';
import { useSearchStore } from '../../stores/searchStore';

describe('GlobalSearchDialog', () => {
  beforeEach(() => {
    useSearchStore.getState().reset();
  });

  it('does not render when dialog is closed', () => {
    render(<GlobalSearchDialog />);
    expect(screen.queryByPlaceholderText('搜索全部文档...')).toBeNull();
  });

  it('renders search input when dialog is open', () => {
    useSearchStore.getState().openGlobalSearch();
    render(<GlobalSearchDialog />);

    expect(screen.getByPlaceholderText('搜索全部文档...')).toBeDefined();
  });

  it('renders filter tabs', () => {
    useSearchStore.getState().openGlobalSearch();
    render(<GlobalSearchDialog />);

    expect(screen.getByText('全部')).toBeDefined();
    expect(screen.getByText('文件名')).toBeDefined();
    expect(screen.getByText('内容')).toBeDefined();
  });

  it('shows empty state when query has no results', () => {
    useSearchStore.setState({
      isGlobalSearchOpen: true,
      globalSearchQuery: 'xyz',
      globalSearchResults: [],
    });
    render(<GlobalSearchDialog />);

    expect(screen.getByText('未找到匹配内容')).toBeDefined();
  });

  it('shows results list with title and breadcrumb', () => {
    useSearchStore.setState({
      isGlobalSearchOpen: true,
      globalSearchQuery: 'API',
      globalSearchResults: [
        {
          path: '02-arch/api.md',
          title: 'API 总览',
          chapterName: '架构',
          breadcrumb: '架构 > API 总览',
          snippet: '所有 API 请求需要认证',
          matchStart: 0,
          score: 1,
        },
      ],
    });
    render(<GlobalSearchDialog />);

    expect(screen.getByText('API 总览')).toBeDefined();
    expect(screen.getByText('架构 > API 总览')).toBeDefined();
  });

  it('shows overflow message when 7+ results', () => {
    const results = Array.from({ length: 7 }, (_, i) => ({
      path: `doc-${i}.md`,
      title: `文档 ${i}`,
      chapterName: '章节',
      breadcrumb: `章节 > 文档 ${i}`,
      snippet: '',
      matchStart: 0,
      score: 1,
    }));

    useSearchStore.setState({
      isGlobalSearchOpen: true,
      globalSearchQuery: '文档',
      globalSearchResults: results,
    });
    render(<GlobalSearchDialog />);

    expect(screen.getByText(/仅显示前 7 个/)).toBeDefined();
  });

  it('closes on ESC key', () => {
    useSearchStore.getState().openGlobalSearch();
    render(<GlobalSearchDialog />);

    const input = screen.getByPlaceholderText('搜索全部文档...');
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(useSearchStore.getState().isGlobalSearchOpen).toBe(false);
  });

  it('updates query on input change', () => {
    useSearchStore.getState().openGlobalSearch();
    render(<GlobalSearchDialog />);

    const input = screen.getByPlaceholderText('搜索全部文档...');
    fireEvent.change(input, { target: { value: '架构' } });

    expect(useSearchStore.getState().globalSearchQuery).toBe('架构');
  });

  it('switches filter tab on click', () => {
    useSearchStore.getState().openGlobalSearch();
    render(<GlobalSearchDialog />);

    fireEvent.click(screen.getByText('文件名'));
    expect(useSearchStore.getState().globalSearchFilter).toBe('filename');
  });
});
