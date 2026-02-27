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
    // The SDK delivers osEventType as a numeric enum (OsEventTypeList)
    const eventType = event.sysEvent?.eventType ?? event.osEventType ?? event.type;

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
