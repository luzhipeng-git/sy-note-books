import { open } from '@tauri-apps/plugin-dialog';

const isTauri = '__TAURI_INTERNALS__' in window;

/**
 * Open a native directory picker dialog.
 * Returns the selected directory path, or null if cancelled.
 * Falls back to prompt() in browser dev mode.
 */
export async function pickDirectory(): Promise<string | null> {
  if (isTauri) {
    const selected = await open({ directory: true, multiple: false });
    return selected as string | null;
  }
  // Browser fallback: prompt for path
  const path = prompt('输入 Workspace 目录路径:');
  return path?.trim() || null;
}
