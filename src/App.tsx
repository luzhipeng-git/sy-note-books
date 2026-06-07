import { useEffect } from 'react';
import { useSettingsStore } from './stores/settingsStore';
import { useWorkspaceStore } from './stores/workspaceStore';
import { useSearchStore } from './stores/searchStore';
import { useExportStore } from './stores/exportStore';
import { useWhiteboardStore } from './stores/whiteboardStore';
import { AppShell } from './layouts/AppShell';
import { ErrorBoundary } from './components/common/ErrorBoundary';

// Expose stores to window for E2E tests (bypasses native dialog & keyboard limitations)
if (typeof window !== 'undefined') {
  (window as any).__SETTINGS_STORE__ = useSettingsStore;
  (window as any).__WORKSPACE_STORE__ = useWorkspaceStore;
  (window as any).__SEARCH_STORE__ = useSearchStore;
  (window as any).__EXPORT_STORE__ = useExportStore;
  (window as any).__WHITEBOARD_STORE__ = useWhiteboardStore;
}

export default function App() {
  const { theme, loadSettings } = useSettingsStore();

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  return (
    <ErrorBoundary>
      <div data-theme={theme}>
        <AppShell />
      </div>
    </ErrorBoundary>
  );
}
