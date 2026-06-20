import {
  CreateStartUpPageContainer,
  RebuildPageContainer,
  TextContainerProperty,
} from '@evenrealities/even_hub_sdk';
import { getBridge } from './bridge';
import { AppState, Landmark } from './types';
import { getUnits } from './units';
import { bearingTo, cardinalDirection } from './compass';
import { DISPLAY_WIDTH, DISPLAY_HEIGHT, HEADER_HEIGHT, FOOTER_HEIGHT, VISIBLE_LANDMARKS } from './constants';

const LIST_HEIGHT = DISPLAY_HEIGHT - HEADER_HEIGHT - FOOTER_HEIGHT;

function makeHeader(text: string): TextContainerProperty {
  return new TextContainerProperty({
    containerID: 1,
    containerName: 'header',
    xPosition: 0,
    yPosition: 0,
    width: DISPLAY_WIDTH,
    height: HEADER_HEIGHT,
    borderWidth: 1,
    borderColor: 8,
    borderRadius: 6,
    paddingLength: 4,
    content: text,
    isEventCapture: 0,
  });
}

// Invisible container solely for capturing input events (G2 guide pattern).
// Prevents native text scroll on visible containers.
function makeEventCapture(): TextContainerProperty {
  return new TextContainerProperty({
    containerID: 4,
    containerName: 'capture',
    xPosition: 0,
    yPosition: 0,
    width: DISPLAY_WIDTH,
    height: DISPLAY_HEIGHT,
    borderWidth: 0,
    borderColor: 0,
    borderRadius: 0,
    paddingLength: 0,
    content: ' ',
    isEventCapture: 1,
  });
}

function makeContent(text: string): TextContainerProperty {
  return new TextContainerProperty({
    containerID: 2,
    containerName: 'content',
    xPosition: 0,
    yPosition: HEADER_HEIGHT,
    width: DISPLAY_WIDTH,
    height: LIST_HEIGHT,
    borderWidth: 0,
    borderColor: 0,
    borderRadius: 6,
    paddingLength: 4,
    content: text,
    isEventCapture: 0,
  });
}

// Width of the distance column on the right side of the list
const DIST_COL_WIDTH = 65;
const NAME_COL_WIDTH = DISPLAY_WIDTH - DIST_COL_WIDTH; // 456px

function makeNameColumn(text: string): TextContainerProperty {
  return new TextContainerProperty({
    containerID: 2,
    containerName: 'list-names',
    xPosition: 0,
    yPosition: HEADER_HEIGHT,
    width: NAME_COL_WIDTH,
    height: LIST_HEIGHT,
    borderWidth: 0,
    borderColor: 0,
    borderRadius: 0,
    paddingLength: 4,
    content: text,
    isEventCapture: 0,
  });
}

function makeDistColumn(text: string): TextContainerProperty {
  return new TextContainerProperty({
    containerID: 3,
    containerName: 'list-dists',
    xPosition: NAME_COL_WIDTH,
    yPosition: HEADER_HEIGHT,
    width: DIST_COL_WIDTH,
    height: LIST_HEIGHT,
    borderWidth: 0,
    borderColor: 0,
    borderRadius: 0,
    paddingLength: 4,
    content: text,
    isEventCapture: 0,
  });
}

function makeFooter(text: string): TextContainerProperty {
  return new TextContainerProperty({
    containerID: 3,
    containerName: 'footer',
    xPosition: 0,
    yPosition: DISPLAY_HEIGHT - FOOTER_HEIGHT,
    width: DISPLAY_WIDTH,
    height: FOOTER_HEIGHT,
    borderWidth: 1,
    borderColor: 5,
    borderRadius: 6,
    paddingLength: 4,
    content: text,
    isEventCapture: 0,
  });
}
// List view uses 5 containers (header, names, dists, footer, capture) so needs
// dedicated footer/capture helpers with IDs 4 and 5 to avoid colliding with dist (ID 3).
function makeListFooter(text: string): TextContainerProperty {
  return new TextContainerProperty({
    containerID: 4,
    containerName: 'list-footer',
    xPosition: 0,
    yPosition: DISPLAY_HEIGHT - FOOTER_HEIGHT,
    width: DISPLAY_WIDTH,
    height: FOOTER_HEIGHT,
    borderWidth: 1,
    borderColor: 5,
    borderRadius: 6,
    paddingLength: 4,
    content: text,
    isEventCapture: 0,
  });
}

