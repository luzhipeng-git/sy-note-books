import { invokeIPC } from './ipc';
import type { PlaitElement } from '@plait/core';

export interface DrawnixFileData {
  type: 'drawnix';
  version: number;
  source: 'web';
  elements: PlaitElement[];
}

export async function getNextImageIndex(assetsDir: string, docName: string): Promise<number> {
  return invokeIPC<number>('get_next_image_index', { assetsDir, docName });
}

export async function saveDrawnix(
  basePath: string,
  jsonData: string,
  svgContent: string,
): Promise<void> {
  return invokeIPC('save_drawnix', { path: basePath, data: jsonData, svgContent });
}

export async function loadDrawnix(path: string): Promise<DrawnixFileData | null> {
  let raw: string;
  try {
    raw = await invokeIPC<string>('read_file', { path });
  } catch (err) {
    // read_file rejects on missing files or rejected traversal paths.
    // Surface the reason in the console so re-edit failures aren't silent,
    // but return null so the caller can bail out gracefully.
    console.error('读取白板数据失败:', path, err);
    return null;
  }
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (data.type === 'drawnix' && Array.isArray(data.elements)) {
      return data as DrawnixFileData;
    }
    return null;
  } catch {
    return null;
  }
}

export function serializeDrawnixData(elements: PlaitElement[]): string {
  const data: DrawnixFileData = {
    type: 'drawnix',
    version: 1,
    source: 'web',
    elements,
  };
  return JSON.stringify(data);
}

export function exportSvgFromBoard(board: { children: PlaitElement[] } | null): string {
  if (!board) return '';
  const svgHost = (board as any).hostElement;
  if (!svgHost) return '';
  return new XMLSerializer().serializeToString(svgHost);
}

export function buildImagePath(assetsDir: string, docName: string, index: number, ext: string): string {
  const num = String(index).padStart(3, '0');
  return `${assetsDir}/${docName}-img-${num}.${ext}`;
}

export function buildMarkdownRef(docName: string, index: number): string {
  const num = String(index).padStart(3, '0');
  return `![img-${num}](./assets/${docName}-img-${num}.svg)`;
}

export function parseImagePath(src: string): { assetsDir: string; docName: string; index: number } | null {
  const match = src.match(/\.\/assets\/(.+)-img-(\d+)\.(?:svg|png)/);
  if (!match) return null;
  return { assetsDir: './assets', docName: match[1], index: parseInt(match[2], 10) };
}
