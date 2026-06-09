import { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import { Drawnix } from '@drawnix/drawnix';
import { toSvg } from '@plait/core';
import type { PlaitElement, PlaitBoard } from '@plait/core';
import { useWhiteboardStore } from '../../stores/whiteboardStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useEditorStore } from '../../stores/editorStore';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Toast } from '../common/Toast';
import {
  getNextImageIndex,
  saveDrawnix,
  serializeDrawnixData,
  buildImagePath,
  buildMarkdownRef,
} from '../../services/whiteboardService';
import { invokeIPC } from '../../services/ipc';
import './WhiteboardFullscreen.css';

export function WhiteboardFullscreen() {
  const {
    mode,
    anchor,
    elements: initialElements,
    isDirty,
    isSaving,
    editingImagePath,
    setDirty,
    setSaving,
    reset: resetStore,
  } = useWhiteboardStore();

  const { exitWhiteboard, rootPath } = useWorkspaceStore();
  const editorStore = useEditorStore;

  const [showConfirm, setShowConfirm] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const currentElements = useRef<PlaitElement[]>(initialElements);
  const boardRef = useRef<PlaitBoard | null>(null);
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const [canvasReady, setCanvasReady] = useState(false);
  const [drawnixReady, setDrawnixReady] = useState(false);
  const drawnixReadyRef = useRef(false);

  // Wait for canvas area to have actual dimensions before rendering Drawnix
  useLayoutEffect(() => {
    const el = canvasAreaRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    if (width > 0 && height > 0) {
      setCanvasReady(true);
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
        setCanvasReady(true);
        observer.disconnect();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleAfterInit = useCallback((board: PlaitBoard) => {
    boardRef.current = board;
    drawnixReadyRef.current = true;
    setDrawnixReady(true);
  }, []);

  // CRITICAL: Block ALL pointer/key events until Drawnix's Board useEffect runs.
  // React effect order: child useLayoutEffect → parent useLayoutEffect →
  //                     child useEffect (Drawnix registers handlers + sets WeakMaps) →
  //                     parent useEffect.
  // By using useLayoutEffect (parent), our blocker runs BEFORE Drawnix's useEffect
  // (child) which registers event handlers and sets BOARD_TO_HOST.
  // Using a ref (not state) allows synchronous checking inside the blocker.
  useLayoutEffect(() => {
    const blocker = (e: Event) => {
      if (drawnixReadyRef.current) return;
      e.stopImmediatePropagation();
    };

    const events = [
      'pointerdown', 'pointermove', 'pointerup', 'pointercancel',
      'keydown', 'keyup',
    ];
    events.forEach(evt => document.addEventListener(evt, blocker, true));

    return () => {
      events.forEach(evt => document.removeEventListener(evt, blocker, true));
    };
  }, []);

  const handleBack = useCallback(() => {
    if (isDirty) {
      setShowConfirm(true);
    } else {
      resetStore();
      exitWhiteboard();
    }
  }, [isDirty, resetStore, exitWhiteboard]);

  const handleConfirmDiscard = useCallback(() => {
    setShowConfirm(false);
    resetStore();
    exitWhiteboard();
  }, [resetStore, exitWhiteboard]);

  const handleValueChange = useCallback(
    (newElements: PlaitElement[]) => {
      currentElements.current = newElements;
      setDirty(true);
    },
    [setDirty],
  );

  const handleSaveAndInsert = useCallback(async () => {
    if (!anchor || isSaving) return;

    const wsRoot = rootPath || '/mock/workspace';
    setSaving(true);
    try {
      const elements = currentElements.current;
      const docPath = anchor.sourceFilePath;
      const pathParts = docPath.replace(/\\/g, '/').split('/');
      const docFile = pathParts[pathParts.length - 1];
      const docName = docFile.replace(/\.md$/, '');
      const chapterDir = pathParts.slice(0, -1).join('/');
      const assetsDir = chapterDir ? `${chapterDir}/assets` : 'assets';
      const absAssetsDir = `${wsRoot}/${assetsDir}`;

      // In edit mode, save back to the existing file; in new mode, get next index
      const isEdit = mode === 'edit';
      let drawnixBasePath: string;
      let mdRef: string;

      if (isEdit && editingImagePath) {
        // Edit mode: overwrite existing file (editingImagePath is relative, e.g. "chapter/assets/doc-img-001.drawnix")
        drawnixBasePath = `${wsRoot}/${editingImagePath}`;
        const match = editingImagePath.match(/([^/]+)-img-(\d+)\.drawnix$/);
        const existingDocName = match?.[1] ?? docName;
        const existingIndex = match?.[2] ? parseInt(match[2], 10) : 1;
        mdRef = buildMarkdownRef(existingDocName, existingIndex);
      } else {
        // New mode: get next index and create new file
        const index = await getNextImageIndex(absAssetsDir, docName);
        drawnixBasePath = buildImagePath(absAssetsDir, docName, index, 'drawnix');
        mdRef = buildMarkdownRef(docName, index);
      }

      const jsonData = serializeDrawnixData(elements);
      const svgContent = boardRef.current
        ? await toSvg(boardRef.current, { elements, padding: 20 })
        : '<svg xmlns="http://www.w3.org/2000/svg"></svg>';

      await saveDrawnix(drawnixBasePath, jsonData, svgContent);

      // In edit mode, the markdown ref already exists — just update file content
      let newContent = editorStore.getState().fileContent ?? '';
      if (!isEdit) {
        const currentContent = newContent;
        const lines = currentContent.split('\n');

        // cursorPosition is 1-based, from fileContent-based getCursorLine
        const cursorIdx = Math.min(anchor.cursorPosition, lines.length) - 1;
        const targetLine = lines[cursorIdx] ?? '';

        // Find last content line
        let lastContentIdx = lines.length - 1;
        while (lastContentIdx >= 0 && lines[lastContentIdx].trim() === '') lastContentIdx--;

        let insertIdx: number;
        if (targetLine.trim() !== '') {
          // Text line: if last content line → append at end; otherwise → insert after
          insertIdx = cursorIdx >= lastContentIdx ? lines.length : cursorIdx + 1;
        } else {
          // Empty line: insert at this position
          insertIdx = cursorIdx;
        }
        // Immutable insert — no splice mutation
        const newLines = [
          ...lines.slice(0, insertIdx),
          '', mdRef, '',
          ...lines.slice(insertIdx),
        ];
        newContent = newLines.join('\n');
      }

      await invokeIPC('save_file', { path: `${wsRoot}/${docPath}`, content: newContent });
      editorStore.getState().setContent(newContent);

      setToast({ message: '保存并插入成功', type: 'success' });

      setTimeout(() => {
        resetStore();
        exitWhiteboard();
      }, 500);
    } catch (err) {
      console.error('保存白板失败:', err);
      setToast({ message: `保存失败: ${err}`, type: 'error' });
    } finally {
      setSaving(false);
    }
  }, [anchor, rootPath, isSaving, mode, editingImagePath, setSaving, resetStore, exitWhiteboard, editorStore]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleBack]);

  const headingText = anchor?.nearestHeading
    ? `正在为「${anchor.nearestHeading}」段落${mode === 'edit' ? '编辑插图' : '绘制插图'}`
    : '白板画图';

  return (
    <div className="wb-fullscreen">
      <div className="wb-topbar">
        <button className="wb-back-btn" onClick={handleBack}>
          ← 返回
        </button>
        <div className="wb-topbar-title">{headingText}</div>
        <button
          className="wb-save-btn"
          onClick={handleSaveAndInsert}
          disabled={isSaving}
        >
          {isSaving ? '保存中...' : '保存并插入'}
        </button>
      </div>

      <div className="wb-canvas-area" ref={canvasAreaRef}>
        {canvasReady && (
          <>
            <Drawnix
              value={initialElements}
              onValueChange={handleValueChange}
              afterInit={handleAfterInit}
            />
            {/* Block all events until Drawnix's Board useEffect runs (BOARD_TO_HOST is set) */}
            {!drawnixReady && <div className="wb-init-overlay" />}
          </>
        )}
      </div>

      {showConfirm && (
        <ConfirmDialog
          title="放弃当前绘制？"
          message="未保存的内容将会丢失。"
          confirmLabel="放弃并返回"
          onConfirm={handleConfirmDiscard}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type === 'success' ? 'success' : 'error'}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
