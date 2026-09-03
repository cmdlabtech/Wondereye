# Wondereye web — Diamond Black globe

Preview of the redesigned landing page and 3D map (`/`, `/map`).

This package is **not wired to production**. `wondereye.app` still deploys from `packages/frontend`. Do not run wrangler against this folder unless you intend to replace the live site.

## What’s here

- Satellite globe (`MeshBasicMaterial` + `earth-fs6.jpg`) on a black scene
- Diamond CSS pins, paper pin cards, Syne + IBM Plex Sans
- Shared globe instance: landing hero → full map with clip/transform open
- Country borders on load; state/admin-1 lines when zoomed
- Landmark snapshot in `public/landmarks.json`; live `GET https://api.wondereye.app/api/map` only on `wondereye.app`

## Local

This snapshot is source from the Grok preview. A full Vite/TanStack Start scaffold is still needed to `npm run dev` in isolation. The important files:

- `src/components/globe-host.tsx` — persistent Three.js globe + hero/map presentation
- `src/lib/globe-engine.ts` — sphere, orbit, pins, borders
- `src/components/landing-page.tsx` / `globe-view.tsx` / `pin-card.tsx`
