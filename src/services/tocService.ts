/**
 * Table-of-contents helpers for the markdown editor.
 *
 * Headings are extracted from the raw markdown text (always up-to-date via
 * editorStore.fileContent) rather than the rendered DOM, so the outline is
 * stable regardless of Vditor's render timing. Navigation (scroll) then maps
 * the heading's document-order index back to a live DOM element.
 */

export interface TocItem {
  /** Heading level 1–6. */
  level: number;
  /** Heading text (markers stripped, trimmed). */
  text: string;
  /** 1-based source line number in the markdown text. */
  line: number;
}

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const FENCE_RE = /^(\s*)(`{3,}|~{3,})/;

/**
 * Extract headings from markdown source text.
 *
 * Headings inside fenced code blocks (``` / ~~~) are ignored, since a `#`
 * line there is code, not a heading.
 */
export function extractHeadings(content: string): TocItem[] {
  const lines = content.split('\n');
  const items: TocItem[] = [];
  let inFence = false;
  let fenceMarker = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track fenced code blocks. A fence opens with ``` or ~~~ (optionally
    // indented); it closes with the same marker sequence.
    const fenceMatch = line.match(FENCE_RE);
    if (fenceMatch) {
      const marker = fenceMatch[2][0]; // '`' or '~'
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (marker === fenceMarker) {
        inFence = false;
        fenceMarker = '';
      }
      continue;
    }

    if (inFence) continue;

    const match = line.match(HEADING_RE);
    if (match) {
      items.push({
        level: match[1].length,
        text: match[2].trim(),
        line: i + 1,
      });
    }
  }

  return items;
}

/**
 * Scroll the editor to the Nth heading (0-based document order).
 *
 * Vditor's IR mode renders headings as H1–H6 elements inside `.vditor-ir`.
 * Mapping by index (rather than by source line) is the most reliable approach
 * because the IR DOM structure doesn't map 1:1 to markdown lines.
 */
export function scrollToHeadingIndex(headingIndex: number): void {
  const root = document.querySelector('.vditor-ir');
  if (!root) return;
  const headings = root.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6');
  const target = headings[headingIndex];
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
