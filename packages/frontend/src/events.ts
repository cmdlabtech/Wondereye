import { OsEventTypeList } from '@evenrealities/even_hub_sdk';
import { getBridge } from './bridge';
import { AppState } from './types';
import { renderList, renderReadingPage, updateListContent, paginateText } from './renderer';
import { fetchLandmarkDetail } from './api';

const IMU_DATA_REPORT = 8; // OsEventTypeList.IMU_DATA_REPORT added in SDK 0.0.9

export function setupEventHandlers(
  state: AppState,
  onRefresh: () => void,
  onIMUEvent?: (event: any) => void
): void {
  const bridge = getBridge();

  bridge.onEvenHubEvent(async (event: any) => {
    // Ignore lifecycle system events (foreground/background), not user input.
    // The SDK sends periodic sysEvents (enter/exit) while idle; filtering only
    // these specific types prevents idle crashes while allowing tap/scroll sysEvents through.
    if (event.sysEvent && !event.textEvent && !event.listEvent) {
      const sysEventType = event.sysEvent?.eventType;
      if (sysEventType === OsEventTypeList.FOREGROUND_ENTER_EVENT ||
          sysEventType === OsEventTypeList.FOREGROUND_EXIT_EVENT ||
          sysEventType === OsEventTypeList.ABNORMAL_EXIT_EVENT) {
        console.log('[events] lifecycle sysEvent ignored:', sysEventType);
        return;
      }
      if (sysEventType === IMU_DATA_REPORT) {
        onIMUEvent?.(event);
        return;
      }
      // Otherwise, process as user input (tap/scroll may come as sysEvent)
    }

    let eventType: number | undefined =
      event.textEvent?.eventType ??
      event.listEvent?.eventType ??
      event.sysEvent?.eventType;

    // SDK bug: CLICK_EVENT (0) gets normalized to undefined by fromJson.
    if (eventType == null && (event.textEvent || event.listEvent || event.sysEvent)) {
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
        } else if (state.mode !== 'loading') {
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

export async function triggerClick(state: AppState, onRefresh: () => void): Promise<void> {
  try {
    switch (state.mode) {
      case 'list':    await handleListEvent(OsEventTypeList.CLICK_EVENT, state); break;
      case 'reading': await handleReadingEvent(OsEventTypeList.CLICK_EVENT, state); break;
      case 'error':   onRefresh(); break;
    }
  } catch (err) {
    console.error('[events] triggerClick error:', err);
  }
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

    // Swipe back (SCROLL_BOTTOM) = previous page, swipe forward (SCROLL_TOP) = next page
    case OsEventTypeList.SCROLL_BOTTOM_EVENT:
      if (page < pages.length - 1) {
        state.readingPage = page + 1;
        await renderReadingPage(landmark, pages[page + 1], page + 1, pages.length, false, !!state.detailLoaded);
      }
      break;

    case OsEventTypeList.SCROLL_TOP_EVENT:
      if (page > 0) {
        state.readingPage = page - 1;
        await renderReadingPage(landmark, pages[page - 1], page - 1, pages.length, false, !!state.detailLoaded);
      }
      break;
  }
}
