import { initBridge } from './bridge';
import { getCurrentPosition } from './geo';
import { fetchLandmarks } from './api';
import { renderStartup, renderList, renderError } from './renderer';
import { setupEventHandlers } from './events';
import { AppState } from './types';

const state: AppState = {
  landmarks: [],
  selectedIndex: 0,
  mode: 'loading',
};

async function loadLandmarks(): Promise<void> {
  try {
    state.mode = 'loading';
    await renderStartup();

    const { lat, lng } = await getCurrentPosition();

    const landmarks = await fetchLandmarks(lat, lng);

    if (landmarks.length === 0) {
      state.mode = 'error';
      state.errorMessage = 'No landmarks found nearby.\nTry moving to a new area.';
      await renderError(state.errorMessage);
      return;
    }

    state.landmarks = landmarks;
    state.selectedIndex = 0;
    state.mode = 'list';
    await renderList(state);
  } catch (error) {
    state.mode = 'error';
    state.errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await renderError(state.errorMessage);
  }
}

async function main(): Promise<void> {
  const statusEl = document.getElementById('status');

  try {
    if (statusEl) statusEl.textContent = 'Connecting to glasses...';
    await initBridge();

    if (statusEl) statusEl.textContent = 'Connected. Loading landmarks...';
    setupEventHandlers(state, loadLandmarks);

    await loadLandmarks();

    if (statusEl) statusEl.textContent = 'App running on glasses.';
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    if (statusEl) statusEl.textContent = `Error: ${msg}`;
    console.error('App init failed:', error);
  }
}

main();
