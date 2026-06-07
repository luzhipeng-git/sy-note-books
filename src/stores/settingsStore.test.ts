import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from './settingsStore';

describe('settingsStore', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      theme: 'light',
      sidebarWidth: 260,
      recentWorkspaces: [],
    });
  });

  it('starts with light theme', () => {
    const state = useSettingsStore.getState();
    expect(state.theme).toBe('light');
    expect(state.sidebarWidth).toBe(260);
  });

  it('toggles theme', () => {
    const store = useSettingsStore.getState();
    store.toggleTheme();
    expect(useSettingsStore.getState().theme).toBe('dark');

    useSettingsStore.getState().toggleTheme();
    expect(useSettingsStore.getState().theme).toBe('light');
  });

  it('clamps sidebar width between 200 and 400', () => {
    const store = useSettingsStore.getState();

    store.setSidebarWidth(100);
    expect(useSettingsStore.getState().sidebarWidth).toBe(200);

    store.setSidebarWidth(500);
    expect(useSettingsStore.getState().sidebarWidth).toBe(400);

    store.setSidebarWidth(300);
    expect(useSettingsStore.getState().sidebarWidth).toBe(300);
  });

  it('adds recent workspace to front', () => {
    const store = useSettingsStore.getState();
    store.addRecentWorkspace('/path/a', 'Workspace A');

    const state = useSettingsStore.getState();
    expect(state.recentWorkspaces.length).toBe(1);
    expect(state.recentWorkspaces[0].title).toBe('Workspace A');
    expect(state.recentWorkspaces[0].path).toBe('/path/a');
  });

  it('deduplicates recent workspaces', () => {
    const store = useSettingsStore.getState();
    store.addRecentWorkspace('/path/a', 'A');
    store.addRecentWorkspace('/path/b', 'B');
    store.addRecentWorkspace('/path/a', 'A Updated');

    const state = useSettingsStore.getState();
    expect(state.recentWorkspaces.length).toBe(2);
    expect(state.recentWorkspaces[0].title).toBe('A Updated');
  });

  it('removes recent workspace', () => {
    const store = useSettingsStore.getState();
    store.addRecentWorkspace('/path/a', 'A');
    store.addRecentWorkspace('/path/b', 'B');

    store.removeRecentWorkspace('/path/a');
    const state = useSettingsStore.getState();
    expect(state.recentWorkspaces.length).toBe(1);
    expect(state.recentWorkspaces[0].path).toBe('/path/b');
  });
});
