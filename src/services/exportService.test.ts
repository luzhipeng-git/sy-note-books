import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the IPC module before importing the service
vi.mock('./ipc', () => ({
  invokeIPC: vi.fn(),
}));

import { invokeIPC } from './ipc';
import { exportPdfViaNative } from './exportService';

describe('exportPdfViaNative', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls export_pdf_file IPC with correct parameters', async () => {
    (invokeIPC as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

    const result = await exportPdfViaNative(
      '/test/workspace',
      '01-intro/quick-start.md',
      '/home/user/Desktop/output.pdf',
      '测试标题',
      '测试作者',
    );

    expect(invokeIPC).toHaveBeenCalledWith('export_pdf_file', {
      workspacePath: '/test/workspace',
      filePath: '01-intro/quick-start.md',
      outputPath: '/home/user/Desktop/output.pdf',
      title: '测试标题',
      author: '测试作者',
    });

    expect(result).toBe('/home/user/Desktop/output.pdf');
  });

  it('passes null for missing title/author', async () => {
    (invokeIPC as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

    await exportPdfViaNative('/ws', 'test.md', '/out.pdf');

    expect(invokeIPC).toHaveBeenCalledWith('export_pdf_file', {
      workspacePath: '/ws',
      filePath: 'test.md',
      outputPath: '/out.pdf',
      title: null,
      author: null,
    });
  });
});
