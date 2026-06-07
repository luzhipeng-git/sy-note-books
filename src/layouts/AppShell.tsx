import { useEffect } from 'react';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useSearchStore } from '../stores/searchStore';
import { useExportStore } from '../stores/exportStore';
import { useEditorStore } from '../stores/editorStore';
import { useWhiteboardStore } from '../stores/whiteboardStore';
import { Sidebar } from '../components/sidebar/Sidebar';
import { SidebarResizeHandle } from '../components/sidebar/SidebarResizeHandle';
import { MainToolbar } from '../components/toolbar/MainToolbar';
import { Breadcrumb } from '../components/toolbar/Breadcrumb';
import { EditorHost } from '../components/editor/EditorHost';
import { StatusBar } from '../components/common/StatusBar';
import { GlobalSearchDialog } from '../components/search/GlobalSearchDialog';
import { ExportDialog } from '../components/export/ExportDialog';

export function AppShell() {
  const { rootPath, activeEditorType } = useWorkspaceStore();
  const { sidebarWidth, sidebarCollapsed } = useSettingsStore();

  const showSidebar = rootPath !== null && activeEditorType !== 'whiteboard';
  const displayWidth = sidebarCollapsed ? 42 : sidebarWidth;

  // Global keyboard shortcuts for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip global shortcuts in whiteboard mode — whiteboard handles its own keys
      if (useWorkspaceStore.getState().activeEditorType === 'whiteboard') return;

      // Ctrl+Shift+F: Toggle global search
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        const searchState = useSearchStore.getState();
        if (searchState.isGlobalSearchOpen) {
          searchState.closeGlobalSearch();
        } else {
          searchState.openGlobalSearch();
        }
        return;
      }

      // Ctrl+F: Open document search (let Vditor handle if editor is focused)
      if (e.ctrlKey && !e.shiftKey && e.key === 'f') {
        // Check if Vditor IR editor has focus — if so, let Vditor's built-in search handle it
        const vditorIr = document.querySelector('.vditor-ir:focus-within');
        if (vditorIr) {
          // Let Vditor's built-in Ctrl+F work
          return;
        }

        // Otherwise, show our document search UI (for non-editor contexts)
        e.preventDefault();
        useSearchStore.getState().openDocumentSearch();
        return;
      }

      // Ctrl+P: Open export dialog
      if (e.ctrlKey && !e.shiftKey && e.key === 'p') {
        e.preventDefault();
        const hasWorkspace = useWorkspaceStore.getState().rootPath !== null;
        useExportStore.getState().openDialog(hasWorkspace);
        return;
      }

      // Ctrl+Shift+D: Enter whiteboard mode
      if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        const wsState = useWorkspaceStore.getState();
        if (wsState.activeFilePath) {
          const cursorLine = useEditorStore.getState().cursorLine;
          const anchor = {
            sourceFilePath: wsState.activeFilePath,
            cursorPosition: cursorLine,
            nearestHeading: '当前段落',
          };
          useWhiteboardStore.getState().initNew(anchor);
          wsState.enterWhiteboard(anchor);
        }
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="app-shell">
      {showSidebar && (
        <>
          <div
            style={{
              width: displayWidth,
              flexShrink: 0,
              height: '100%',
              transition: 'width 200ms ease',
              overflow: 'hidden',
            }}
          >
            <Sidebar collapsed={sidebarCollapsed} />
          </div>
          {!sidebarCollapsed && <SidebarResizeHandle />}
        </>
      )}
      <div className="main-area">
        <MainToolbar />
        <Breadcrumb />
        <EditorHost />
        <StatusBar />
      </div>
      <GlobalSearchDialog />
      <ExportDialog />
    </div>
  );
}
