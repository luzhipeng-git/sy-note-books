import { useEffect, useRef } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
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

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);

  useEffect(() => {
    if (!isModified || !activeFilePath || !fileContent) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    const doSave = async (attempt: number): Promise<void> => {
      setSaveStatus('saving');
      try {
        await invokeIPC('save_file', { path: activeFilePath, content: fileContent });
        setModified(false);
        setSaveStatus('saved');
        retryCountRef.current = 0;
      } catch {
        if (attempt < MAX_RETRIES) {
          // Retry after delay
          timerRef.current = setTimeout(() => {
            void doSave(attempt + 1);
          }, RETRY_DELAY_MS);
        } else {
          setSaveStatus('failed');
          retryCountRef.current = 0;
        }
      }
    };

    timerRef.current = setTimeout(() => {
      void doSave(retryCountRef.current);
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [fileContent, isModified, activeFilePath, setModified, setSaveStatus]);
}
