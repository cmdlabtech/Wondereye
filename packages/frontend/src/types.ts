export interface Landmark {
  name: string;
  type: string;
  distance: number;
  snippet: string;
  lat?: number;
  lng?: number;
}

export interface HistoryEntry {
  name: string;
  type: string;
  snippet: string;
  visitedAt: number; // Unix ms timestamp
}

export interface AppState {
  landmarks: Landmark[];
  selectedIndex: number;
  mode: 'loading' | 'list' | 'reading' | 'error' | 'listening';
  errorMessage?: string;
  city?: string;
  uid?: number;
  detailText?: string;
  readingPage?: number;
  readingPages?: string[];
  detailLoaded?: boolean;
  // Voice recording (Feature 1)
  voiceBuffer?: Uint8Array[];
  voiceSilenceAccum?: number;
  voiceHardTimer?: ReturnType<typeof setTimeout>;
  // Landmark history (Feature 3)
  history?: HistoryEntry[];
  // Compass tracking (Feature 4)
  imuBaseline?: number;
  userLat?: number;
  userLng?: number;
  compassHighlight?: number | null;
}
