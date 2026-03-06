import { OsEventTypeList } from '@evenrealities/even_hub_sdk';
import { getBridge } from './bridge';
import { AppState } from './types';
import { renderList, renderReadingPage, updateListContent, paginateText } from './renderer';
import { fetchLandmarkDetail } from './api';

export function setupEventHandlers(
  state: AppState,
  onRefresh: () => void
): void {
  const bridge = getBridge();

  bridge.onEvenHubEvent(async (event: any) => {
    let eventType: number | undefined =
      event.textEvent?.eventType ??
      event.listEvent?.eventType ??
      event.sysEvent?.eventType;

    if (eventType == null && (event.sysEvent || event.textEvent || event.listEvent)) {
      eventType = OsEventTypeList.CLICK_EVENT;
    }

    if (eventType == null) return;

    try {
      if (eventType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
        if (state.mode === 'reading') {
          state.mode = 'list';
          state.readingPage = undefined;
          state.readingPages = undefined;
          state.detailLoaded = undefined;
          await renderList(state);
        } else {
          onRefresh();
        }
        return;
      }

      switch (state.mode) {
        case 'list':    await handleListEvent(eventType, state); break;
        case 'reading': await handleReadingEvent(eventType, state); break;
        case 'error':
          if (eventType === OsEventTypeList.CLICK_EVENT) onRefresh();
          break;
      }
    } catch (err) {
      console.error('[events] handler error:', err);
    }
  });
}

async function handleListEvent(eventType: number, state: AppState): Promise<void> {
  switch (eventType) {
    case OsEventTypeList.SCROLL_BOTTOM_EVENT:
      if (state.selectedIndex > 0) {
        state.selectedIndex--;
        await updateListContent(state);
      }
      break;

    case OsEventTypeList.SCROLL_TOP_EVENT:
      if (state.selectedIndex < state.landmarks.length - 1) {
        state.selectedIndex++;
        await updateListContent(state);
      }
      break;

    case OsEventTypeList.CLICK_EVENT: {
      const landmark = state.landmarks[state.selectedIndex];
      state.mode = 'reading';
      state.detailLoaded = false;
      state.readingPages = paginateText(landmark.snippet);
      state.readingPage = 0;
      await renderReadingPage(landmark, state.readingPages[0], 0, state.readingPages.length, false, false);
      break;
    }
  }
}

async function handleReadingEvent(eventType: number, state: AppState): Promise<void> {
  const pages = state.readingPages || [];
  const page = state.readingPage ?? 0;
  const landmark = state.landmarks[state.selectedIndex];

  switch (eventType) {
    case OsEventTypeList.CLICK_EVENT:
      if (!state.detailLoaded) {
        state.detailLoaded = true;
        await renderReadingPage(landmark, pages[page], page, pages.length, true, true);
        fetchLandmarkDetail(landmark.name).then(async detail => {
          if (state.mode !== 'reading' || state.landmarks[state.selectedIndex] !== landmark) return;
          const combined = landmark.snippet + (detail ? '\n\n' + detail + '\n' : '');
          state.readingPages = paginateText(combined);
          state.readingPage = Math.min(state.readingPage ?? 0, state.readingPages.length - 1);
          await renderReadingPage(
            landmark,
            state.readingPages[state.readingPage],
            state.readingPage,
            state.readingPages.length,
            false,
            true,
          );
        }).catch(() => { /* snippet already showing — silently ignore */ });
      }
      break;

    // Scroll directions match list: SCROLL_BOTTOM = backward, SCROLL_TOP = forward
    case OsEventTypeList.SCROLL_BOTTOM_EVENT:
      if (page > 0) {
        state.readingPage = page - 1;
        await renderReadingPage(landmark, pages[page - 1], page - 1, pages.length, false, !!state.detailLoaded);
      }
      break;

    case OsEventTypeList.SCROLL_TOP_EVENT:
      if (page < pages.length - 1) {
        state.readingPage = page + 1;
        await renderReadingPage(landmark, pages[page + 1], page + 1, pages.length, false, !!state.detailLoaded);
      }
      break;
  }
}