function makeListCapture(): TextContainerProperty {
  return new TextContainerProperty({
    containerID: 5,
    containerName: 'list-capture',
    xPosition: 0,
    yPosition: 0,
    width: DISPLAY_WIDTH,
    height: DISPLAY_HEIGHT,
    borderWidth: 0,
    borderColor: 0,
    borderRadius: 0,
    paddingLength: 0,
    content: ' ',
    isEventCapture: 1,
  });
}

// Footer width: 576px, 4px padding each side ≈ 94 chars at ~6.2px avg
const FOOTER_COLS = 99;
// Header font is larger — ~46 chars across the same width
const HEADER_COLS = 87;

function headerBoth(left: string, right: string): string {
  return left + ' '.repeat(Math.max(1, HEADER_COLS - left.length - right.length)) + right;
}

function footerRight(right: string): string {
  return ' '.repeat(Math.max(0, FOOTER_COLS - right.length)) + right;
}

function footerBoth(left: string, right: string): string {
  return left + ' '.repeat(Math.max(1, FOOTER_COLS - left.length - right.length)) + right;
}

function formatDistance(meters: number): string {
  if (getUnits() === 'metric') {
    return meters < 1000 ? `${Math.round(meters)}m` : `${(meters / 1000).toFixed(1)}km`;
  }
  const miles = meters / 1609.344;
  return miles < 0.1 ? `${Math.round(meters * 3.281)}ft` : `${miles.toFixed(1)}mi`;
}

function makeDetailHeader(name: string, distance: number): TextContainerProperty {
  const dist = formatDistance(distance);
  const maxName = 45 - dist.length - 2;
  return makeHeader(`${truncate(name, maxName)}  ${dist}`);
}

function truncate(text: string, maxLen: number): string {
  return text.length <= maxLen ? text : text.slice(0, maxLen - 3) + '...';
}

export async function renderStartup(): Promise<void> {
  const bridge = getBridge();
  await bridge.createStartUpPageContainer(new CreateStartUpPageContainer({
    containerTotalNum: 4,
    textObject: [
      makeHeader('Wondereye'),
      makeContent('Finding nearby landmarks...'),
      makeFooter(footerBoth('Please wait', 'Wondereye')),
      makeEventCapture(),
    ],
  }));
}

export async function renderLoading(message = 'Finding nearby landmarks...'): Promise<void> {
  const bridge = getBridge();
  await bridge.rebuildPageContainer(new RebuildPageContainer({
    containerTotalNum: 4,
    textObject: [
      makeHeader('Wondereye'),
      makeContent(message),
      makeFooter(footerBoth('Please wait', 'Wondereye')),
      makeEventCapture(),
    ],
  }));
}

// Names and distances are rendered in two side-by-side pixel-positioned containers so
// distances always align to the same x regardless of proportional font character widths.
// NAME_COL_WIDTH=456px, DIST_COL_WIDTH=120px (defined above with the container helpers).
// NAME_COL_WIDTH is 511px. At ~12px/char for accented European text, 42 chars ≈ 504px — safe margin.
const LIST_NAME_TRUNCATE = 42;

function formatListColumns(
  landmarks: Landmark[],
  selectedIndex: number,
  compassHighlight?: number | null,
): { names: string; dists: string } {
  const start = Math.max(0, selectedIndex - (VISIBLE_LANDMARKS - 1));
  const end = Math.min(landmarks.length, start + VISIBLE_LANDMARKS);

  const nameLines: string[] = [];
  const distLines: string[] = [];
  for (let i = start; i < end; i++) {
    const isSelected = i === selectedIndex;
    const isCompass = compassHighlight != null && i === compassHighlight;
    const prefix = isSelected && isCompass ? '>*' : isSelected ? '> ' : isCompass ? '* ' : '  ';
    nameLines.push(prefix + truncate(landmarks[i].name, LIST_NAME_TRUNCATE));
    distLines.push(formatDistance(landmarks[i].distance));
  }
  return { names: nameLines.join('\n'), dists: distLines.join('\n') };
}

