import { describe, it, expect, beforeEach } from 'vitest';
import { useSearchStore } from './searchStore';

describe('searchStore', () => {
  beforeEach(() => {
    useSearchStore.getState().reset();
  });

  describe('initial state', () => {
    it('has correct initial state', () => {
      const state = useSearchStore.getState();
      expect(state.searchIndex).toBeNull();
      expect(state.isIndexReady).toBe(false);
      expect(state.documents.size).toBe(0);
      expect(state.isGlobalSearchOpen).toBe(false);
      expect(state.globalSearchQuery).toBe('');
      expect(state.globalSearchResults).toEqual([]);
      expect(state.globalSearchFilter).toBe('all');
      expect(state.selectedResultIndex).toBe(0);
      expect(state.isDocumentSearchOpen).toBe(false);
    });
  });

  describe('global search UI', () => {
    it('opens and closes global search', () => {
      useSearchStore.getState().openGlobalSearch();
      expect(useSearchStore.getState().isGlobalSearchOpen).toBe(true);

      useSearchStore.getState().closeGlobalSearch();
      expect(useSearchStore.getState().isGlobalSearchOpen).toBe(false);
      expect(useSearchStore.getState().globalSearchQuery).toBe('');
      expect(useSearchStore.getState().globalSearchResults).toEqual([]);
    });

    it('sets global search query', () => {
      useSearchStore.getState().setGlobalSearchQuery('test query');
      expect(useSearchStore.getState().globalSearchQuery).toBe('test query');
    });

    it('sets global search filter', () => {
      useSearchStore.getState().setGlobalSearchFilter('filename');
      expect(useSearchStore.getState().globalSearchFilter).toBe('filename');
    });
  });

  describe('document search UI', () => {
    it('opens and closes document search', () => {
      useSearchStore.getState().openDocumentSearch();
      expect(useSearchStore.getState().isDocumentSearchOpen).toBe(true);

      useSearchStore.getState().closeDocumentSearch();
      expect(useSearchStore.getState().isDocumentSearchOpen).toBe(false);
    });
  });

  describe('result navigation', () => {
    it('selects next result (wraps around)', () => {
      const state = useSearchStore.getState();
      // Manually set results for testing navigation
      useSearchStore.setState({
        globalSearchResults: [
          { path: 'a.md', title: 'A', chapterName: '', breadcrumb: '', snippet: '', matchStart: 0, score: 1 },
          { path: 'b.md', title: 'B', chapterName: '', breadcrumb: '', snippet: '', matchStart: 0, score: 1 },
          { path: 'c.md', title: 'C', chapterName: '', breadcrumb: '', snippet: '', matchStart: 0, score: 1 },
        ],
        selectedResultIndex: 0,
      });

      useSearchStore.getState().selectNextResult();
      expect(useSearchStore.getState().selectedResultIndex).toBe(1);

      useSearchStore.getState().selectNextResult();
      expect(useSearchStore.getState().selectedResultIndex).toBe(2);

      // Wrap around
      useSearchStore.getState().selectNextResult();
      expect(useSearchStore.getState().selectedResultIndex).toBe(0);
    });

    it('selects previous result (wraps around)', () => {
      useSearchStore.setState({
        globalSearchResults: [
          { path: 'a.md', title: 'A', chapterName: '', breadcrumb: '', snippet: '', matchStart: 0, score: 1 },
          { path: 'b.md', title: 'B', chapterName: '', breadcrumb: '', snippet: '', matchStart: 0, score: 1 },
        ],
        selectedResultIndex: 0,
      });

      // Wrap around backwards
      useSearchStore.getState().selectPrevResult();
      expect(useSearchStore.getState().selectedResultIndex).toBe(1);

      useSearchStore.getState().selectPrevResult();
      expect(useSearchStore.getState().selectedResultIndex).toBe(0);
    });

    it('does nothing with empty results', () => {
      useSearchStore.setState({ globalSearchResults: [], selectedResultIndex: 0 });
      useSearchStore.getState().selectNextResult();
      expect(useSearchStore.getState().selectedResultIndex).toBe(0);
      useSearchStore.getState().selectPrevResult();
      expect(useSearchStore.getState().selectedResultIndex).toBe(0);
    });
  });

  describe('reset', () => {
    it('resets all state to initial values', () => {
      useSearchStore.setState({
        isGlobalSearchOpen: true,
        globalSearchQuery: 'test',
        isDocumentSearchOpen: true,
      });

      useSearchStore.getState().reset();

      const state = useSearchStore.getState();
      expect(state.searchIndex).toBeNull();
      expect(state.isIndexReady).toBe(false);
      expect(state.isGlobalSearchOpen).toBe(false);
      expect(state.globalSearchQuery).toBe('');
      expect(state.isDocumentSearchOpen).toBe(false);
    });
  });
});
