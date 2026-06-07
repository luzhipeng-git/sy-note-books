import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSettingsStore } from '../../stores/settingsStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useEditorStore } from '../../stores/editorStore';
import { useWhiteboardStore } from '../../stores/whiteboardStore';
import { useSearchStore } from '../../stores/searchStore';
import { useExportStore } from '../../stores/exportStore';
import { TableGridPicker } from '../editor/TableGridPicker';
import { HeadingPicker } from '../editor/HeadingPicker';

const act = (action: string) => useEditorStore.getState().vditorAction?.(action);

export function MainToolbar() {
  const { theme, toggleTheme } = useSettingsStore();
  const { activeEditorType, activeFilePath, enterWhiteboard } = useWorkspaceStore();

  const [showHeadingPicker, setShowHeadingPicker] = useState(false);
  const [showTablePicker, setShowTablePicker] = useState(false);
  const headingBtnRef = useRef<HTMLButtonElement>(null);
  const tableBtnRef = useRef<HTMLButtonElement>(null);

  if (activeEditorType === 'empty') return null;

  return (
    <div className="toolbar">
      <button className="toolbar-btn" title="撤销 (Ctrl+Z)" onClick={() => act('undo')}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="1,4 1,10 7,10" />
          <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
        </svg>
      </button>
      <button className="toolbar-btn" title="重做 (Ctrl+Y)" onClick={() => act('redo')}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="23,4 23,10 17,10" />
          <path d="M20.49 15a9 9 0 11-2.13-9.36L23 10" />
        </svg>
      </button>

      <div className="toolbar-separator" />

      <button
        ref={headingBtnRef}
        className="toolbar-btn"
        title="标题"
        onClick={() => setShowHeadingPicker((v) => !v)}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 4v16M20 4v16M4 12h16" />
        </svg>
      </button>
      <button className="toolbar-btn" title="加粗 (Ctrl+B)" onClick={() => act('bold')}>
        <b>B</b>
      </button>
      <button className="toolbar-btn" title="斜体 (Ctrl+I)" onClick={() => act('italic')}>
        <i>I</i>
      </button>
      <button className="toolbar-btn" title="删除线 (Ctrl+D)" onClick={() => act('strike')}>
        <s>S</s>
      </button>

      <div className="toolbar-separator" />

      <button className="toolbar-btn" title="无序列表" onClick={() => act('list')}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="9" y1="6" x2="20" y2="6" /><line x1="9" y1="12" x2="20" y2="12" /><line x1="9" y1="18" x2="20" y2="18" />
          <circle cx="4" cy="6" r="1.5" fill="currentColor" /><circle cx="4" cy="12" r="1.5" fill="currentColor" /><circle cx="4" cy="18" r="1.5" fill="currentColor" />
        </svg>
      </button>
      <button className="toolbar-btn" title="有序列表" onClick={() => act('ordered-list')}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="10" y1="6" x2="20" y2="6" /><line x1="10" y1="12" x2="20" y2="12" /><line x1="10" y1="18" x2="20" y2="18" />
          <text x="2" y="8" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">1</text>
          <text x="2" y="14" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">2</text>
          <text x="2" y="20" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">3</text>
        </svg>
      </button>
      <button className="toolbar-btn" title="任务列表" onClick={() => act('check')}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="5" width="14" height="14" rx="2" /><polyline points="7,12 9,14 13,10" />
        </svg>
      </button>
      <button className="toolbar-btn" title="引用" onClick={() => act('quote')}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 3v18h2V3H3zm6 4h12v2H9V7zm0 5h12v2H9v-2zm0 5h12v2H9v-2z" />
        </svg>
      </button>
      <button className="toolbar-btn" title="分隔线" onClick={() => act('line')}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="2" y1="12" x2="22" y2="12" strokeWidth="3" />
        </svg>
      </button>

      <div className="toolbar-separator" />

      <button className="toolbar-btn" title="代码块" onClick={() => act('code')}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="16,18 22,12 16,6" /><polyline points="8,6 2,12 8,18" />
        </svg>
      </button>
      <button className="toolbar-btn" title="行内代码" onClick={() => act('inline-code')}>
        &lt;/&gt;
      </button>
      <button className="toolbar-btn" title="链接 (Ctrl+K)" onClick={() => act('link')}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
        </svg>
      </button>

      <div className="toolbar-separator" />

      <button
        ref={tableBtnRef}
        className="toolbar-btn"
        title="插入表格"
        onClick={() => setShowTablePicker((v) => !v)}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" />
          <line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" />
        </svg>
      </button>

      <button
        className="toolbar-btn"
        title="白板画图 (Ctrl+Shift+D)"
        onClick={() => {
          if (activeFilePath) {
            const cursorLine = useEditorStore.getState().cursorLine;
            const anchor = {
              sourceFilePath: activeFilePath,
              cursorPosition: cursorLine,
              nearestHeading: '当前段落',
            };
            useWhiteboardStore.getState().initNew(anchor);
            enterWhiteboard(anchor);
          }
        }}
      >
        🖌️ 画图
      </button>

      <div className="toolbar-spacer" />

      <button className="toolbar-btn" title="搜索 (Ctrl+Shift+F)" onClick={() => useSearchStore.getState().openGlobalSearch()}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>
      <button
        className="toolbar-btn"
        title="导出 (Ctrl+P)"
        onClick={() => {
          const hasWorkspace = useWorkspaceStore.getState().rootPath !== null;
          useExportStore.getState().openDialog(hasWorkspace);
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <polyline points="7,10 12,15 17,10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </button>
      <button className="toolbar-btn" onClick={toggleTheme} title="切换主题">
        {theme === 'light' ? '🌙' : '☀️'}
      </button>

      {showHeadingPicker && headingBtnRef.current && createPortal(
        <HeadingPicker
          anchorEl={headingBtnRef.current}
          onSelect={(level) => {
            // Vditor headings panel has sub-buttons with data-type="h1".."h6"
            // Click headings first to ensure panel is initialized, then click the level
            act('headings');
            setTimeout(() => {
              const btn = document.querySelector(`.vditor-toolbar [data-type="h${level}"]`) as HTMLElement;
              btn?.click();
            }, 0);
          }}
          onClose={() => setShowHeadingPicker(false)}
        />,
        document.body,
      )}

      {showTablePicker && tableBtnRef.current && createPortal(
        <TableGridPicker
          anchorEl={tableBtnRef.current}
          onSelect={(rows, cols) => useEditorStore.getState().insertTable?.(rows, cols)}
          onClose={() => setShowTablePicker(false)}
        />,
        document.body,
      )}
    </div>
  );
}
