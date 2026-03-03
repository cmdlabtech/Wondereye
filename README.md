# Wondereye

Discover nearby landmarks through your Even G2 smart glasses. Wondereye uses your location to find points of interest via OpenStreetMap, then generates concise descriptions powered by Grok — displayed directly on the glasses.

## Navigation

Controls use the G2's touch frame (swipe up/down = scroll, single tap, double tap).

| View | Scroll down | Scroll up | Tap | Double tap |
|------|-------------|-----------|-----|------------|
| **List** | Next landmark | Previous landmark | Open snippet | Refresh |
| **Reading** | Next page | Previous page | Load full details | Back to list |

- Landmark details are loaded on demand (first tap in reading view) — not automatically.
- Scroll up on the first page stays on the reading view; double tap always goes back.

## Architecture

- **Frontend** (`packages/frontend`) — Vite app that runs as a G2 WebView. Renders landmark lists and detail views on the glasses display using the EvenHub SDK.
- **Worker** (`packages/worker`) — Cloudflare Worker API. Queries Overpass/OSM for nearby POIs, generates snippets via Grok, and caches results in KV.

## Setup

```bash
npm install
```

Create `packages/worker/.dev.vars` with:

```
XAI_API_KEY=your-xai-api-key
ALLOWED_ORIGIN=http://localhost:5173
```

## Development

```bash
# Start frontend + worker
npm run dev

# Generate QR code to sideload on glasses
npm run qr
```

The QR code loads your local dev server URL in the Even App. Requires the frontend and phone to be on the same network.

## Deploy

```bash
npm run deploy
```

Deploys the worker and frontend to Cloudflare. Set `XAI_API_KEY` and `ALLOWED_ORIGIN` as Cloudflare Worker secrets via `wrangler secret put`.

## Testing with the Simulator

```bash
npx evenhub-simulator "http://localhost:5173/app.html?lat=48.8566&lng=2.3522"
```

Pass any `lat`/`lng` query params to simulate a location.
