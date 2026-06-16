import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useEditorStore } from '../../stores/editorStore';
import { extractHeadings, scrollToHeadingIndex, type TocItem } from '../../services/tocService';

/**
 * Floating table-of-contents panel (GitBook-style).
 *
 * Rendered via portal to document.body and positioned fixed on the right
 * side of the viewport. Reads the current markdown from editorStore, lists
 * headings indented by level, and scrolls the editor to a heading on click.
 * The panel stays open after a click so the user can keep navigating.
 */
export function TocPanel() {
  const fileContent = useEditorStore((s) => s.fileContent);

  const headings = useMemo<TocItem[]>(
    () => extractHeadings(fileContent ?? ''),
    [fileContent],
  );

  const handleClick = (index: number) => {
    scrollToHeadingIndex(index);
  };

  return createPortal(
    <div className="toc-panel" role="navigation" aria-label="文档目录">
      <div className="toc-panel__header">目录</div>
      <div className="toc-panel__body">
        {headings.length === 0 ? (
          <div className="toc-panel__empty">本文暂无标题</div>
        ) : (
          headings.map((h, index) => (
            <button
              key={`${h.line}-${index}`}
              className="toc-panel__item"
              style={{ paddingLeft: `calc(var(--sp-2) + ${(h.level - 1) * 14}px)` }}
              title={h.text}
              onClick={() => handleClick(index)}
            >
              <span className="toc-panel__marker">{'H' + h.level}</span>
              <span className="toc-panel__text">{h.text}</span>
            </button>
          ))
        )}
      </div>
    </div>,
    document.body,
  );
}
