# Wondereye

Discover nearby landmarks through your Even G2 smart glasses. Wondereye uses your location to find points of interest via OpenStreetMap, then generates concise descriptions powered by Grok — displayed directly on the glasses.

## Try It on Your Glasses

Scan this QR code from the Even Hub app to load Wondereye on your glasses.

<p align="center">
  <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=https://wondereye.app/app.html" alt="Scan to open Wondereye on your Even G2" width="200" height="200" />
  <br/>
  <a href="https://wondereye.app/app.html">wondereye.app/app.html</a>
</p>

## Setting Your Location

The Even G2 SDK (v0.0.7) does not expose a location API — calling any geolocation method inside the EvenHub WebView crashes the glasses at the native level. To work around this, Wondereye uses a two-step flow to share your phone's GPS with the glasses:

1. **Open Wondereye on your glasses** via the QR code above. The phone screen (in the Even Hub app) will display a URL like `wondereye.app/?uid=XXXXXXXX` along with a **Copy Link** button.
2. **Copy the link and open it in your phone's browser** (Safari or Chrome — not inside Even Hub). You'll see a "Set Your Location" panel.
3. **Tap "Use My Location"**, allow the location prompt, and wait for the confirmation message.
4. **Restart Wondereye** on your glasses (double-tap to return to the app list, then reopen it). It will now load landmarks for your current location.

You only need to repeat this when your location changes significantly (e.g., traveling to a new city). Your location is stored server-side and linked to your Even account — it is not shared with anyone and is used solely to fetch nearby landmarks.

## Navigation

- Tap a landmark to read a snippet, then tap again to load full details
- Double tap to go back from any view

## Development

### Setup

```bash
npm install

# Create worker secrets
# Copy to packages/worker/.dev.vars:
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

## Deployment

```bash
npm run deploy
```

## Roadmap

- **Tunable Search Radius** — Settings toggle to choose between Precise Mode (accurate location + 100-200m radius for focused sightseeing) and Broad Mode (privacy-optimized location + 500m+ radius for general exploration)