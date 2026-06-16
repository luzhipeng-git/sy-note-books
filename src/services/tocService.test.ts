import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractHeadings, scrollToHeadingIndex } from './tocService';

describe('extractHeadings', () => {
  it('returns empty array for empty content', () => {
    expect(extractHeadings('')).toEqual([]);
  });

  it('returns empty array for content with no headings', () => {
    const md = '一些正文\n\n更多正文\n- 列表项\n';
    expect(extractHeadings(md)).toEqual([]);
  });

  it('extracts a single heading with correct level, text and line', () => {
    const md = '\n# 标题一\n';
    expect(extractHeadings(md)).toEqual([
      { level: 1, text: '标题一', line: 2 },
    ]);
  });

  it('extracts all six heading levels', () => {
    const md = [
      '# H1 标题',
      '## H2 标题',
      '### H3 标题',
      '#### H4 标题',
      '##### H5 标题',
      '###### H6 标题',
    ].join('\n');
    const items = extractHeadings(md);
    expect(items).toHaveLength(6);
    expect(items.map((h) => h.level)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(items.map((h) => h.text)).toEqual([
      'H1 标题',
      'H2 标题',
      'H3 标题',
      'H4 标题',
      'H5 标题',
      'H6 标题',
    ]);
    expect(items.map((h) => h.line)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('computes 1-based line numbers correctly', () => {
    const md = 'intro line\n\n# First\n\nsome text\n## Second\n';
    const items = extractHeadings(md);
    expect(items[0].line).toBe(3);
    expect(items[1].line).toBe(6);
  });

  it('strips trailing closing # marks (ATX closed headings)', () => {
    expect(extractHeadings('# Title #')).toEqual([
      { level: 1, text: 'Title', line: 1 },
    ]);
    expect(extractHeadings('## Title ##')).toEqual([
      { level: 2, text: 'Title', line: 1 },
    ]);
    expect(extractHeadings('### 标题 ###')).toEqual([
      { level: 3, text: '标题', line: 1 },
    ]);
  });

  it('trims surrounding whitespace from heading text', () => {
    expect(extractHeadings('#    spaced title   ')[0].text).toBe('spaced title');
  });

  it('ignores lines with more than 6 # marks', () => {
    const md = '####### seven hashes is not a heading\n# real heading';
    const items = extractHeadings(md);
    expect(items).toHaveLength(1);
    expect(items[0].text).toBe('real heading');
  });

  it('ignores lines without a space after #', () => {
    expect(extractHeadings('#no-space')).toEqual([]);
    expect(extractHeadings('##no-space')).toEqual([]);
  });

  it('ignores # that is not at the start of the line', () => {
    const md = 'some text # not a heading\n  # indented is still skipped by ^\n';
    // Note: leading whitespace before # is common-mark valid, but the app's
    // existing getNearestHeading regex uses ^#{1,6}\s without leading space,
    // so we match that behavior for consistency. Indented # is not a heading.
    expect(extractHeadings(md)).toEqual([]);
  });

  it('ignores headings inside fenced code blocks (```)', () => {
    const md = [
      '# Real Title',
      '',
      '```',
      '# Not a heading inside code',
      '## Also not',
      '```',
      '',
      '# After code',
    ].join('\n');
    const items = extractHeadings(md);
    expect(items).toHaveLength(2);
    expect(items.map((h) => h.text)).toEqual(['Real Title', 'After code']);
  });

  it('ignores headings inside tilde fenced code blocks (~~~)', () => {
    const md = [
      '# Real Title',
      '',
      '~~~',
      '# Not a heading inside code',
      '~~~',
      '',
      '# After code',
    ].join('\n');
    const items = extractHeadings(md);
    expect(items).toHaveLength(2);
    expect(items.map((h) => h.text)).toEqual(['Real Title', 'After code']);
  });

  it('handles indented fence openers', () => {
    const md = [
      '# Real',
      '  ```',
      '# inside',
      '  ```',
      '# After',
    ].join('\n');
    const items = extractHeadings(md);
    expect(items.map((h) => h.text)).toEqual(['Real', 'After']);
  });

  it('handles multiple consecutive fenced blocks', () => {
    const md = [
      '# A',
      '```',
      '# x',
      '```',
      '# B',
      '~~~',
      '# y',
      '~~~',
      '# C',
    ].join('\n');
    const items = extractHeadings(md);
    expect(items.map((h) => h.text)).toEqual(['A', 'B', 'C']);
  });

  it('treats unclosed fence as code until end of document', () => {
    const md = ['# A', '```', '# inside (unclosed)'].join('\n');
    const items = extractHeadings(md);
    expect(items.map((h) => h.text)).toEqual(['A']);
  });

  it('preserves order and returns duplicate headings', () => {
    const md = '# Same\n# Same\n# Same\n';
    const items = extractHeadings(md);
    expect(items).toHaveLength(3);
    expect(items.every((h) => h.text === 'Same')).toBe(true);
  });

  it('preserves chinese and special characters in heading text', () => {
    const items = extractHeadings('# 第一章：开始 —— 入门指南！');
    expect(items[0].text).toBe('第一章：开始 —— 入门指南！');
  });

  it('does not treat list items starting with # as headings', () => {
    // A line like "- #tag" is a list item, but our regex requires ^# so
    // these are naturally excluded. Verify explicit guard.
    expect(extractHeadings('- #tag item')).toEqual([]);
    expect(extractHeadings('1. #num')).toEqual([]);
  });
});

describe('scrollToHeadingIndex', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('does nothing when there is no .vditor-ir root', () => {
    const spy = vi.spyOn(document, 'querySelector');
    spy.mockReturnValue(null);
    expect(() => scrollToHeadingIndex(0)).not.toThrow();
  });

  it('calls scrollIntoView on the target heading element', () => {
    const fakeHeading = {
      scrollIntoView: vi.fn(),
    };
    const fakeRoot = {
      querySelectorAll: vi.fn(() => [fakeHeading, fakeHeading]),
    };
    const spy = vi.spyOn(document, 'querySelector');
    spy.mockReturnValue(fakeRoot as any);

    scrollToHeadingIndex(1);
    expect(fakeHeading.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    });
  });

  it('does nothing when headingIndex is out of range', () => {
    const fakeHeading = { scrollIntoView: vi.fn() };
    const fakeRoot = { querySelectorAll: vi.fn(() => [fakeHeading]) };
    const spy = vi.spyOn(document, 'querySelector');
    spy.mockReturnValue(fakeRoot as any);

    expect(() => scrollToHeadingIndex(5)).not.toThrow();
    expect(fakeHeading.scrollIntoView).not.toHaveBeenCalled();
  });
});
