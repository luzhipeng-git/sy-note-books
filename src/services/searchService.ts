import MiniSearch from 'minisearch';
import type { SummaryNode } from '../types/workspace';

// === Types ===

export interface SearchDocument {
  id: string;
  title: string;
  chapterName: string;
  breadcrumb: string;
  content: string;
  path: string;
}

export interface SearchResult {
  path: string;
  title: string;
  chapterName: string;
  breadcrumb: string;
  snippet: string;
  matchStart: number;
  score: number;
}

export type SearchFilter = 'all' | 'filename' | 'content';

// === Chinese Segmentation ===

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const IntlAny = Intl as any;
const hasSegmenter = typeof Intl !== 'undefined' && typeof IntlAny.Segmenter !== 'undefined';

/**
 * Tokenize text for MiniSearch. Combines Intl.Segmenter for Chinese
 * with whitespace splitting for Latin text.
 */
export function tokenizeForSearch(text: string): string[] {
  const tokens: string[] = [];

  if (hasSegmenter) {
    const segmenter = new IntlAny.Segmenter('zh-CN', { granularity: 'word' });
    for (const seg of segmenter.segment(text)) {
      const trimmed = seg.segment.trim();
      if (trimmed && seg.isWordLike) {
        tokens.push(trimmed.toLowerCase());
      }
    }
  } else {
    // Fallback: split on whitespace and punctuation, keep Chinese chars individually
    const parts = text.split(/[\s\p{P}]+/u).filter(Boolean);
    for (const part of parts) {
      if (/[一-鿿]/.test(part)) {
        // Split Chinese into individual characters as fallback
        for (const char of part) {
          tokens.push(char.toLowerCase());
        }
      } else {
        tokens.push(part.toLowerCase());
      }
    }
  }

  return tokens;
}

// === Content Extraction ===

/**
 * Extract the first `# heading` from markdown content.
 */
export function extractTitle(content: string): string {
  for (const line of content.split('\n')) {
    const match = line.trim().match(/^#{1,6}\s+(.+)/);
    if (match) return match[1].trim();
  }
  return '';
}

/**
 * Build a breadcrumb path from a file path and the summary tree.
 * Returns "章节名 > 页面名" or just "页面名" if no parent chapter found.
 */
export function buildBreadcrumb(filePath: string, summary: SummaryNode[]): string {
  // Find the chapter that contains this file
  for (const chapter of summary) {
    const chapterDir = chapter.path.replace(/\/index\.md$/, '');
    if (filePath.startsWith(chapterDir + '/') || filePath === chapter.path) {
      // It's in this chapter
      if (filePath === chapter.path) {
        return chapter.title;
      }
      // Find the child page title
      for (const child of chapter.children ?? []) {
        if (child.path === filePath) {
          return `${chapter.title} > ${child.title}`;
        }
      }
      // File in chapter dir but not in SUMMARY
      return chapter.title;
    }
  }
  return '';
}

/**
 * Extract chapter name from file path and summary tree.
 */
function extractChapterName(filePath: string, summary: SummaryNode[]): string {
  for (const chapter of summary) {
    const chapterDir = chapter.path.replace(/\/index\.md$/, '');
    if (filePath.startsWith(chapterDir + '/') || filePath === chapter.path) {
      return chapter.title;
    }
  }
  return '';
}

/**
 * Transform raw MdFileContent[] into SearchDocument[] for indexing.
 */
export function documentsFromMdFiles(
  files: Array<{ path: string; content: string }>,
  summary: SummaryNode[],
): SearchDocument[] {
  return files.map((file) => ({
    id: file.path,
    title: extractTitle(file.content),
    chapterName: extractChapterName(file.path, summary),
    breadcrumb: buildBreadcrumb(file.path, summary),
    content: file.content,
    path: file.path,
  }));
}

// === Search Index ===

/**
 * Create a configured MiniSearch instance for the workspace.
 */
export function createSearchIndex(): MiniSearch<SearchDocument> {
  return new MiniSearch<SearchDocument>({
    fields: ['title', 'content'],
    storeFields: ['title', 'chapterName', 'breadcrumb', 'path'],
    idField: 'id',
    tokenize: tokenizeForSearch as (text: string, fieldName?: string) => string[],
  });
}

// === Snippet Extraction ===

/**
 * Extract a snippet around the first match of the query in the content.
 * Returns the snippet with match position for highlighting.
 */
export function extractSnippet(
  content: string,
  query: string,
  radius: number = 30,
): { snippet: string; matchStart: number } {
  if (!query) return { snippet: '', matchStart: 0 };

  const lowerContent = content.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const matchIndex = lowerContent.indexOf(lowerQuery);

  if (matchIndex === -1) return { snippet: '', matchStart: 0 };

  // Strip markdown syntax for snippet display
  const plainContent = content.replace(/#{1,6}\s+/g, '').replace(/[*_`[\]()]/g, '');
  // Recalculate match position in plain content (approximate)
  const plainLower = plainContent.toLowerCase();
  const plainMatch = plainLower.indexOf(lowerQuery);

  if (plainMatch === -1) return { snippet: '', matchStart: 0 };

  const start = Math.max(0, plainMatch - radius);
  const end = Math.min(plainContent.length, plainMatch + query.length + radius);

  let snippet = plainContent.slice(start, end);
  if (start > 0) snippet = '...' + snippet;
  if (end < plainContent.length) snippet = snippet + '...';

  return {
    snippet,
    matchStart: plainMatch - start + (start > 0 ? 3 : 0),
  };
}

// === Search Execution ===

/**
 * Execute a global search against the MiniSearch index.
 */
export function performSearch(
  index: MiniSearch<SearchDocument>,
  documents: Map<string, SearchDocument>,
  query: string,
  filter: SearchFilter = 'all',
): SearchResult[] {
  if (!query.trim()) return [];

  const fields =
    filter === 'filename'
      ? ['title']
      : filter === 'content'
        ? ['content']
        : ['title', 'content'];

  const boost: Record<string, number> = filter === 'filename' ? { title: 1 } : { title: 2, content: 1 };

  let results: Array<{ id: string; score: number }>;
  try {
    results = index.search(query, {
      fields,
      boost,
      prefix: true,
      fuzzy: 0.2,
      combineWith: 'AND',
    });
  } catch {
    // Fallback: try simpler search if combined query fails
    try {
      results = index.search(query, {
        fields,
        boost,
        prefix: true,
        fuzzy: 0.2,
      });
    } catch {
      return [];
    }
  }

  const searchResults: (SearchResult | null)[] = results.slice(0, 7).map((result) => {
    const doc = documents.get(result.id);
    if (!doc) return null;

    const { snippet, matchStart } = extractSnippet(doc.content, query);

    return {
      path: doc.path,
      title: doc.title || doc.path.split('/').pop()?.replace('.md', '') || '',
      chapterName: doc.chapterName,
      breadcrumb: doc.breadcrumb,
      snippet,
      matchStart,
      score: result.score,
    };
  });

  return searchResults.filter((r): r is SearchResult => r !== null);
}
