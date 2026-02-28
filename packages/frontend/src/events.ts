import { OsEventTypeList } from '@evenrealities/even_hub_sdk';
import { getBridge } from './bridge';
import { AppState } from './types';
import { renderList, renderDetail, renderReadingPage, renderLoading, updateListContent, paginateText } from './renderer';
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

    // G2 guide: SDK's fromJson normalises 0 to undefined in many cases.
    // Check both CLICK_EVENT (0) and undefined to catch clicks.
    // Simulator sends sysEvent:{} for click (no eventType field).
    if (eventType == null && (event.sysEvent || event.textEvent || event.listEvent)) {
      eventType = OsEventTypeList.CLICK_EVENT;
    }

    if (eventType == null) return;

    try {
      // Double-tap goes back in any view
      if (eventType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
        if (state.mode === 'detail' || state.mode === 'reading') {
          state.mode = 'list';
          state.readingPage = undefined;
          state.readingPages = undefined;
          await renderList(state);
        } else {
          onRefresh();
        }
        return;
      }

      switch (state.mode) {
        case 'list':
          await handleListEvent(eventType, state);
          break;
        case 'detail':
          await handleDetailEvent(eventType, state);
          break;
        case 'reading':
          await handleReadingEvent(eventType, state);
          break;
        case 'error':
          if (eventType === OsEventTypeList.CLICK_EVENT) {
            onRefresh();
          }
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
      if (state.selectedIndex < state.landmarks.length - 1) {
        state.selectedIndex++;
        await updateListContent(state);
      }
      break;

    case OsEventTypeList.SCROLL_TOP_EVENT:
      if (state.selectedIndex > 0) {
        state.selectedIndex--;
        await updateListContent(state);
      }
      break;

    case OsEventTypeList.CLICK_EVENT:
      state.mode = 'detail';
      await renderDetail(state.landmarks[state.selectedIndex]);
      break;
  }
}

async function handleDetailEvent(eventType: number, state: AppState): Promise<void> {
  switch (eventType) {
    case OsEventTypeList.CLICK_EVENT:
      state.mode = 'list';
      await renderList(state);
      break;

    case OsEventTypeList.SCROLL_BOTTOM_EVENT: {
      // Scroll down loads extended details via Grok
      const landmark = state.landmarks[state.selectedIndex];
      await renderLoading();
      try {
        const detail = await fetchLandmarkDetail(landmark.name);
        state.detailText = detail;
        state.readingPages = paginateText(detail);
        state.readingPage = 0;
        state.mode = 'reading';
        await renderReadingPage(landmark, state.readingPages[0], 0, state.readingPages.length);
      } catch {
        state.mode = 'reading';
        state.detailText = '';
        state.readingPages = ['No additional details available.'];
        state.readingPage = 0;
        await renderReadingPage(landmark, state.readingPages[0], 0, 1);
      }
      break;
    }

    case OsEventTypeList.SCROLL_TOP_EVENT:
      // Scroll up navigates to previous landmark
      if (state.selectedIndex > 0) {
        state.selectedIndex--;
        await renderDetail(state.landmarks[state.selectedIndex]);
      }
      break;
  }
}

async function handleReadingEvent(eventType: number, state: AppState): Promise<void> {
  const pages = state.readingPages || [];
  const page = state.readingPage || 0;
  const landmark = state.landmarks[state.selectedIndex];

  switch (eventType) {
    case OsEventTypeList.CLICK_EVENT:
      // Tap goes back to list
      state.mode = 'list';
      state.detailText = undefined;
      state.readingPage = undefined;
      state.readingPages = undefined;
      await renderList(state);
      break;

    case OsEventTypeList.SCROLL_BOTTOM_EVENT:
      if (page < pages.length - 1) {
        // Next page of text
        state.readingPage = page + 1;
        await renderReadingPage(landmark, pages[page + 1], page + 1, pages.length);
      }
      break;

    case OsEventTypeList.SCROLL_TOP_EVENT:
      if (page > 0) {
        // Previous page of text
        state.readingPage = page - 1;
        await renderReadingPage(landmark, pages[page - 1], page - 1, pages.length);
      } else {
        // At first page, scroll up goes back to snippet
        state.detailText = undefined;
        state.readingPage = undefined;
        state.readingPages = undefined;
        state.mode = 'detail';
        await renderDetail(landmark);
      }
      break;
  }
}
