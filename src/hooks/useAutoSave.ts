import { useEffect, useRef } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useSearchStore } from '../stores/searchStore';
import { invokeIPC } from '../services/ipc';

const DEBOUNCE_MS = 1000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 2000;

export function useAutoSave() {
  const fileContent = useEditorStore((s) => s.fileContent);
  const isModified = useEditorStore((s) => s.isModified);
  const setModified = useEditorStore((s) => s.setModified);
  const setSaveStatus = useEditorStore((s) => s.setSaveStatus);
  const activeFilePath = useWorkspaceStore((s) => s.activeFilePath);
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const activeEditorType = useWorkspaceStore((s) => s.activeEditorType);

  // Separate timer for the initial debounced save vs. retries.
  // Reusing a single ref caused the cleanup of the debounce effect to cancel
  // pending retries (and vice-versa), so they are tracked independently.
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);

  useEffect(() => {
    // Guard: only auto-save while editing markdown in the normal editor.
    // The whiteboard "save & insert" flow writes the file directly; letting
    // auto-save race with it can overwrite the just-inserted image reference.
    if (activeEditorType !== 'markdown') return;
    if (!isModified || !activeFilePath || !fileContent || !rootPath) return;

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    const doSave = async (attempt: number): Promise<void> => {
      setSaveStatus('saving');
      try {
        await invokeIPC('save_file', { path: `${rootPath}/${activeFilePath}`, content: fileContent });
        setModified(false);
        setSaveStatus('saved');
        retryCountRef.current = 0;

        // Keep the search index in sync with the saved content.
        // Without this, search results reflect stale content until a full
        // index rebuild (workspace reopen / tree CRUD).
        const summary = useWorkspaceStore.getState().summary;
        useSearchStore.getState().updateDocument(activeFilePath, fileContent, summary);
      } catch {
        if (attempt < MAX_RETRIES) {
          // Retry after delay — uses a SEPARATE timer so debounce cleanup
          // doesn't cancel an in-flight retry.
          retryTimerRef.current = setTimeout(() => {
            void doSave(attempt + 1);
          }, RETRY_DELAY_MS);
        } else {
          setSaveStatus('failed');
          retryCountRef.current = 0;
        }
      }
    };

    debounceTimerRef.current = setTimeout(() => {
      void doSave(retryCountRef.current);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [fileContent, isModified, activeFilePath, rootPath, activeEditorType, setModified, setSaveStatus]);

  // Cancel any pending retry when the component unmounts or the file changes
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [activeFilePath]);
}
