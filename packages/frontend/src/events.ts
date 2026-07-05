import { OsEventTypeList } from '@evenrealities/even_hub_sdk';
import { getBridge } from './bridge';
import { AppState } from './types';
import { renderList, renderReadingPage, updateListContent, paginateText } from './renderer';
import { fetchLandmarkDetail } from './api';
import { recordVisit } from './history';
import { getUnits } from './units';
import { startVoiceRecording, stopVoiceRecording, cancelVoiceRecording, handleAudioChunk } from './voice';
import { setIMUReporting } from './imu';

// The list view appends two action rows after the landmarks: Voice Search and
// Refresh. selectedIndex === landmarks.length → Voice, landmarks.length + 1 → Refresh.
export const LIST_ACTION_ROWS = 2;

export function setupEventHandlers(
  state: AppState,
  onRefresh: () => void,
  onIMUEvent?: (event: any) => void,
  onHistoryUpdate?: () => void,
  onRerender?: () => Promise<void>,
): void {
  const bridge = getBridge();

  bridge.onEvenHubEvent(async (event: any) => {

    // Audio chunks are delivered via audioEvent — route them directly to the voice
    // handler before any other processing so they always reach the recording buffer.
    if (event.audioEvent) {
      handleAudioChunk(state, event);
      return;
    }

    // Lifecycle system events (official QA guidelines: pause/flush on foreground
    // exit, stop hardware on abnormal/system exit, resume on foreground enter).
    // The SDK sends periodic sysEvents (enter/exit) while idle; filtering only
    // these specific types prevents idle crashes while allowing tap/scroll sysEvents through.
    if (event.sysEvent && !event.textEvent && !event.listEvent) {
      const sysEventType = event.sysEvent?.eventType;
      if (sysEventType === OsEventTypeList.FOREGROUND_EXIT_EVENT) {
        console.log('[events] backgrounded — pausing IMU/audio');
        if (state.mode === 'listening') cancelVoiceRecording(state, false);
        if (onIMUEvent) setIMUReporting(bridge, false);
        return;
      }
      // SYSTEM_EXIT fires after the user confirms the exit dialog opened by
      // shutDownPageContainer(1) — this is where hardware cleanup belongs.
      if (sysEventType === OsEventTypeList.ABNORMAL_EXIT_EVENT ||
          sysEventType === OsEventTypeList.SYSTEM_EXIT_EVENT) {
        console.log('[events] exiting — releasing IMU/audio:', sysEventType);
        if (state.mode === 'listening') cancelVoiceRecording(state, false);
        if (onIMUEvent) setIMUReporting(bridge, false);
        return;
      }
      if (sysEventType === OsEventTypeList.FOREGROUND_ENTER_EVENT) {
        console.log('[events] foregrounded — resuming IMU');
        if (onIMUEvent) setIMUReporting(bridge, true);
        // Guarded re-render: only once landmarks are loaded — rendering during
        // the initial load races with loadLandmarks and corrupts the display.
        if (state.landmarks.length > 0) onRerender?.().catch(() => {});
        return;
      }
      if (sysEventType === OsEventTypeList.IMU_DATA_REPORT) {
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
        } else if (state.mode === 'listening') {
          cancelVoiceRecording(state);
        } else {
          // Root-level views (list, error, loading): QA guidelines require
          // double-tap to open the system exit dialog — doing nothing is a
          // rejection reason. No cleanup before the call — the user can cancel;
          // hardware is released in the SYSTEM_EXIT_EVENT handler after they confirm.
          bridge.shutDownPageContainer(1).catch((err: unknown) => {
            console.warn('[events] shutDownPageContainer failed:', err);
          });
        }
        return;
      }

      switch (state.mode) {
        case 'list':    await handleListEvent(eventType, state, onRefresh); break;
        case 'reading': await handleReadingEvent(eventType, state, bridge, onHistoryUpdate); break;
        case 'listening':
          if (eventType === OsEventTypeList.CLICK_EVENT) {
            stopVoiceRecording(state).catch((err: unknown) => console.error('[events] stopVoiceRecording error:', err));
          }
          break;
        case 'error':
          if (eventType === OsEventTypeList.CLICK_EVENT) onRefresh();
          break;
      }
    } catch (err) {
      console.error('[events] handler error:', err);
    }
  });
}

async function handleListEvent(eventType: number, state: AppState, onRefresh: () => void): Promise<void> {
  const lastIndex = state.landmarks.length + LIST_ACTION_ROWS - 1;
  switch (eventType) {
    case OsEventTypeList.SCROLL_BOTTOM_EVENT:
      if (state.selectedIndex < lastIndex) {
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
      if (state.selectedIndex === state.landmarks.length) {
        startVoiceRecording(state);
        break;
      }
      if (state.selectedIndex === state.landmarks.length + 1) {
        onRefresh();
        break;
      }
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

async function handleReadingEvent(eventType: number, state: AppState, bridge: any, onHistoryUpdate?: () => void): Promise<void> {
  const pages = state.readingPages || [];
  const page = state.readingPage ?? 0;
  const landmark = state.landmarks[state.selectedIndex];

  switch (eventType) {
    case OsEventTypeList.CLICK_EVENT:
      if (!state.detailLoaded) {
        state.detailLoaded = true;
        await renderReadingPage(landmark, pages[page], page, pages.length, true, true);
        fetchLandmarkDetail(landmark.name, getUnits()).then(async detail => {
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
          // Record this landmark in the visit history, then refresh the phone UI list
          if (detail) {
            recordVisit(bridge, landmark).then(() => onHistoryUpdate?.()).catch(() => {});
          }
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
