import {
  CreateStartUpPageContainer,
  RebuildPageContainer,
  TextContainerProperty,
  TextContainerUpgrade,
} from '@evenrealities/even_hub_sdk';
import { getBridge } from './bridge';
import { AppState, Landmark } from './types';
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
    borderRdaius: 0,
    paddingLength: 4,
    content: text,
    isEventCapture: 0,
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
    borderRdaius: 0,
    paddingLength: 4,
    content: text,
    isEventCapture: 1,
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
    borderRdaius: 0,
    paddingLength: 4,
    content: text,
    isEventCapture: 0,
  });
}

function formatDistance(meters: number): string {
  return meters < 1000 ? `${meters}m` : `${(meters / 1000).toFixed(1)}km`;
}

function truncate(text: string, maxLen: number): string {
  return text.length <= maxLen ? text : text.slice(0, maxLen - 3) + '...';
}

export function formatLandmarkList(landmarks: Landmark[], selectedIndex: number): string {
  const lines: string[] = [];
  const start = Math.max(0, selectedIndex - 2);
  const end = Math.min(landmarks.length, start + VISIBLE_LANDMARKS);

  for (let i = start; i < end; i++) {
    const lm = landmarks[i];
    const pointer = i === selectedIndex ? '\u25B6' : ' ';
    lines.push(`${pointer} ${truncate(lm.name, 45)}`);
  }

  return lines.join('\n');
}

export async function renderStartup(): Promise<void> {
  const bridge = getBridge();
  await bridge.createStartUpPageContainer(new CreateStartUpPageContainer({
    containerTotalNum: 3,
    textObject: [
      makeHeader('Landmark Explorer'),
      makeContent('Getting your location...'),
      makeFooter('Please wait'),
    ],
  }));
}

export async function renderList(state: AppState): Promise<void> {
  const bridge = getBridge();
  const total = state.landmarks.length;
  const current = state.selectedIndex + 1;

  await bridge.rebuildPageContainer(new RebuildPageContainer({
    containerTotalNum: 3,
    textObject: [
      makeHeader(`Nearby Landmarks          ${current}/${total}`),
      makeContent(formatLandmarkList(state.landmarks, state.selectedIndex)),
      makeFooter('Scroll: browse  Tap: details'),
    ],
  }));
}

export async function renderDetail(landmark: Landmark): Promise<void> {
  const bridge = getBridge();
  const dist = formatDistance(landmark.distance);

  const body = `${dist} away\n\n${landmark.snippet}`;

  await bridge.rebuildPageContainer(new RebuildPageContainer({
    containerTotalNum: 3,
    textObject: [
      makeHeader(truncate(landmark.name, 45)),
      makeContent(body),
      makeFooter('Tap: back  Scroll: prev/next'),
    ],
  }));
}

export async function renderError(message: string): Promise<void> {
  const bridge = getBridge();
  await bridge.rebuildPageContainer(new RebuildPageContainer({
    containerTotalNum: 3,
    textObject: [
      makeHeader('Error'),
      makeContent(message),
      makeFooter('Tap: retry'),
    ],
  }));
}

export async function updateListContent(state: AppState): Promise<void> {
  const bridge = getBridge();
  const total = state.landmarks.length;
  const current = state.selectedIndex + 1;
  const listText = formatLandmarkList(state.landmarks, state.selectedIndex);

  await bridge.textContainerUpgrade(new TextContainerUpgrade({
    containerID: 1,
    containerName: 'header',
    contentOffset: 0,
    contentLength: 1000,
    content: `Nearby Landmarks          ${current}/${total}`,
  }));

  await bridge.textContainerUpgrade(new TextContainerUpgrade({
    containerID: 2,
    containerName: 'content',
    contentOffset: 0,
    contentLength: 2000,
    content: listText,
  }));
}
