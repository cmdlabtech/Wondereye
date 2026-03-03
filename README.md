# Wondereye

Discover nearby landmarks through your Even G2 smart glasses. Wondereye uses your location to find points of interest via OpenStreetMap, then generates concise descriptions powered by Grok — displayed directly on the glasses.

## Try It on Your Glasses

Scan this QR code from the Even Hub app to load Wondereye instantly — no setup required.

<p align="center">
  <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=https://wondereye.app/app.html" alt="Scan to open Wondereye on your Even G2" width="200" height="200" />
  <br/>
  <a href="https://wondereye.app/app.html">wondereye.app/app.html</a>
</p>

## Navigation

- Tap a landmark to read a snippet, then tap again to load full details
- Double tap to go back from any view

## Development

```bash
npm install
npm run dev   # starts frontend + worker
npm run qr    # generates QR code to sideload on glasses (requires local network)
```

Create `packages/worker/.dev.vars` with your API key and Allowed Origins:

```
XAI_API_KEY=your-xai-api-key
ALLOWED_ORIGIN=http://localhost:5173
```

## Locally Deploy & Test

```bash
npm run deploy
```

### Testing with the Simulator

```bash
npx evenhub-simulator "http://localhost:5173/app.html?lat=48.8566&lng=2.3522"
```

Pass any `lat`/`lng` query params to simulate a location.

## Roadmap

- **Tunable Search Radius** — Settings toggle to choose between Precise Mode (accurate location + 100-200m radius for focused sightseeing) and Broad Mode (privacy-optimized location + 500m+ radius for general exploration)