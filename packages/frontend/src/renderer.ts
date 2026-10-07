import {
  CreateStartUpPageContainer,
  RebuildPageContainer,
  TextContainerProperty,
} from '@evenrealities/even_hub_sdk';
import { getBridge } from './bridge';
import { AppState, Landmark } from './types';
import { getUnits } from './units';
import { bearingTo } from './compass';
import { directionLabel, t } from './i18n';
import { alignRight, BORDERED_INNER, fitWidth, paginateByLines, spreadLine, textWidth } from './text-fit';
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

function headerBoth(left: string, right: string): string {
  return spreadLine(left, right);
}

function footerRight(right: string): string {
  return alignRight(right);
}

function footerBoth(left: string, right: string): string {
  return spreadLine(left, right);
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
  const nameBudget = BORDERED_INNER - 2 - textWidth(`  ${dist}`);
  return makeHeader(`${fitWidth(name, nameBudget)}  ${dist}`);
}

export async function renderStartup(): Promise<void> {
  const bridge = getBridge();
  await bridge.createStartUpPageContainer(new CreateStartUpPageContainer({
    containerTotalNum: 4,
    textObject: [
      makeHeader('Wondereye'),
      makeContent(t('g.finding')),
      makeFooter(footerBoth(t('g.pleaseWait'), 'Wondereye')),
      makeEventCapture(),
    ],
  }));
}

export async function renderLoading(message = t('g.finding')): Promise<void> {
  const bridge = getBridge();
  await bridge.rebuildPageContainer(new RebuildPageContainer({
    containerTotalNum: 4,
    textObject: [
      makeHeader('Wondereye'),
      makeContent(message),
      makeFooter(footerBoth(t('g.pleaseWait'), 'Wondereye')),
      makeEventCapture(),
    ],
  }));
}

// Names and distances are rendered in two side-by-side pixel-positioned containers so
// distances always align to the same x regardless of proportional font character widths.
// NAME_COL_WIDTH=456px, DIST_COL_WIDTH=120px (defined above with the container helpers).
// Names are truncated to the name column's inner width (511 px - 2 x 4 px padding)
// in pixels, so CJK names (20 px per glyph) no longer overflow.
const NAME_INNER = NAME_COL_WIDTH - 8;

// Action rows appended after the landmarks (see LIST_ACTION_ROWS in events.ts)
const listActionLabels = () => [`[ ${t('g.voiceSearch')} ]`, `[ ${t('g.refresh')} ]`];

function formatListColumns(
  landmarks: Landmark[],
  selectedIndex: number,
  compassHighlight?: number | null,
): { names: string; dists: string } {
  const actions = listActionLabels();
  const total = landmarks.length + actions.length;
  const start = Math.max(0, selectedIndex - (VISIBLE_LANDMARKS - 1));
  const end = Math.min(total, start + VISIBLE_LANDMARKS);

  const nameLines: string[] = [];
  const distLines: string[] = [];
  for (let i = start; i < end; i++) {
    const isSelected = i === selectedIndex;
    if (i >= landmarks.length) {
      const prefix = isSelected ? '> ' : '  ';
      nameLines.push(prefix + actions[i - landmarks.length]);
      distLines.push('');
      continue;
    }
    const isCompass = compassHighlight != null && i === compassHighlight;
    const prefix = isSelected && isCompass ? '>*' : isSelected ? '> ' : isCompass ? '* ' : '  ';
    nameLines.push(prefix + fitWidth(landmarks[i].name, NAME_INNER - textWidth(prefix)));
    distLines.push(formatDistance(landmarks[i].distance));
  }
  return { names: nameLines.join('\n'), dists: distLines.join('\n') };
}

export async function renderList(state: AppState): Promise<void> {
  const bridge = getBridge();
  const lm = state.landmarks[state.selectedIndex];
  let dirLabel = '';
  if (state.userLat != null && state.userLng != null && lm?.lat != null && lm?.lng != null) {
    dirLabel = directionLabel(bearingTo(state.userLat, state.userLng, lm.lat, lm.lng));
  }
  const leftText = state.city || t('g.listHint');
  const footerText = dirLabel ? footerBoth(leftText, dirLabel) : fitWidth(leftText, BORDERED_INNER - 2);
  const { names, dists } = formatListColumns(state.landmarks, state.selectedIndex, state.compassHighlight);

  await bridge.rebuildPageContainer(new RebuildPageContainer({
    containerTotalNum: 5,
    textObject: [
      makeHeader(headerBoth(t('g.nearby'), 'Wondereye')),
      makeNameColumn(names),
      makeDistColumn(dists),
      makeListFooter(footerText),
      makeListCapture(),
    ],
  }));
}

// Pages are measured in pixels with the firmware font metrics (see text-fit.ts),
// so CJK and Hangul text fills the same 7 lines as Latin text.
export function paginateText(text: string): string[] {
  if (!text) return [t('g.noDetails')];
  return paginateByLines(text);
}

export async function renderReadingPage(landmark: Landmark, page: string, _pageNum: number, totalPages: number, loading = false, detailLoaded = false): Promise<void> {
  const bridge = getBridge();
  const hint = loading ? t('g.loadingDetails')
    : !detailLoaded && totalPages <= 1 ? t('g.loadMore')
    : totalPages > 1 ? t('g.scroll')
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
      makeHeader(t('g.error')),
      makeContent(message),
      makeFooter(footerBoth(t('g.tapRetry'), 'Wondereye')),
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
      makeContent(t('g.listening')),
      makeFooter(footerBoth(t('g.tapStop'), 'Wondereye')),
      makeEventCapture(),
    ],
  }));
}

export async function renderVoiceResult(matched: string | null): Promise<void> {
  const bridge = getBridge();
  const content = matched ? `${t('g.found')}\n${matched}` : t('g.noMatch');
  await bridge.rebuildPageContainer(new RebuildPageContainer({
    containerTotalNum: 4,
    textObject: [
      makeHeader(t('g.voiceSearch')),
      makeContent(content),
      makeFooter(footerRight('Wondereye')),
      makeEventCapture(),
    ],
  }));
}

export async function updateListContent(state: AppState): Promise<void> {
  await renderList(state);
}
