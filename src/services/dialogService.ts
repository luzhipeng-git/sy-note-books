import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { open as openPath } from '@tauri-apps/plugin-shell';

const isTauri = '__TAURI_INTERNALS__' in window;

/**
 * Open a native directory picker dialog.
 * Returns the selected directory path, or null if cancelled.
 * Falls back to prompt() in browser dev mode.
 */
export async function pickDirectory(): Promise<string | null> {
  if (isTauri) {
    const selected = await openDialog({ directory: true, multiple: false });
    return selected as string | null;
  }
  // Browser fallback: prompt for path
  const path = prompt('输入 Workspace 目录路径:');
  return path?.trim() || null;
}

/**
 * Open a path in the system file manager.
 * In Tauri, uses the shell plugin to open with the default app.
 * In browser dev mode, logs to console.
 */
export async function openInFileManager(path: string): Promise<void> {
  if (isTauri) {
    try {
      await openPath(path);
    } catch (e) {
      console.error('[openInFileManager] Failed:', e);
      alert(`无法打开目录：${path}\n\n请检查路径是否存在。`);
    }
  } else {
    console.log('[dev] openInFileManager:', path);
  }
}
