import { invokeIPC } from './ipc';

/**
 * Export the currently opened Markdown file as PDF
 * via Rust-generated HTML + browser print dialog.
 *
 * Flow:
 * 1. Call export_pdf_file_html IPC to get HTML for the single file
 * 2. Rewrite all relative <img src> to absolute asset protocol URLs
 * 3. Write HTML into a same-origin iframe (avoids cross-origin errors)
 * 4. Trigger window.print() for the user to save as PDF
 */
export async function exportPdfViaIpc(
  workspacePath: string,
  filePath: string,
  title?: string,
  author?: string,
): Promise<void> {
  // 1. Get HTML from Rust backend (single file only)
  const html = await invokeIPC<string>('export_pdf_file_html', {
    workspacePath,
    filePath,
    title: title ?? null,
    author: author ?? null,
  });

  if (!html) {
    throw new Error('导出 PDF 失败：未生成 HTML 内容');
  }

  // 2. Convert relative image paths to absolute asset protocol URLs
  const isTauri = '__TAURI_INTERNALS__' in window;
  let finalHtml = html;

  if (isTauri) {
    const { convertFileSrc } = await import('@tauri-apps/api/core');
    finalHtml = finalHtml.replace(
      /(<img\s[^>]*?)src="([^"]+)"/g,
      (match, prefix: string, src: string) => {
        // Skip absolute URLs (http, data, blob, asset protocol)
        if (
          src.startsWith('http') ||
          src.startsWith('data:') ||
          src.startsWith('blob:') ||
          src.startsWith('/') ||
          src.startsWith('asset://')
        ) {
          return match;
        }
        const relativePath = src.replace(/^\.\//, '');
        const absPath = `${workspacePath}/${relativePath}`;
        return `${prefix}src="${convertFileSrc(absPath)}"`;
      },
    );
  }

  // 3. Create hidden iframe and write HTML directly (same-origin)
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

  doc.open();
  doc.write(finalHtml);
  doc.close();

  // 4. Wait for images to load, then print
  const images = doc.querySelectorAll('img');
  const imagePromises = Array.from(images).map(
    (img) =>
      new Promise<void>((resolve) => {
        if (img.complete) {
          resolve();
        } else {
          img.onload = () => resolve();
          img.onerror = () => resolve();
        }
      }),
  );

  await Promise.all(imagePromises);

  // 5. Trigger print with robust cleanup
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
