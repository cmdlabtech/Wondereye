# Wondereye

Discover nearby landmarks through your Even G2 smart glasses. Wondereye finds points of interest around you via OpenStreetMap, generates concise descriptions powered by Grok, and shows them right on your display — ranked by distance and significance.

- **Homepage:** https://wondereye.app
- **Community map:** https://wondereye.app/map

## Try It on Your Glasses

Scan this QR code from the Even Hub app to load Wondereye on your glasses.

<p align="center">
  <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=https://wondereye.app/app.html" alt="Scan to open Wondereye on your Even G2" width="200" height="200" />
  <br/>
  <a href="https://wondereye.app/app.html">wondereye.app/app.html</a>
</p>

## Features

- **Automatic landmark detection** — up to 5 nearby landmarks from real-world OpenStreetMap data, ranked by distance and significance
- **Instant AI snippets**, with full background details on demand, powered by Grok
- **Compass direction and distance** to each landmark, shown right on the HUD
- **Voice search** to find a specific landmark hands-free
- **Adjustable search range** — tighten it for dense city centers or widen it to explore
- **Community map** — every landmark discovered by the community adds to a shared world map at [wondereye.app/map](https://wondereye.app/map); view your own contributions in the app
- **Recently viewed** landmarks saved for later
- **Imperial or metric** units, your choice

## Location

Wondereye gets your position from your phone through the Even Hub SDK (`getAppLocation`, SDK 0.0.11+) — no manual setup required. If a live fix isn't available yet, it falls back to your last known location, then to a default city. On the simulator you can pass `lat`/`lng` query params to simulate a position.

## Navigation

- **Tap** a landmark to read a snippet, then **tap again** to load full details
- **Scroll** up/down to move through the list or paginate details
- **Double-tap** to go back from any view

## Settings

Open Wondereye's settings from the Even Hub app to:

- Set your **search radius**
- Choose **imperial or metric** units
- Toggle **device location** on/off
- View **My Map Contributions** — the landmarks you've discovered
- **Support the project**

## Privacy

Your location is obtained on-device via the Even Hub SDK and is used **only** to look up nearby landmarks — it is never written to storage. Landmark cache keys are rounded to ~110m precision. No name, email, or other personal information is collected or stored anywhere in this system. See [`packages/worker/src/CLAUDE.md`](packages/worker/src/CLAUDE.md) for the full data/caching rules.

## Development

### Setup

```bash
npm install

# Create worker secrets — copy to packages/worker/.dev.vars:
#   XAI_API_KEY=your-xai-api-key
#   ALLOWED_ORIGIN=http://192.168.86.100:5173  (use your dev machine IP)
```

### Running Dev Servers

For testing on physical glasses or remote simulators, set your dev machine's IP:

```bash
# Edit packages/frontend/.env.local with your network IP
# (e.g., 192.168.86.100 or 192.168.1.100)
cat packages/frontend/.env.local

# Then run all servers:
bash scripts/dev-local.sh

# OR manually in 3 terminals:
cd packages/frontend && npm run dev
cd packages/worker && wrangler dev --ip YOUR_IP --port 8787
npm run qr  # scan QR code with Even Hub app on glasses
```

For desktop/simulator testing with localhost:

```bash
npm run dev   # starts frontend on localhost:5173
npm run qr    # generates QR code
```

### Testing with the Simulator

```bash
# With network IP (physical glasses):
npx evenhub-simulator "http://192.168.86.100:5173/app.html?lat=48.8566&lng=2.3522"

# With localhost (desktop/emulator):
npx evenhub-simulator "http://localhost:5173/app.html?lat=48.8566&lng=2.3522"
```

Pass any `lat`/`lng` query params to simulate a location.

### Packaging for the Even App Store

```bash
cd packages/frontend && npm run pack   # builds and packs wondereye.ehpk
```

## Deployment

```bash
npm run deploy            # worker + frontend
npm run deploy:worker     # worker only
npm run deploy:frontend   # frontend only
```
