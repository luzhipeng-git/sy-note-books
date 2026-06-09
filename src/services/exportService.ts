/** Print styles injected into the export iframe for PDF generation. */
const PRINT_STYLES = `
@media print {
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 12pt;
    line-height: 1.6;
    color: #000;
    max-width: 100%;
    margin: 0;
    padding: 1cm;
  }
  h1 { font-size: 20pt; margin-top: 24pt; page-break-after: avoid; }
  h2 { font-size: 16pt; margin-top: 20pt; page-break-after: avoid; }
  h3 { font-size: 14pt; margin-top: 16pt; page-break-after: avoid; }
  h4, h5, h6 { font-size: 12pt; margin-top: 12pt; page-break-after: avoid; }
  pre {
    background: #f5f5f5;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 8pt;
    font-size: 9pt;
    overflow-x: auto;
    white-space: pre-wrap;
    word-wrap: break-word;
  }
  code {
    font-family: 'Fira Code', 'Consolas', monospace;
    font-size: 9pt;
  }
  img {
    max-width: 100%;
    page-break-inside: avoid;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 8pt 0;
  }
  th, td {
    border: 1px solid #ccc;
    padding: 4pt 8pt;
    text-align: left;
  }
  th { background: #f5f5f5; font-weight: 600; }
  blockquote {
    border-left: 3px solid #ccc;
    margin-left: 0;
    padding-left: 12pt;
    color: #555;
  }
  a { color: #2563eb; text-decoration: none; }
  .vditor-ir { display: none; }
}
`;

/**
 * Export the current Vditor editor content as PDF via the browser print dialog.
 * Creates a hidden iframe, injects rendered HTML with print styles,
 * triggers window.print(), then cleans up.
 */
export function exportPdfViaPrint(): void {
  // Find the Vditor instance's rendered HTML
  const vditorIr = document.querySelector('.vditor-ir');
  if (!vditorIr) {
    console.warn('[exportService] Vditor IR element not found');
    return;
  }

  // Get the HTML content from Vditor IR preview
  const previewContent = vditorIr.querySelector('.vditor-reset');
  if (!previewContent) {
    console.warn('[exportService] Vditor reset element not found');
    return;
  }

  const htmlContent = (previewContent as HTMLElement).innerHTML;
  if (!htmlContent || !htmlContent.trim()) {
    console.warn('[exportService] No content to export');
    return;
  }

  // Create hidden iframe
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
    document.body.removeChild(iframe);
    return;
  }

  // Write content with print styles
  doc.open();
  doc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>${PRINT_STYLES}</style>
</head>
<body>${htmlContent}</body>
</html>`);
  doc.close();

  // Wait for images to load, then print
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

  Promise.all(imagePromises).then(() => {
    const win = iframe.contentWindow;
    if (win) {
      // Clean up iframe only after print dialog fully closes.
      // Listen on the main window (not iframe) — some browsers only fire
      // afterprint on the window that called print().
      let removed = false;
      const cleanup = () => {
        if (!removed) {
          removed = true;
          iframe.remove();
        }
      };
      window.addEventListener('afterprint', cleanup, { once: true });
      win.print();
      // Safety fallback in case afterprint never fires (e.g. old browsers)
      setTimeout(cleanup, 30000);
    }
  });
}
