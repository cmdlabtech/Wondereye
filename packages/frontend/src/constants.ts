// G2 Display
export const DISPLAY_WIDTH = 576;
export const DISPLAY_HEIGHT = 288;

// Layout: 3-container design
export const HEADER_HEIGHT = 40;
export const FOOTER_HEIGHT = 30;
export const LIST_HEIGHT = DISPLAY_HEIGHT - HEADER_HEIGHT - FOOTER_HEIGHT; // 218px

// API — update this after deploying the worker
export const API_BASE_URL = import.meta.env.DEV
  ? 'http://localhost:8787'
  : 'https://g2-landmarks-api.YOUR_SUBDOMAIN.workers.dev';

// Geolocation
export const GEO_TIMEOUT = 10000;
export const GEO_MAX_AGE = 60000;
export const SEARCH_RADIUS = 500;

// UI
export const VISIBLE_LANDMARKS = 3;
