import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the IPC module before importing the service
vi.mock('./ipc', () => ({
  invokeIPC: vi.fn(),
}));

import { invokeIPC } from './ipc';
import { exportPdfViaIpc } from './exportService';

describe('exportPdfViaIpc', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('calls export_pdf_html IPC and writes HTML directly into iframe', async () => {
    const mockHtml = '<html><head><base href="file:///test/workspace/"></head><body>Test PDF Content</body></html>';
    (invokeIPC as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockHtml);

    const writtenHtml: string[] = [];
    const mockDoc = {
      open: vi.fn(),
      close: vi.fn(),
      write: vi.fn((html: string) => { writtenHtml.push(html); }),
      querySelectorAll: vi.fn(() => []),
    };
    const mockIframe = {
      style: { position: '', left: '', top: '', width: '', height: '', border: '' },
      contentDocument: mockDoc as unknown as Document,
      contentWindow: { print: vi.fn() } as unknown as Window,
      remove: vi.fn(),
    };

    vi.spyOn(document, 'createElement').mockReturnValue(mockIframe as unknown as HTMLIFrameElement);
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockIframe as unknown as HTMLIFrameElement);

    // Run without Tauri internals (no base href rewrite)
    await exportPdfViaIpc('/test/workspace');

    expect(invokeIPC).toHaveBeenCalledWith('export_pdf_html', {
      workspacePath: '/test/workspace',
      chapter: null,
      title: null,
      author: null,
    });

    // Should NOT call save_file — no temp file needed
    expect(invokeIPC).toHaveBeenCalledTimes(1);

    // Should write HTML directly via doc.write
    expect(mockDoc.open).toHaveBeenCalled();
    expect(mockDoc.write).toHaveBeenCalledTimes(1);
    expect(writtenHtml[0]).toBe(mockHtml);
  });

  it('throws when IPC returns empty HTML', async () => {
    (invokeIPC as ReturnType<typeof vi.fn>).mockResolvedValueOnce('');

    await expect(exportPdfViaIpc('/test/workspace')).rejects.toThrow('未生成 HTML 内容');
  });
});
