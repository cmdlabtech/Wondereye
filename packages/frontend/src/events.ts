import { OsEventTypeList } from '@evenrealities/even_hub_sdk';
import { getBridge } from './bridge';
import { AppState } from './types';
import { renderList, renderDetail, updateListContent } from './renderer';

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

    // Simulator sends sysEvent:{} for click (no eventType field)
    if (eventType == null && event.sysEvent) {
      eventType = OsEventTypeList.CLICK_EVENT;
    }

    if (eventType == null) return;

    try {
      // Double-tap goes back in any view
      if (eventType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
        if (state.mode === 'detail') {
          state.mode = 'list';
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
    case OsEventTypeList.SCROLL_BOTTOM_EVENT: // scroll down
      if (state.selectedIndex < state.landmarks.length - 1) {
        state.selectedIndex++;
        await updateListContent(state);
      }
      break;

    case OsEventTypeList.SCROLL_TOP_EVENT: // scroll up
      if (state.selectedIndex > 0) {
        state.selectedIndex--;
        await updateListContent(state);
      }
      break;

    case OsEventTypeList.CLICK_EVENT: // tap
      state.mode = 'detail';
      await renderDetail(state.landmarks[state.selectedIndex]);
      break;
  }
}

async function handleDetailEvent(eventType: number, state: AppState): Promise<void> {
  switch (eventType) {
    case OsEventTypeList.CLICK_EVENT: // tap -> back to list
      state.mode = 'list';
      await renderList(state);
      break;

    case OsEventTypeList.SCROLL_BOTTOM_EVENT: // next landmark
      if (state.selectedIndex < state.landmarks.length - 1) {
        state.selectedIndex++;
        await renderDetail(state.landmarks[state.selectedIndex]);
      }
      break;

    case OsEventTypeList.SCROLL_TOP_EVENT: // previous landmark
      if (state.selectedIndex > 0) {
        state.selectedIndex--;
        await renderDetail(state.landmarks[state.selectedIndex]);
      }
      break;
  }
}
