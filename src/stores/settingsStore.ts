import { create } from 'zustand';
import type { RecentWorkspace } from '../types/workspace';
import { invokeIPC } from '../services/ipc';

interface Settings {
  recentWorkspaces: RecentWorkspace[];
  theme: 'light' | 'dark';
  sidebarWidth: number;
  sidebarCollapsed: boolean;
}

interface SettingsState extends Settings {
  loadSettings: () => Promise<void>;
  toggleTheme: () => void;
  setSidebarWidth: (width: number) => void;
  toggleSidebarCollapse: () => void;
  addRecentWorkspace: (path: string, title: string) => void;
  removeRecentWorkspace: (path: string) => void;
}

/** Persist current settings to disk via IPC. */
async function persistSettings(state: Settings): Promise<void> {
  try {
    await invokeIPC('save_settings', {
      settings: {
        recentWorkspaces: state.recentWorkspaces,
        theme: state.theme,
        sidebarWidth: state.sidebarWidth,
        sidebarCollapsed: state.sidebarCollapsed,
      },
    });
  } catch (e) {
    console.error('保存设置失败:', e);
  }
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  recentWorkspaces: [],
  theme: 'light',
  sidebarWidth: 260,
  sidebarCollapsed: false,

  loadSettings: async () => {
    const settings = await invokeIPC<Settings>('get_settings');
    set({
      recentWorkspaces: settings.recentWorkspaces ?? [],
      theme: settings.theme === 'dark' ? 'dark' : 'light',
      sidebarWidth: settings.sidebarWidth ?? 260,
      sidebarCollapsed: settings.sidebarCollapsed ?? false,
    });
  },

  toggleTheme: () => {
    set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' }));
    persistSettings(get());
  },

  setSidebarWidth: (width) => {
    set({ sidebarWidth: Math.max(200, Math.min(400, width)) });
    persistSettings(get());
  },

  toggleSidebarCollapse: () => {
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }));
    persistSettings(get());
  },

  addRecentWorkspace: (path, title) => {
    const { recentWorkspaces } = get();
    const filtered = recentWorkspaces.filter((w) => w.path !== path);
    const updated = [
      { path, title, lastOpened: new Date().toISOString().slice(0, 10) },
      ...filtered,
    ].slice(0, 10);
    set({ recentWorkspaces: updated });
    persistSettings({ ...get(), recentWorkspaces: updated });
  },

  removeRecentWorkspace: (path) => {
    const { recentWorkspaces } = get();
    const updated = recentWorkspaces.filter((w) => w.path !== path);
    set({ recentWorkspaces: updated });
    persistSettings({ ...get(), recentWorkspaces: updated });
  },
}));
