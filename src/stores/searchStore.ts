import { create } from 'zustand';
import MiniSearch from 'minisearch';
import { invokeIPC } from '../services/ipc';
import {
  createSearchIndex,
  documentsFromMdFiles,
  performSearch,
  extractTitle,
  buildBreadcrumb,
} from '../services/searchService';
import type { SearchDocument, SearchResult, SearchFilter } from '../services/searchService';
import type { SummaryNode } from '../types/workspace';

interface SearchState {
  // Index
  searchIndex: MiniSearch<SearchDocument> | null;
  isIndexReady: boolean;
  documents: Map<string, SearchDocument>;

  // Global search UI
  isGlobalSearchOpen: boolean;
  globalSearchQuery: string;
  globalSearchResults: SearchResult[];
  globalSearchFilter: SearchFilter;
  selectedResultIndex: number;

  // Document search UI
  isDocumentSearchOpen: boolean;

  // Actions — index lifecycle
  buildIndex: (workspacePath: string, summary: SummaryNode[]) => Promise<void>;
  updateDocument: (path: string, content: string, summary: SummaryNode[]) => void;
  removeDocument: (path: string) => void;

  // Actions — global search
  openGlobalSearch: () => void;
  closeGlobalSearch: () => void;
  setGlobalSearchQuery: (query: string) => void;
  setGlobalSearchFilter: (filter: SearchFilter) => void;
  executeGlobalSearch: () => void;
  selectNextResult: () => void;
  selectPrevResult: () => void;
  setSelectedIndex: (index: number) => void;

  // Actions — document search
  openDocumentSearch: () => void;
  closeDocumentSearch: () => void;

  // Actions — reset
  reset: () => void;
}

const initialState = {
  searchIndex: null as MiniSearch<SearchDocument> | null,
  isIndexReady: false,
  documents: new Map<string, SearchDocument>(),

  isGlobalSearchOpen: false,
  globalSearchQuery: '',
  globalSearchResults: [] as SearchResult[],
  globalSearchFilter: 'all' as SearchFilter,
  selectedResultIndex: 0,

  isDocumentSearchOpen: false,
};

export const useSearchStore = create<SearchState>()((set, get) => ({
  ...initialState,

  buildIndex: async (workspacePath: string, summary: SummaryNode[]) => {
    try {
      const files = await invokeIPC<Array<{ path: string; content: string }>>('read_all_md_files', {
        workspacePath,
      });

      const docs = documentsFromMdFiles(files, summary);
      const index = createSearchIndex();
      index.addAll(docs);

      const docMap = new Map<string, SearchDocument>();
      docs.forEach((d) => docMap.set(d.id, d));

      set({
        searchIndex: index,
        isIndexReady: true,
        documents: docMap,
      });
    } catch (error) {
      console.error('[searchStore] Failed to build search index:', error);
      set({ isIndexReady: false });
    }
  },

  updateDocument: (path: string, content: string, summary: SummaryNode[]) => {
    const { searchIndex, documents } = get();
    if (!searchIndex) return;

    const existing = documents.get(path);

    const doc: SearchDocument = {
      id: path,
      title: extractTitle(content),
      chapterName: existing?.chapterName ?? '',
      breadcrumb: buildBreadcrumb(path, summary),
      content,
      path,
    };

    try {
      if (existing) {
        searchIndex.replace(doc);
      } else {
        searchIndex.add(doc);
      }
    } catch {
      // If replace fails, try delete+add
      try { searchIndex.discard(path); } catch { /* ignore */ }
      try { searchIndex.add(doc); } catch { /* ignore */ }
    }

    const nextDocs = new Map(documents);
    nextDocs.set(path, doc);
    set({ documents: nextDocs });
  },

  removeDocument: (path: string) => {
    const { searchIndex, documents } = get();
    if (!searchIndex) return;

    try {
      searchIndex.discard(path);
    } catch { /* ignore */ }

    const nextDocs = new Map(documents);
    nextDocs.delete(path);
    set({ documents: nextDocs });
  },

  openGlobalSearch: () => set({ isGlobalSearchOpen: true }),
  closeGlobalSearch: () =>
    set({
      isGlobalSearchOpen: false,
      globalSearchQuery: '',
      globalSearchResults: [],
      selectedResultIndex: 0,
      globalSearchFilter: 'all',
    }),

  setSelectedIndex: (index) => set({ selectedResultIndex: index }),

  setGlobalSearchQuery: (query) => set({ globalSearchQuery: query }),

  setGlobalSearchFilter: (filter) => {
    set({ globalSearchFilter: filter });
    // Re-execute search with new filter
    get().executeGlobalSearch();
  },

  executeGlobalSearch: () => {
    const { searchIndex, documents, globalSearchQuery, globalSearchFilter } = get();
    if (!searchIndex || !globalSearchQuery.trim()) {
      set({ globalSearchResults: [], selectedResultIndex: 0 });
      return;
    }

    const results = performSearch(searchIndex, documents, globalSearchQuery, globalSearchFilter);
    set({ globalSearchResults: results, selectedResultIndex: 0 });
  },

  selectNextResult: () => {
    const { selectedResultIndex, globalSearchResults } = get();
    if (globalSearchResults.length === 0) return;
    const next = (selectedResultIndex + 1) % globalSearchResults.length;
    set({ selectedResultIndex: next });
  },

  selectPrevResult: () => {
    const { selectedResultIndex, globalSearchResults } = get();
    if (globalSearchResults.length === 0) return;
    const prev = selectedResultIndex === 0 ? globalSearchResults.length - 1 : selectedResultIndex - 1;
    set({ selectedResultIndex: prev });
  },

  openDocumentSearch: () => set({ isDocumentSearchOpen: true }),
  closeDocumentSearch: () => set({ isDocumentSearchOpen: false }),

  reset: () => set(initialState),
}));
