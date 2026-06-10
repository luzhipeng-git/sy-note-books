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

  it('calls export_pdf_html IPC and writes temp file', async () => {
    const mockHtml = '<html><body>Test PDF Content</body></html>';
    (invokeIPC as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockHtml)   // export_pdf_html
      .mockResolvedValueOnce(undefined); // save_file

    // Mock iframe
    const mockDoc = {
      open: vi.fn(),
      close: vi.fn(),
      write: vi.fn(),
      querySelectorAll: vi.fn(() => []),
    };
    const mockIframe = {
      style: { position: '', left: '', top: '', width: '', height: '', border: '' },
      contentDocument: mockDoc as unknown as Document,
      contentWindow: { print: vi.fn() } as unknown as Window,
      remove: vi.fn(),
      src: '',
      onload: null as (() => void) | null,
      onerror: null as (() => void) | null,
    };

    vi.spyOn(document, 'createElement').mockReturnValue(mockIframe as unknown as HTMLIFrameElement);
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockIframe as unknown as HTMLIFrameElement);

    // Trigger the onload after src is set
    const originalSet = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src');
    Object.defineProperty(mockIframe, 'src', {
      set(v: string) {
        (mockIframe as unknown as Record<string, string>).__src = v;
        // Trigger onload synchronously
        if (mockIframe.onload) mockIframe.onload();
      },
      get() {
        return (mockIframe as unknown as Record<string, string>).__src;
      },
    });

    // Run without Tauri internals (falls back to doc.write)
    await exportPdfViaIpc('/test/workspace');

    expect(invokeIPC).toHaveBeenCalledWith('export_pdf_html', {
      workspacePath: '/test/workspace',
      chapter: null,
      title: null,
      author: null,
    });

    expect(invokeIPC).toHaveBeenCalledWith('save_file', {
      path: '/test/workspace/dist/_pdf_preview.html',
      content: mockHtml,
    });
  });

  it('throws when IPC returns empty HTML', async () => {
    (invokeIPC as ReturnType<typeof vi.fn>).mockResolvedValueOnce('');

    await expect(exportPdfViaIpc('/test/workspace')).rejects.toThrow('未生成 HTML 内容');
  });
});
