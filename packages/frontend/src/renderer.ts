import {
  CreateStartUpPageContainer,
  RebuildPageContainer,
  TextContainerProperty,
  ImageContainerProperty,
  ImageRawDataUpdate,
} from '@evenrealities/even_hub_sdk';
import { getBridge } from './bridge';
import { AppState, Landmark } from './types';
import { getUnits } from './units';
import { DISPLAY_WIDTH, DISPLAY_HEIGHT, HEADER_HEIGHT, FOOTER_HEIGHT } from './constants';
import { renderListToCanvas, canvasToPng, IMAGE_WIDTH, IMAGE_HEIGHT } from './canvas-list';

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
    borderRdaius: 6,
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
    borderRdaius: 0,
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
    borderRdaius: 6,
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
    borderRdaius: 6,
    paddingLength: 4,
    content: text,
    isEventCapture: 0,
  });
}
// Footer width: 576px, 4px padding each side ≈ 94 chars at ~6.2px avg
const FOOTER_COLS = 94;

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

export async function renderList(state: AppState): Promise<void> {
  const bridge = getBridge();
  const footerText = state.city || 'Scroll: browse  Tap: details';

  await bridge.rebuildPageContainer(new RebuildPageContainer({
    containerTotalNum: 4,
    textObject: [
      makeHeader('Nearby Landmarks'),
      makeFooter(footerBoth(footerText, 'Wondereye')),
      makeEventCapture(),
    ],
    imageObject: [
      new ImageContainerProperty({
        containerID: 2,
        containerName: 'content',
        xPosition: 0,
        yPosition: HEADER_HEIGHT,
        width: IMAGE_WIDTH,
        height: IMAGE_HEIGHT,
      }),
    ],
  }));

  const canvas = renderListToCanvas(state.landmarks, state.selectedIndex);
  const png = await canvasToPng(canvas);
  await bridge.updateImageRawData(new ImageRawDataUpdate({
    containerID: 2,
    containerName: 'content',
    imageData: png,
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
    // Prefer breaking after a sentence-ending period within the limit
    const sentenceCut = remaining.lastIndexOf('. ', CHARS_PER_PAGE);
    let cut = sentenceCut > 0 ? sentenceCut + 1 : remaining.lastIndexOf(' ', CHARS_PER_PAGE);
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

export async function updateListContent(state: AppState): Promise<void> {
  const bridge = getBridge();
  const canvas = renderListToCanvas(state.landmarks, state.selectedIndex);
  const png = await canvasToPng(canvas);
  await bridge.updateImageRawData(new ImageRawDataUpdate({
    containerID: 2,
    containerName: 'content',
    imageData: png,
  }));
}
