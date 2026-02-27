import { getBridge } from './bridge';
import { AppState } from './types';
import { renderList, renderDetail, renderError, updateListContent } from './renderer';

export function setupEventHandlers(
  state: AppState,
  onRefresh: () => void
): void {
  const bridge = getBridge();

  bridge.onEvenHubEvent(async (event: any) => {
    const eventType = event.osEventType ?? event.type;

    switch (state.mode) {
      case 'list':
        await handleListEvent(eventType, state);
        break;
      case 'detail':
        await handleDetailEvent(eventType, state);
        break;
      case 'error':
        if (eventType === 'TAP_EVENT') {
          onRefresh();
        }
        break;
    }
  });
}

async function handleListEvent(eventType: string, state: AppState): Promise<void> {
  switch (eventType) {
    case 'SCROLL_DOWN_EVENT':
      if (state.selectedIndex < state.landmarks.length - 1) {
        state.selectedIndex++;
        await updateListContent(state);
      }
      break;

    case 'SCROLL_UP_EVENT':
      if (state.selectedIndex > 0) {
        state.selectedIndex--;
        await updateListContent(state);
      }
      break;

    case 'TAP_EVENT':
      state.mode = 'detail';
      await renderDetail(state.landmarks[state.selectedIndex]);
      break;
  }
}

async function handleDetailEvent(eventType: string, state: AppState): Promise<void> {
  switch (eventType) {
    case 'TAP_EVENT':
      state.mode = 'list';
      await renderList(state);
      break;

    case 'SCROLL_DOWN_EVENT':
      if (state.selectedIndex < state.landmarks.length - 1) {
        state.selectedIndex++;
        await renderDetail(state.landmarks[state.selectedIndex]);
      }
      break;

    case 'SCROLL_UP_EVENT':
      if (state.selectedIndex > 0) {
        state.selectedIndex--;
        await renderDetail(state.landmarks[state.selectedIndex]);
      }
      break;
  }
}
