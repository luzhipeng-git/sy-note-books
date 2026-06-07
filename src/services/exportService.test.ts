import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportPdfViaPrint } from './exportService';

describe('exportService', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('does nothing when Vditor IR element is missing', () => {
    const createElementSpy = vi.spyOn(document, 'createElement');
    exportPdfViaPrint();
    expect(createElementSpy).not.toHaveBeenCalledWith('iframe');
    createElementSpy.mockRestore();
  });

  it('does nothing when vditor-reset element is missing', () => {
    const div = document.createElement('div');
    div.className = 'vditor-ir';
    document.body.appendChild(div);

    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    exportPdfViaPrint();
    expect(consoleWarn).toHaveBeenCalledWith('[exportService] Vditor reset element not found');
    consoleWarn.mockRestore();
  });

  it('does nothing when content is empty', () => {
    const div = document.createElement('div');
    div.className = 'vditor-ir';
    const reset = document.createElement('div');
    reset.className = 'vditor-reset';
    reset.innerHTML = '';
    div.appendChild(reset);
    document.body.appendChild(div);

    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    exportPdfViaPrint();
    expect(consoleWarn).toHaveBeenCalledWith('[exportService] No content to export');
    consoleWarn.mockRestore();
  });

  it('creates iframe and triggers print for valid content', () => {
    const div = document.createElement('div');
    div.className = 'vditor-ir';
    const reset = document.createElement('div');
    reset.className = 'vditor-reset';
    reset.innerHTML = '<h1>Test Title</h1><p>Some content</p>';
    div.appendChild(reset);
    document.body.appendChild(div);

    // Mock iframe
    const mockIframe = {
      style: { position: '', left: '', top: '', width: '', height: '', border: '' },
      contentDocument: null as Document | null,
      contentWindow: { print: vi.fn() } as unknown as Window,
    };

    const mockDoc = {
      open: vi.fn(),
      close: vi.fn(),
      write: vi.fn(),
      querySelectorAll: vi.fn(() => []),
    };
    mockIframe.contentDocument = mockDoc as unknown as Document;

    const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(mockIframe as unknown as HTMLIFrameElement);
    const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockIframe as unknown as HTMLIFrameElement);
    const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockIframe as unknown as HTMLIFrameElement);

    exportPdfViaPrint();

    expect(createElementSpy).toHaveBeenCalledWith('iframe');
    expect(appendChildSpy).toHaveBeenCalled();
    expect(mockDoc.open).toHaveBeenCalled();
    expect(mockDoc.write).toHaveBeenCalled();
    expect(mockDoc.close).toHaveBeenCalled();

    createElementSpy.mockRestore();
    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
  });
});