export async function renderList(state: AppState): Promise<void> {
  const bridge = getBridge();
  const lm = state.landmarks[state.selectedIndex];
  let dirLabel = '';
  if (state.userLat != null && state.userLng != null && lm?.lat != null && lm?.lng != null) {
    dirLabel = cardinalDirection(bearingTo(state.userLat, state.userLng, lm.lat, lm.lng));
  }
  const leftText = state.city || 'Scroll: browse  Tap: details';
  const footerText = dirLabel ? footerBoth(leftText, dirLabel) : leftText;
  const { names, dists } = formatListColumns(state.landmarks, state.selectedIndex, state.compassHighlight);

  await bridge.rebuildPageContainer(new RebuildPageContainer({
    containerTotalNum: 5,
    textObject: [
      makeHeader(headerBoth('Nearby Landmarks', 'Wondereye')),
      makeNameColumn(names),
      makeDistColumn(dists),
      makeListFooter(footerText),
      makeListCapture(),
    ],
  }));
}

// 218px content area, ~26px/line ≈ 8 lines, ~55 chars/line ≈ 440 chars max; use 350 for safe margin
const CHARS_PER_PAGE = 350;

export function paginateText(text: string): string[] {
  if (!text) return ['No additional details available.'];
  const pages: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= CHARS_PER_PAGE) {
      pages.push(remaining);
      break;
    }
    // Prefer breaking after a sentence-ending period, but only if it's at least
    // 60% through the budget — avoids sparse pages when an early sentence ends well
    // before the limit and the next one would overflow.
    const sentenceCut = remaining.lastIndexOf('. ', CHARS_PER_PAGE);
    const minSentenceCut = CHARS_PER_PAGE * 0.6;
    let cut = sentenceCut > minSentenceCut ? sentenceCut + 1 : remaining.lastIndexOf(' ', CHARS_PER_PAGE);
    if (cut <= 0) cut = CHARS_PER_PAGE;
    pages.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }
  return pages;
}

export async function renderReadingPage(landmark: Landmark, page: string, _pageNum: number, totalPages: number, loading = false, detailLoaded = false): Promise<void> {
  const bridge = getBridge();
  const hint = loading ? 'Loading details...'
    : !detailLoaded && totalPages <= 1 ? 'Tap: Load More'
    : totalPages > 1 ? '\u2191\u2193 Scroll'
    : '';
  const footer = hint ? footerBoth(hint, 'Wondereye') : footerRight('Wondereye');

  await bridge.rebuildPageContainer(new RebuildPageContainer({
    containerTotalNum: 4,
    textObject: [
      makeDetailHeader(landmark.name, landmark.distance),
      makeContent(page),
      makeFooter(footer),
      makeEventCapture(),
    ],
  }));
}

export async function renderError(message: string): Promise<void> {
  const bridge = getBridge();
  await bridge.rebuildPageContainer(new RebuildPageContainer({
    containerTotalNum: 4,
    textObject: [
      makeHeader('Error'),
      makeContent(message),
      makeFooter(footerBoth('Tap: retry', 'Wondereye')),
      makeEventCapture(),
    ],
  }));
}

export async function renderListening(): Promise<void> {
  const bridge = getBridge();
  await bridge.rebuildPageContainer(new RebuildPageContainer({
    containerTotalNum: 4,
    textObject: [
      makeHeader('Wondereye'),
      makeContent('Listening...\n\nSpeak a landmark name\nor what you want to find'),
      makeFooter(footerBoth('Tap to stop', 'Wondereye')),
      makeEventCapture(),
    ],
  }));
}

export async function renderVoiceResult(matched: string | null): Promise<void> {
  const bridge = getBridge();
  const content = matched ? `Found:\n${matched}` : 'No match found';
  await bridge.rebuildPageContainer(new RebuildPageContainer({
    containerTotalNum: 4,
    textObject: [
      makeHeader('Voice Search'),
      makeContent(content),
      makeFooter(footerRight('Wondereye')),
      makeEventCapture(),
    ],
  }));
}

export async function updateListContent(state: AppState): Promise<void> {
  await renderList(state);
}
