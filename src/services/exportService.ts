import { invokeIPC } from './ipc';

/**
 * Export the currently opened Markdown file as PDF
 * via native Rust PDF generation (no WebView print).
 *
 * Flow:
 * 1. Call export_pdf_file IPC — Rust generates PDF directly to disk
 * 2. Returns the output file path
 */
export async function exportPdfViaNative(
  workspacePath: string,
  filePath: string,
  outputPath: string,
  title?: string,
  author?: string,
): Promise<string> {
  await invokeIPC('export_pdf_file', {
    workspacePath,
    filePath,
    outputPath,
    title: title ?? null,
    author: author ?? null,
  });
  return outputPath;
}
