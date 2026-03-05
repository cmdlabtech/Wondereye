// G2 Display
export const DISPLAY_WIDTH = 576;
export const DISPLAY_HEIGHT = 288;

// Layout: 3-container design
export const HEADER_HEIGHT = 40;
export const FOOTER_HEIGHT = 30;
export const LIST_HEIGHT = DISPLAY_HEIGHT - HEADER_HEIGHT - FOOTER_HEIGHT; // 218px

// API
const devHost = import.meta.env.VITE_DEV_IP || '192.168.86.100';
export const API_BASE_URL = import.meta.env.DEV
  ? `http://${devHost}:8787`
  : 'https://api.wondereye.app';

// Geolocation
export const GEO_TIMEOUT = 5000;
export const GEO_MAX_AGE = 60000;
export const SEARCH_RADIUS = 2000;

// UI
export const VISIBLE_LANDMARKS = 5;
