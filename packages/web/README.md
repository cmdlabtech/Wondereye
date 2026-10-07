# Wondereye web — Diamond Black globe

Preview of the redesigned landing page and 3D map (`/`, `/map`).

`npm run deploy:frontend` builds this package, overlays it on the glasses site (`app.html` stays at `/app.html`), and deploys to `wondereye.app`. `/` and `/map` are the globe SPA.

## What’s here

- Satellite globe (`MeshBasicMaterial` + `earth-fs6.jpg`) on a black scene
- Diamond CSS pins, paper pin cards, Syne + IBM Plex Sans
- Shared globe instance: landing hero → full map with clip/transform open
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
- `src/components/landing-page.tsx` / `globe-view.tsx` / `pin-card.tsx`
