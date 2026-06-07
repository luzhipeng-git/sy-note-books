import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useExportStore } from './exportStore';

describe('exportStore', () => {
  beforeEach(() => {
    useExportStore.getState().reset();
  });

  it('starts with dialog closed and config step', () => {
    const state = useExportStore.getState();
    expect(state.isDialogOpen).toBe(false);
    expect(state.step).toBe('config');
    expect(state.exportType).toBe('chm');
    expect(state.scope).toBe('workspace');
  });

  it('opens dialog with fresh state', () => {
    const { getState } = useExportStore;
    getState().setExportType('nginx');
    getState().openDialog(true); // hasWorkspace = true

    const state = getState();
    expect(state.isDialogOpen).toBe(true);
    expect(state.exportType).toBe('chm');
    expect(state.step).toBe('config');
  });

  it('closes dialog and resets state', () => {
    const { getState } = useExportStore;
    getState().openDialog(true);
    expect(getState().isDialogOpen).toBe(true);

    getState().closeDialog();
    expect(getState().isDialogOpen).toBe(false);
  });

  it('sets export type', () => {
    useExportStore.getState().setExportType('nginx');
    expect(useExportStore.getState().exportType).toBe('nginx');

    useExportStore.getState().setExportType('pdf');
    expect(useExportStore.getState().exportType).toBe('pdf');
  });

  it('sets scope to workspace', () => {
    useExportStore.getState().setScope('workspace');
    expect(useExportStore.getState().scope).toBe('workspace');
    expect(useExportStore.getState().selectedChapter).toBeNull();
  });

  it('sets scope to chapter with path', () => {
    useExportStore.getState().setScope('chapter', '01-intro');
    expect(useExportStore.getState().scope).toBe('chapter');
    expect(useExportStore.getState().selectedChapter).toBe('01-intro');
  });

  it('sets title override', () => {
    useExportStore.getState().setTitleOverride('新标题');
    expect(useExportStore.getState().titleOverride).toBe('新标题');
  });

  it('sets author override', () => {
    useExportStore.getState().setAuthorOverride('张三');
    expect(useExportStore.getState().authorOverride).toBe('张三');
  });

  it('retries from error back to config', () => {
    const { getState } = useExportStore;
    getState().openDialog(true);
    // Manually set error state for testing retry
    getState().retry();
    expect(getState().step).toBe('config');
    expect(getState().progress).toBe(0);
    expect(getState().errorMessage).toBeNull();
  });

  it('reset clears all state', () => {
    const { getState } = useExportStore;
    getState().openDialog(true);
    getState().setExportType('nginx');
    getState().setTitleOverride('test');
    getState().reset();

    const state = getState();
    expect(state.isDialogOpen).toBe(false);
    expect(state.exportType).toBe('chm');
    expect(state.titleOverride).toBe('');
    expect(state.progress).toBe(0);
  });

  it('opens to pick-workspace step when no workspace', () => {
    useExportStore.getState().openDialog(false);
    expect(useExportStore.getState().step).toBe('pick-workspace');
    expect(useExportStore.getState().isDialogOpen).toBe(true);
  });

  it('selects workspace and moves to config step', () => {
    useExportStore.getState().openDialog(false);
    useExportStore.getState().selectWorkspace('/mock/workspace');
    expect(useExportStore.getState().selectedWorkspacePath).toBe('/mock/workspace');
    expect(useExportStore.getState().step).toBe('config');
  });
});
