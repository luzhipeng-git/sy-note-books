import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExportDialog } from './ExportDialog';
import { useExportStore } from '../../stores/exportStore';

describe('ExportDialog', () => {
  beforeEach(() => {
    useExportStore.getState().reset();
  });

  it('renders nothing when dialog is closed', () => {
    render(<ExportDialog />);
    expect(screen.queryByText('导出配置')).toBeNull();
  });

  it('renders config step when dialog is open', () => {
    useExportStore.getState().openDialog(true);
    render(<ExportDialog />);

    expect(screen.getByText(/导出配置/)).toBeTruthy();
    expect(screen.getByText('CHM')).toBeTruthy();
    expect(screen.getByText('Nginx')).toBeTruthy();
    expect(screen.getByText('PDF')).toBeTruthy();
    expect(screen.getByText('开始导出')).toBeTruthy();
  });

  it('shows scope selector for CHM type', () => {
    useExportStore.getState().openDialog(true);
    render(<ExportDialog />);

    expect(screen.getByText('导出范围')).toBeTruthy();
  });

  it('shows PDF hint for PDF type', () => {
    useExportStore.getState().openDialog(true);
    useExportStore.getState().setExportType('pdf');
    render(<ExportDialog />);

    expect(screen.getByText(/系统打印对话框/)).toBeTruthy();
  });

  it('closes dialog on cancel button click', () => {
    useExportStore.getState().openDialog(true);
    render(<ExportDialog />);

    fireEvent.click(screen.getByText('取消'));
    expect(useExportStore.getState().isDialogOpen).toBe(false);
  });

  it('selects export type on card click', () => {
    useExportStore.getState().openDialog(true);
    render(<ExportDialog />);

    fireEvent.click(screen.getByText('Nginx'));
    expect(useExportStore.getState().exportType).toBe('nginx');
  });

  it('renders progress step', () => {
    useExportStore.getState().openDialog(true);
    useExportStore.getState().startExport('/mock');
    // Force state to progress
    useExportStore.setState({ step: 'progress', progress: 50, progressText: '处理中...', progressDetail: '详细步骤' });
    render(<ExportDialog />);

    expect(screen.getByText('处理中...')).toBeTruthy();
    expect(screen.getByText('详细步骤')).toBeTruthy();
  });

  it('renders success step with output path', () => {
    useExportStore.getState().openDialog(true);
    useExportStore.setState({ step: 'success', outputPath: '/dist/workspace/chm-v1' });
    render(<ExportDialog />);

    expect(screen.getByText(/导出成功/)).toBeTruthy();
    expect(screen.getByText('/dist/workspace/chm-v1')).toBeTruthy();
  });

  it('renders error step with error message', () => {
    useExportStore.getState().openDialog(true);
    useExportStore.setState({ step: 'error', errorMessage: '磁盘空间不足' });
    render(<ExportDialog />);

    expect(screen.getByText(/导出失败/)).toBeTruthy();
    expect(screen.getByText('磁盘空间不足')).toBeTruthy();
  });

  it('retries on error step', () => {
    useExportStore.getState().openDialog(true);
    useExportStore.setState({ step: 'error', errorMessage: 'some error' });
    render(<ExportDialog />);

    fireEvent.click(screen.getByText('重试'));
    expect(useExportStore.getState().step).toBe('config');
  });
});
