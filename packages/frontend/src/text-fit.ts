// Pixel-accurate text fitting for the G2 display, using Even's
// @evenrealities/pretext metrics of the firmware font. Replaces character
// counts, which break for CJK (20 px per glyph) and Hangul (18 px).
import { getAdvW, getTextWidth, measureTextWrap, pxTruncate } from '@evenrealities/pretext';

/** 576 px container minus 4 px padding and 1 px border on each side. */
export const BORDERED_INNER = 566;
/** 576 px container minus 4 px padding on each side, no border. */
export const CONTENT_INNER = 568;
/** Reading page: 218 px content area / 27 px line height = 8 lines; keep one spare. */
export const PAGE_LINES = 7;

const SPACE = getTextWidth(' ') || 5;
const SAFETY = 2;

export const textWidth = (s: string) => getTextWidth(s);
export const fitWidth = (s: string, px: number) => pxTruncate(s, Math.max(0, px));

/** left ... right on one line, right-aligned with spaces. Truncates left if needed. */
export function spreadLine(left: string, right: string, inner = BORDERED_INNER): string {
  const budget = inner - SAFETY;
  const rightW = getTextWidth(right);
  const l = getTextWidth(left) + SPACE + rightW > budget ? pxTruncate(left, budget - rightW - SPACE) : left;
  const spaces = Math.max(1, Math.floor((budget - getTextWidth(l) - rightW) / SPACE));
  return l + ' '.repeat(spaces) + right;
}

export function alignRight(right: string, inner = BORDERED_INNER): string {
  const spaces = Math.max(0, Math.floor((inner - SAFETY - getTextWidth(right)) / SPACE));
  return ' '.repeat(spaces) + right;
}

const STOP_MARKS = ['. ', '! ', '? ', '\u3002', '\uff01', '\uff1f'];

/** Split text into pages that each fit PAGE_LINES lines of the reading view. */
export function paginateByLines(text: string, maxLines = PAGE_LINES, width = CONTENT_INNER): string[] {
  const pages: string[] = [];
  let remaining = text.trim();
  while (remaining) {
    if (measureTextWrap(remaining, width).lineCount <= maxLines) {
      pages.push(remaining);
      break;
    }
    const chars = Array.from(remaining);
    let lo = 1;
    let hi = chars.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (measureTextWrap(chars.slice(0, mid).join(''), width).lineCount <= maxLines) lo = mid;
      else hi = mid - 1;
    }
    const fit = chars.slice(0, lo).join('');
    // Prefer a sentence end in the last 40 % of the page, then a space, then a hard cut.
    let cut = -1;
    for (const mark of STOP_MARKS) {
      const i = fit.lastIndexOf(mark);
      if (i >= 0) cut = Math.max(cut, i + 1);
    }
    if (cut < fit.length * 0.6) {
      const space = fit.lastIndexOf(' ');
      cut = space > fit.length * 0.5 ? space : fit.length;
    }
    pages.push(fit.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  return pages;
}

/** Characters the firmware font cannot draw (they are silently dropped on the glasses). */
export function missingGlyphs(text: string): string[] {
  const missing = new Set<string>();
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp === 10 || cp === 13) continue;
    if (getAdvW(cp) === 0) missing.add(ch);
  }
  return [...missing];
}
