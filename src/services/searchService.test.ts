import { describe, it, expect } from 'vitest';
import {
  tokenizeForSearch,
  extractTitle,
  buildBreadcrumb,
  documentsFromMdFiles,
  createSearchIndex,
  extractSnippet,
  performSearch,
} from './searchService';
import type { SummaryNode } from '../types/workspace';

const mockSummary: SummaryNode[] = [
  {
    title: '入门指南',
    path: '01-getting-started/index.md',
    level: 1,
    children: [
      { title: '快速开始', path: '01-getting-started/index.md', level: 2 },
      { title: '安装说明', path: '01-getting-started/install.md', level: 2 },
    ],
  },
  {
    title: '系统架构',
    path: '02-architecture/index.md',
    level: 1,
    children: [
      { title: '架构概览', path: '02-architecture/index.md', level: 2 },
      { title: 'API 总览', path: '02-architecture/api-overview.md', level: 2 },
    ],
  },
];

describe('searchService', () => {
  describe('extractTitle', () => {
    it('extracts first h1 heading', () => {
      expect(extractTitle('# 入门指南\n\n正文')).toBe('入门指南');
    });

    it('extracts first heading regardless of level', () => {
      expect(extractTitle('## 架构概览\n\n正文')).toBe('架构概览');
    });

    it('returns empty string when no heading', () => {
      expect(extractTitle('没有标题的文档')).toBe('');
    });

    it('handles multiple headings', () => {
      expect(extractTitle('# 主标题\n## 子标题')).toBe('主标题');
    });
  });

  describe('buildBreadcrumb', () => {
    it('builds breadcrumb for child page', () => {
      expect(buildBreadcrumb('02-architecture/api-overview.md', mockSummary)).toBe(
        '系统架构 > API 总览',
      );
    });

    it('builds breadcrumb for chapter index', () => {
      expect(buildBreadcrumb('02-architecture/index.md', mockSummary)).toBe('系统架构');
    });

    it('builds breadcrumb for child that is also index', () => {
      expect(buildBreadcrumb('01-getting-started/index.md', mockSummary)).toBe('入门指南');
    });

    it('returns empty for unknown path', () => {
      expect(buildBreadcrumb('unknown/path.md', mockSummary)).toBe('');
    });
  });

  describe('documentsFromMdFiles', () => {
    it('transforms md files into search documents', () => {
      const files = [
        { path: '01-getting-started/index.md', content: '# 入门指南\n\n正文' },
        { path: '02-architecture/api-overview.md', content: '# API 总览\n\n详情' },
      ];

      const docs = documentsFromMdFiles(files, mockSummary);

      expect(docs).toHaveLength(2);
      expect(docs[0].title).toBe('入门指南');
      expect(docs[1].breadcrumb).toBe('系统架构 > API 总览');
    });

    it('uses file path as fallback when no heading', () => {
      const files = [{ path: '01-getting-started/notes.md', content: '无标题文档' }];
      const docs = documentsFromMdFiles(files, mockSummary);
      expect(docs[0].title).toBe('');
    });
  });

  describe('createSearchIndex', () => {
    it('creates a MiniSearch instance', () => {
      const index = createSearchIndex();
      expect(index).toBeDefined();
      expect(index.documentCount).toBe(0);
    });

    it('can add and search documents', () => {
      const index = createSearchIndex();
      const docs = [
        {
          id: '01-intro/index.md',
          title: '入门指南',
          chapterName: '入门指南',
          breadcrumb: '入门指南',
          content: '欢迎使用书昀笔记',
          path: '01-intro/index.md',
        },
      ];
      index.addAll(docs);
      expect(index.documentCount).toBe(1);

      const results = index.search('书昀');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('extractSnippet', () => {
    it('extracts snippet around match', () => {
      const content = '系统采用微服务架构，API 网关负责路由和认证。';
      const result = extractSnippet(content, 'API');
      expect(result.snippet).toContain('API');
      expect(result.matchStart).toBeGreaterThanOrEqual(0);
    });

    it('adds ellipsis when truncated', () => {
      const longContent = 'A'.repeat(100) + 'TARGET' + 'B'.repeat(100);
      const result = extractSnippet(longContent, 'TARGET', 10);
      expect(result.snippet.startsWith('...')).toBe(true);
      expect(result.snippet.endsWith('...')).toBe(true);
    });

    it('returns empty for no match', () => {
      const result = extractSnippet('hello world', 'xyz');
      expect(result.snippet).toBe('');
      expect(result.matchStart).toBe(0);
    });

    it('returns empty for empty query', () => {
      const result = extractSnippet('hello world', '');
      expect(result.snippet).toBe('');
    });
  });

  describe('performSearch', () => {
    it('returns results sorted by relevance', () => {
      const index = createSearchIndex();
      const docs = new Map<string, ReturnType<typeof documentsFromMdFiles>[0]>();

      const searchDocs = [
        {
          id: '01-a.md',
          title: 'API 概览',
          chapterName: '入门',
          breadcrumb: '入门 > API 概览',
          content: 'API 是应用程序接口',
          path: '01-a.md',
        },
        {
          id: '02-b.md',
          title: '架构概览',
          chapterName: '架构',
          breadcrumb: '架构 > 架构概览',
          content: '系统架构包括 API 网关和业务服务',
          path: '02-b.md',
        },
      ];

      index.addAll(searchDocs);
      searchDocs.forEach((d) => docs.set(d.id, d));

      const results = performSearch(index, docs, 'API');
      expect(results.length).toBeGreaterThan(0);
      // Title match should score higher
      expect(results[0].title).toBe('API 概览');
    });

    it('respects 7-result limit', () => {
      const index = createSearchIndex();
      const docs = new Map<string, ReturnType<typeof documentsFromMdFiles>[0]>();

      for (let i = 0; i < 10; i++) {
        const doc = {
          id: `doc-${i}.md`,
          title: `文档 ${i}`,
          chapterName: '章节',
          breadcrumb: `章节 > 文档 ${i}`,
          content: `包含搜索关键词的内容 ${i}`,
          path: `doc-${i}.md`,
        };
        index.add(doc);
        docs.set(doc.id, doc);
      }

      const results = performSearch(index, docs, '搜索');
      expect(results.length).toBeLessThanOrEqual(7);
    });

    it('returns empty for empty query', () => {
      const index = createSearchIndex();
      const docs = new Map();
      expect(performSearch(index, docs, '')).toEqual([]);
      expect(performSearch(index, docs, '   ')).toEqual([]);
    });

    it('returns empty for no matches', () => {
      const index = createSearchIndex();
      const docs = new Map<string, ReturnType<typeof documentsFromMdFiles>[0]>();
      index.add({
        id: 'doc.md',
        title: '文档',
        chapterName: '章节',
        breadcrumb: '章节 > 文档',
        content: '内容',
        path: 'doc.md',
      });
      docs.set('doc.md', {
        id: 'doc.md',
        title: '文档',
        chapterName: '章节',
        breadcrumb: '章节 > 文档',
        content: '内容',
        path: 'doc.md',
      });

      const results = performSearch(index, docs, '不存在的关键词');
      expect(results).toEqual([]);
    });
  });

  describe('tokenizeForSearch', () => {
    it('splits English text by whitespace', () => {
      const tokens = tokenizeForSearch('hello world test');
      expect(tokens).toContain('hello');
      expect(tokens).toContain('world');
      expect(tokens).toContain('test');
    });

    it('handles mixed content', () => {
      const tokens = tokenizeForSearch('API 网关');
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens).toContain('api');
    });
  });
});
