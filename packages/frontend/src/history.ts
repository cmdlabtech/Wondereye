import { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { Landmark, HistoryEntry } from './types';

const HISTORY_KEY = 'wondereye-history';
const MAX_HISTORY = 50;

export async function recordVisit(bridge: EvenAppBridge, landmark: Landmark): Promise<void> {
  let entries: HistoryEntry[] = [];
  try {
    const raw = await bridge.getLocalStorage(HISTORY_KEY);
    if (raw) entries = JSON.parse(raw);
  } catch {
    entries = [];
  }

  // Deduplicate: remove existing entry with same name (move to front on re-visit)
  entries = entries.filter(e => e.name.toLowerCase() !== landmark.name.toLowerCase());

  entries.unshift({
    name: landmark.name,
    type: landmark.type,
    snippet: landmark.snippet,
    visitedAt: Date.now(),
  });

  entries = entries.slice(0, MAX_HISTORY);

  try {
    await bridge.setLocalStorage(HISTORY_KEY, JSON.stringify(entries));
  } catch (err) {
    console.warn('[history] setLocalStorage failed:', err);
  }
}

export async function loadHistory(bridge: EvenAppBridge): Promise<HistoryEntry[]> {
  try {
    const raw = await bridge.getLocalStorage(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
