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

  it('calls export_pdf_file_html IPC with single file path and writes HTML into iframe', async () => {
    const mockHtml = '<html><body><img src="assets/img.png"></body></html>';
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

    // Run without Tauri internals (no asset protocol rewrite)
    await exportPdfViaIpc('/test/workspace', '01-intro/quick-start.md');

    expect(invokeIPC).toHaveBeenCalledWith('export_pdf_file_html', {
      workspacePath: '/test/workspace',
      filePath: '01-intro/quick-start.md',
      title: null,
      author: null,
    });

    // Should call IPC exactly once (no save_file)
    expect(invokeIPC).toHaveBeenCalledTimes(1);

    // Should write HTML directly via doc.write
    expect(mockDoc.open).toHaveBeenCalled();
    expect(mockDoc.write).toHaveBeenCalledTimes(1);
    expect(writtenHtml[0]).toBe(mockHtml);
  });

  it('throws when IPC returns empty HTML', async () => {
    (invokeIPC as ReturnType<typeof vi.fn>).mockResolvedValueOnce('');

    await expect(exportPdfViaIpc('/test/workspace', 'test.md')).rejects.toThrow('未生成 HTML 内容');
  });
});
