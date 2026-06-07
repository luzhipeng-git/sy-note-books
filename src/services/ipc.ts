import { invoke } from '@tauri-apps/api/core';

const isTauri = '__TAURI_INTERNALS__' in window;

export async function invokeIPC<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (isTauri) {
    return invoke<T>(command, args);
  }
  const { mockIPC } = await import('./mockIPC');
  return mockIPC<T>(command, args);
}
