export interface Landmark {
  name: string;
  type: string;
  distance: number;
  snippet: string;
}

export interface AppState {
  landmarks: Landmark[];
  selectedIndex: number;
  mode: 'loading' | 'list' | 'detail' | 'reading' | 'error';
  errorMessage?: string;
  city?: string;
  detailText?: string;
  readingPage?: number;
  readingPages?: string[];
}
