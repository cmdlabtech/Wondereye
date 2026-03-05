export interface Landmark {
  name: string;
  type: string;
  distance: number;
  snippet: string;
}

export interface AppState {
  landmarks: Landmark[];
  selectedIndex: number;
  mode: 'loading' | 'list' | 'reading' | 'error';
  errorMessage?: string;
  city?: string;
  uid?: number;
  detailText?: string;
  readingPage?: number;
  readingPages?: string[];
  detailLoaded?: boolean;
}
