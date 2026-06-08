import { useEffect, useRef, useCallback } from 'react';
import Vditor from 'vditor';
import 'vditor/dist/index.css';
import { useEditorStore } from '../../stores/editorStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useWhiteboardStore } from '../../stores/whiteboardStore';
import { useImageHoverPreview, ImageHoverPreview } from './ImageHoverPreview';
import { loadDrawnix, parseImagePath } from '../../services/whiteboardService';
import type { WhiteboardAnchor } from '../../types/workspace';

interface MarkdownEditorProps {
  filePath: string;
  content: string;
}

export function MarkdownEditor({ filePath, content }: MarkdownEditorProps) {
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const containerRef = useRef<HTMLDivElement>(null);
  const vditorRef = useRef<Vditor | null>(null);
  const setContent = useEditorStore((s) => s.setContent);

  const { preview, close: closePreview } = useImageHoverPreview(containerRef);

  const getNearestHeading = useCallback((vditor: Vditor): string => {
    try {
      const lines = (vditor.getValue?.() ?? '').split('\n');
      const sel = window.getSelection();
      if (!sel || !sel.focusNode) return '';
      const editorRoot = containerRef.current?.querySelector('.vditor-ir');
      if (!editorRoot) return '';

      // Walk up from cursor to find a heading element
      let node: HTMLElement | null = sel.focusNode as HTMLElement;
      while (node && node !== editorRoot) {
        if (node.tagName?.match(/^H[1-6]$/i)) {
          return node.textContent?.trim() ?? '';
        }
        node = node.parentElement;
      }

      // Fallback: search backwards through markdown lines
      for (let i = lines.length - 1; i >= 0; i--) {
        const match = lines[i]?.match(/^#{1,6}\s+(.+)/);
        if (match) return match[1].trim();
      }
    } catch {
      // Vditor API may not be available in all modes
    }
    return '';
  }, []);

  const getCursorLine = useCallback((): number => {
    try {
      const vditor = vditorRef.current;
      if (!vditor) return 1;
      const sel = window.getSelection();
      if (!sel || !sel.focusNode) return 1;
      const editorRoot = containerRef.current?.querySelector('.vditor-ir');
      if (!editorRoot || !editorRoot.contains(sel.focusNode)) return 1;

      // Find the ancestor block with data-block attribute
      let block: HTMLElement | null = sel.focusNode as HTMLElement;
      while (block && block !== editorRoot) {
        if (block instanceof HTMLElement && block.hasAttribute('data-block')) break;
        block = block.parentElement;
      }
      if (!block || block === editorRoot) return 1;

      // Count data-block siblings before this one
      let blockIndex = 0;
      let prev = block.previousElementSibling;
      while (prev) {
        if (prev.hasAttribute('data-block')) blockIndex++;
        prev = prev.previousElementSibling;
      }

      // Map blockIndex to markdown line number using fileContent
      // (same data source as insertion logic, avoids mismatch)
      const md = useEditorStore.getState().fileContent ?? '';
      const lines = md.split('\n');
      let contentIdx = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() !== '') {
          if (contentIdx === blockIndex) return i + 1;
          contentIdx++;
        }
      }
      return lines.length;
    } catch {
      return 1;
    }
  }, []);

  const handleEnterWhiteboard = useCallback(() => {
    const vditor = vditorRef.current;
    if (!vditor) return;

    const cursorLine = getCursorLine();
    useEditorStore.getState().setCursorPosition(cursorLine, 1);

    const anchor: WhiteboardAnchor = {
      sourceFilePath: filePath,
      cursorPosition: cursorLine,
      nearestHeading: getNearestHeading(vditor),
    };

    useWhiteboardStore.getState().initNew(anchor);
    useWorkspaceStore.getState().enterWhiteboard(anchor);
  }, [filePath, getCursorLine, getNearestHeading]);

  useEffect(() => {
    if (!containerRef.current) return;

    vditorRef.current?.destroy();
    vditorRef.current = null;

    const vditor = new Vditor(containerRef.current, {
      mode: 'ir',
      value: content,
      height: '100%',
      theme: 'classic',
      icon: 'material',
      placeholder: '开始写作...',
      // Map Ctrl+1-6 to Ctrl+Alt+1-6 (Vditor's built-in heading shortcut)
      // so Ctrl+1-6 works like Typora
      keydown: (event) => {
        if (event.ctrlKey && !event.altKey && !event.shiftKey && /^Digit[1-6]$/.test(event.code)) {
          Object.defineProperty(event, 'altKey', { value: true });
        }
      },
      toolbar: [
        'headings', 'bold', 'italic', 'strike', '|',
        'list', 'ordered-list', 'check', 'quote', 'line', '|',
        'code', 'inline-code', 'link', 'table', '|',
        'undo', 'redo', '|',
        {
          name: 'whiteboard',
          tip: '白板画图 (Ctrl+Shift+D)',
          icon: '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M3 3h18v18H3V3zm2 2v14h14V5H5zm3 3h8v2H8V8zm0 4h5v2H8v-2z"/></svg>',
          click: () => handleEnterWhiteboard(),
        },
      ],
      cache: { enable: false },
      preview: {
        theme: { current: 'classic' },
        markdown: { codeBlockPreview: true },
        hljs: {
          enable: true,
          lineNumber: true,
          defaultLang: '',
          style: 'github',
        },
      },
      hint: {
        parse: true,
        delay: 200,
        extend: [
          {
            key: '/wb',
            hint: () => [{ value: '/wb', html: '🎨 白板画图' }],
          },
        ],
      },
      input(value) {
        setContent(value);
        // Detect /wb followed by space — trigger whiteboard
        if (value.includes('/wb ') || value.includes('/wb ')) {
          // Remove the "/wb " from content before entering whiteboard
          const cleaned = value.replace(/\/wb[\s ]/, '');
          setContent(cleaned);
          handleEnterWhiteboard();
        }
        // Update language labels on code block previews
        requestAnimationFrame(() => {
          containerRef.current?.querySelectorAll('pre.vditor-ir__preview').forEach(pre => {
            const code = pre.querySelector('code');
            const lang = code?.className?.match(/language-(\S+)/)?.[1];
            if (lang) (pre as HTMLElement).dataset.lang = lang;
          });
        });
      },
    });

    vditorRef.current = vditor;

    useEditorStore.getState().setInsertTable((rows: number, cols: number) => {
      const header = '| ' + Array.from({ length: cols }, (_, i) => `列${i + 1}`).join(' | ') + ' |';
      const separator = '| ' + Array.from({ length: cols }, () => '---').join(' | ') + ' |';
      const body = Array.from({ length: rows - 1 }, () =>
        '| ' + Array.from({ length: cols }, () => '内容').join(' | ') + ' |',
      ).join('\n');
      vditor.insertValue(`\n${header}\n${separator}\n${body}\n`, true);
    });

    const container = containerRef.current;
    useEditorStore.getState().setVditorAction((action: string) => {
      const btn = container?.querySelector(`[data-type="${action}"]`) as HTMLElement | null;
      btn?.click();
    });

    // Track cursor position continuously so toolbar button reads accurate line
    const handleSelectionChange = () => {
      const vditor = vditorRef.current;
      if (!vditor) return;
      const editorRoot = containerRef.current?.querySelector('.vditor-ir');
      if (!editorRoot) return;
      const sel = window.getSelection();
      if (!sel?.focusNode || !editorRoot.contains(sel.focusNode)) return;

      let block: HTMLElement | null = sel.focusNode as HTMLElement;
      while (block && block !== editorRoot) {
        if (block instanceof HTMLElement && block.hasAttribute('data-block')) break;
        block = block.parentElement;
      }
      if (!block || block === editorRoot) return;

      let blockIndex = 0;
      let prev = block.previousElementSibling;
      while (prev) {
        if (prev.hasAttribute('data-block')) blockIndex++;
        prev = prev.previousElementSibling;
      }

      const md = useEditorStore.getState().fileContent ?? '';
      const lines = md.split('\n');
      let contentIdx = 0;
      let line = lines.length;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() !== '') {
          if (contentIdx === blockIndex) { line = i + 1; break; }
          contentIdx++;
        }
      }
      useEditorStore.getState().setCursorPosition(line, 1);
    };
    document.addEventListener('selectionchange', handleSelectionChange);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        handleEnterWhiteboard();
      }
    };
    containerRef.current?.addEventListener('keydown', handleKeyDown);

    const handleDblClick = async (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const img = target.closest('img');
      if (!img) return;

      const src = img.getAttribute('src') ?? '';
      const parsed = parseImagePath(src);
      if (!parsed) return;

      const docPath = filePath.replace(/\\/g, '/');
      const pathParts = docPath.split('/');
      const chapterDir = pathParts.slice(0, -1).join('/');
      const drawnixPath = `${chapterDir}/assets/${parsed.docName}-img-${String(parsed.index).padStart(3, '0')}.drawnix`;

      const wsRoot = rootPath || '/mock/workspace';
      const data = await loadDrawnix(`${wsRoot}/${drawnixPath}`);
      if (!data) return;

      const vditor = vditorRef.current;
      const anchor: WhiteboardAnchor = {
        sourceFilePath: filePath,
        cursorPosition: 1,
        nearestHeading: getNearestHeading(vditor!),
      };

      useWhiteboardStore.getState().initEdit(anchor, drawnixPath, data.elements);
      useWorkspaceStore.getState().enterWhiteboard(anchor);
    };
    containerRef.current?.addEventListener('dblclick', handleDblClick);

    // Reposition language hint dropdown below the language label
    const hintObserver = new MutationObserver(() => {
      // Search entire document — Vditor may append hint to body, not container
      const hint = document.querySelector('.vditor-hint:not(.vditor-toolbar .vditor-hint)') as HTMLElement | null;
      if (!hint || hint.style.display === 'none') return;

      const info = containerRef.current?.querySelector(
        '[data-type="code-block-info"]',
      ) as HTMLElement | null;
      if (!info) return;

      const infoRect = info.getBoundingClientRect();
      const hintHeight = hint.offsetHeight;
      const viewH = window.innerHeight;

      let top = infoRect.bottom + 4;
      if (top + hintHeight > viewH - 8) {
        top = infoRect.top - hintHeight - 4;
      }
      let left = infoRect.left;
      if (left + hint.offsetWidth > window.innerWidth - 8) {
        left = window.innerWidth - hint.offsetWidth - 8;
      }

      hint.style.position = 'fixed';
      hint.style.top = `${Math.max(8, top)}px`;
      hint.style.left = `${Math.max(8, left)}px`;
    });

    hintObserver.observe(document.body, { childList: true, subtree: true });

    // Set language labels on code block previews (initial + mutations)
    const updateLangLabels = () => {
      containerRef.current?.querySelectorAll('pre.vditor-ir__preview').forEach(pre => {
        const code = pre.querySelector('code');
        const lang = code?.className?.match(/language-(\S+)/)?.[1];
        if (lang) (pre as HTMLElement).dataset.lang = lang;
      });
    };
    requestAnimationFrame(updateLangLabels);
    const langObserver = new MutationObserver(() => requestAnimationFrame(updateLangLabels));
    langObserver.observe(containerRef.current!, { childList: true, subtree: true });

    return () => {
      hintObserver.disconnect();
      langObserver.disconnect();
      document.removeEventListener('selectionchange', handleSelectionChange);
      containerRef.current?.removeEventListener('keydown', handleKeyDown);
      containerRef.current?.removeEventListener('dblclick', handleDblClick);
      useEditorStore.getState().setInsertTable(null);
      useEditorStore.getState().setVditorAction(null);
      vditorRef.current?.destroy();
      vditorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath]);

  return (
    <div className="vditor-container">
      <div ref={containerRef} className="vditor-instance" />
      {preview && <ImageHoverPreview preview={preview} onClose={closePreview} />}
    </div>
  );
}
