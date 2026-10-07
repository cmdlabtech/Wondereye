# Wondereye web — daylight globe

Preview of the landing page and 3D map (`/`, `/map`).

`npm run deploy:frontend` builds this package, overlays it on the glasses site (`app.html` stays at `/app.html`), and deploys to `wondereye.app`. `/` and `/map` are the globe SPA.

## What’s here

- NASA Blue Marble globe on a pale sky, paper landing page
- Small red place dots, paper pin cards, Syne + IBM Plex Sans
- Shared globe instance: landing hero → full map with clip/transform open
- Places panel to browse, filter by type, and hop facing-you landmarks
- Country borders on load; state/admin-1 lines when zoomed
- Landmark snapshot in `public/landmarks.json`; live `GET https://api.wondereye.app/api/map` only on `wondereye.app`

## Local

```bash
npm install
npm run dev:web
```

Then open `http://localhost:5174`. The important files:

- `src/components/globe-host.tsx` — persistent Three.js globe + hero/map presentation
- `src/lib/globe-engine.ts` — sphere, orbit, pins, borders
- `src/components/landing-page.tsx` / `globe-view.tsx` / `places-panel.tsx` / `pin-card.tsx`
