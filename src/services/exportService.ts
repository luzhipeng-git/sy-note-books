import { invokeIPC } from './ipc';

/**
 * Export the currently opened Markdown file as PDF
 * via Rust-generated HTML + browser print dialog.
 *
 * Flow:
 * 1. Call export_pdf_file_html IPC — Rust embeds images as base64 data URIs
 * 2. Write HTML into a same-origin iframe (avoids cross-origin errors)
 * 3. Trigger window.print() for the user to save as PDF
 */
export async function exportPdfViaIpc(
  workspacePath: string,
  filePath: string,
  title?: string,
  author?: string,
): Promise<void> {
  // 1. Get HTML from Rust backend (images already embedded as base64)
  const html = await invokeIPC<string>('export_pdf_file_html', {
    workspacePath,
    filePath,
    title: title ?? null,
    author: author ?? null,
  });

  if (!html) {
    throw new Error('导出 PDF 失败：未生成 HTML 内容');
  }

  // 2. Create hidden iframe and write HTML directly (same-origin)
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-9999px';
  iframe.style.top = '-9999px';
  iframe.style.width = '210mm';
  iframe.style.height = '297mm';
  iframe.style.border = 'none';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    throw new Error('无法创建打印预览');
  }

  // Write HTML directly — iframe inherits parent origin, so print() works
  doc.open();
  doc.write(html);
  doc.close();

  // 3. Trigger print with robust cleanup
  const win = iframe.contentWindow;
  if (win) {
    let removed = false;
    const cleanup = () => {
      if (!removed) {
        removed = true;
        window.removeEventListener('beforeunload', handleBeforeUnload);
        iframe.remove();
      }
    };

    // Ensure iframe is removed even if user closes app during print dialog
    const handleBeforeUnload = () => cleanup();
    window.addEventListener('beforeunload', handleBeforeUnload);

    window.addEventListener('afterprint', cleanup, { once: true });
    win.print();
    // Fallback cleanup in case afterprint doesn't fire
    setTimeout(cleanup, 30000);
  }
}
