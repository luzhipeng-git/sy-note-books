import { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useSearchStore } from '../../stores/searchStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import type { SearchFilter } from '../../services/searchService';

const MAX_RESULTS = 7;

function highlightSnippet(snippet: string, query: string): React.ReactNode {
  if (!query || !snippet) return snippet;

  const lowerSnippet = snippet.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerSnippet.indexOf(lowerQuery);

  if (idx === -1) return snippet;

  const before = snippet.slice(0, idx);
  const match = snippet.slice(idx, idx + query.length);
  const after = snippet.slice(idx + query.length);

  return (
    <>
      {before}
      <mark className="search-highlight">{match}</mark>
      {after}
    </>
  );
}

export function GlobalSearchDialog() {
  const isOpen = useSearchStore((s) => s.isGlobalSearchOpen);
  const query = useSearchStore((s) => s.globalSearchQuery);
  const results = useSearchStore((s) => s.globalSearchResults);
  const filter = useSearchStore((s) => s.globalSearchFilter);
  const selectedIndex = useSearchStore((s) => s.selectedResultIndex);

  const closeGlobalSearch = useSearchStore((s) => s.closeGlobalSearch);
  const setQuery = useSearchStore((s) => s.setGlobalSearchQuery);
  const setFilter = useSearchStore((s) => s.setGlobalSearchFilter);
  const executeSearch = useSearchStore((s) => s.executeGlobalSearch);
  const selectNext = useSearchStore((s) => s.selectNextResult);
  const selectPrev = useSearchStore((s) => s.selectPrevResult);
  const openFile = useWorkspaceStore((s) => s.openFile);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Auto-focus input when dialog opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Debounced search on query change
  const handleInputChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        useSearchStore.getState().executeGlobalSearch();
      }, 200);
    },
    [setQuery],
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectNext();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectPrev();
      } else if (e.key === 'Enter' && results.length > 0) {
        e.preventDefault();
        const selected = results[selectedIndex];
        if (selected) {
          openFile(selected.path);
          closeGlobalSearch();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeGlobalSearch();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const filters: SearchFilter[] = ['all', 'filename', 'content'];
        const currentIdx = filters.indexOf(filter);
        const nextFilter = filters[(currentIdx + 1) % filters.length];
        setFilter(nextFilter);
      }
    },
    [results, selectedIndex, filter, selectNext, selectPrev, openFile, closeGlobalSearch, setFilter],
  );

  // Click backdrop to close
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        closeGlobalSearch();
      }
    },
    [closeGlobalSearch],
  );

  // Handle result click
  const handleResultClick = useCallback(
    (path: string) => {
      openFile(path);
      closeGlobalSearch();
    },
    [openFile, closeGlobalSearch],
  );

  if (!isOpen) return null;

  const hasOverflow = results.length >= MAX_RESULTS;

  return createPortal(
    <div className="global-search-overlay" onClick={handleBackdropClick}>
      <div className="global-search-dialog" onKeyDown={handleKeyDown}>
        {/* Search input */}
        <div className="global-search-header">
          <svg
            className="global-search-icon"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="global-search-input"
            placeholder="搜索全部文档..."
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
          />
          <div className="global-search-tabs">
            {(['all', 'filename', 'content'] as const).map((f) => (
              <button
                key={f}
                className={`global-search-tab${filter === f ? ' active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? '全部' : f === 'filename' ? '文件名' : '内容'}
              </button>
            ))}
          </div>
          <span className="global-search-shortcut">Ctrl+Shift+F</span>
        </div>

        {/* Results */}
        <div className="global-search-results">
          {query && results.length === 0 && (
            <div className="global-search-empty">未找到匹配内容</div>
          )}
          {results.map((result, idx) => (
            <div
              key={`${result.path}-${idx}`}
              className={`global-search-result${idx === selectedIndex ? ' selected' : ''}`}
              onClick={() => handleResultClick(result.path)}
              onMouseEnter={() =>
                useSearchStore.getState().setSelectedIndex(idx)
              }
            >
              <div className="global-search-result-title">{result.title}</div>
              {result.breadcrumb && (
                <div className="global-search-result-breadcrumb">{result.breadcrumb}</div>
              )}
              {result.snippet && (
                <div className="global-search-result-snippet">
                  {highlightSnippet(result.snippet, query)}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="global-search-footer">
          {results.length > 0 && (
            <span>
              找到 {results.length} 个结果{hasOverflow ? '（仅显示前 7 个，输入更精确的关键词缩小范围）' : ''}
            </span>
          )}
          <span className="global-search-footer-hints">↑↓ 导航 · Enter 打开 · ESC 关闭 · Tab 切换范围</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
