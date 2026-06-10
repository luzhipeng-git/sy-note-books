import { invokeIPC } from './ipc';

/**
 * Export workspace as PDF via Rust-generated HTML + browser print dialog.
 *
 * Flow:
 * 1. Call export_pdf_html IPC to get a complete HTML string
 *    (all pages merged, images as relative paths, print-ready CSS)
 * 2. Write the HTML to a temp file in the workspace
 * 3. Load it in a hidden iframe using file:// protocol
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

  // 2. Write to a temp file so images (relative paths) can be resolved
  const tmpPath = `${workspacePath}/dist/_pdf_preview.html`;
  await invokeIPC('save_file', { path: tmpPath, content: html });

  // 3. Create hidden iframe and load the file
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

  // For Tauri: load via asset protocol so file:// and images resolve correctly
  const isTauri = '__TAURI_INTERNALS__' in window;
  if (isTauri) {
    const { convertFileSrc } = await import('@tauri-apps/api/core');
    const fileUrl = convertFileSrc(tmpPath);

    await new Promise<void>((resolve, reject) => {
      iframe.onload = () => resolve();
      iframe.onerror = () => reject(new Error('加载打印预览失败'));
      iframe.src = fileUrl;
    });
  } else {
    // Fallback: write HTML directly (images won't work in dev mode)
    doc.open();
    doc.write(html);
    doc.close();
  }

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

  // 5. Trigger print
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
