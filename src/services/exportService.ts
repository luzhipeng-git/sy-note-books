import { invokeIPC } from './ipc';

/**
 * Export workspace as PDF via Rust-generated HTML + browser print dialog.
 *
 * Flow:
 * 1. Call export_pdf_html IPC to get a complete HTML string
 *    (all pages merged, images as relative paths, print-ready CSS)
 * 2. Rewrite the <base href="file://..."> to use Tauri asset protocol URL
 * 3. Write HTML directly into a same-origin iframe (avoids cross-origin)
 * 4. Trigger window.print() for the user to save as PDF
 */
export async function exportPdfViaIpc(
  workspacePath: string,
  chapter?: string,
  title?: string,
  author?: string,
): Promise<void> {
  // 1. Get HTML from Rust backend
  const html = await invokeIPC<string>('export_pdf_html', {
    workspacePath,
    chapter: chapter ?? null,
    title: title ?? null,
    author: author ?? null,
  });

  if (!html) {
    throw new Error('导出 PDF 失败：未生成 HTML 内容');
  }

  // 2. Rewrite <base href="file://..."> to asset protocol URL
  //    so that relative image paths resolve correctly in same-origin iframe
  const isTauri = '__TAURI_INTERNALS__' in window;
  let finalHtml = html;

  if (isTauri) {
    const { convertFileSrc } = await import('@tauri-apps/api/core');
    const assetBase = convertFileSrc(workspacePath);
    finalHtml = html.replace(
      /<base href="file:\/\/[^"]*\/">/,
      `<base href="${assetBase}/">`,
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

  // Write HTML directly — iframe is same-origin (about:blank → inherits parent origin)
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

  // 5. Trigger print — same-origin iframe, no cross-origin error
  const win = iframe.contentWindow;
  if (win) {
    let removed = false;
    const cleanup = () => {
      if (!removed) {
        removed = true;
        iframe.remove();
      }
    };
    window.addEventListener('afterprint', cleanup, { once: true });
    win.print();
    setTimeout(cleanup, 30000);
  }
}
