# Changelog

## Worker — 2026-09-11 (nearby list empty)

- Nearby landmark scans returned `[]` even in dense cities. Two stacked bugs: Grok echoed `Name (type)` and exact OSM-name matching dropped every row; Overpass fallback treated `overpass.osm.ch` 200-with-zero-elements as "nothing nearby" after the global mirrors failed. Candidates now label `name=` vs `type=` separately; empty Overpass bodies skip to the next endpoint.

## v1.6.2 — 2026-07-07

- Adjustable search range slider (250 m–2000 m) to control how far Wondereye looks for landmarks
- "My Map Contributions": see the landmarks you've discovered for the community map
- Quick link to the community landmark map, plus a "Become a Supporter!" button
- Settings reorganized with search range at the top

- Even Hub submission review fixes

## Worker — 2026-07-04 (map API)

- `/api/map` aggregates landmark records from KV list metadata instead of one `get()` per key — stays under the Workers subrequest cap as the crowdsourced dataset grows; legacy keys are lazily migrated (read once, rewritten with metadata, old key deleted)
- `mapplace:` records are keyed by name **and** rounded coordinates, so same-named places worldwide (Trinity Church, City Hall, …) no longer overwrite each other on the public map
- Writes no longer bust `map-cache`; the aggregated map response now simply expires on its 1-hour TTL

## v1.6.0 — 2026-07-03

- Voice search: tap the "[ Voice Search ]" row in the list to speak a landmark name or ask "what am I looking at?" — declares the `g2-microphone` permission
- Double-tap on the list or error view opens the system exit dialog (`shutDownPageContainer(1)`), per the official submission guidelines; hardware is released in the `SYSTEM_EXIT_EVENT` handler after the user confirms
- "[ Refresh ]" action row at the end of the landmark list re-scans the area
- IMU (compass) reporting is disabled when the app goes to the background or exits, re-enabled on return; the current view re-renders on foreground-enter once landmarks are loaded
- EHPK bundle no longer ships the phone-web-only homepage and map pages, removing non-whitelisted URLs (Leaflet/CARTO/OSM) flagged by store review
- Settings page re-declared in app.json so the units toggle is reachable from EvenHub
- Bridge init falls back to the SDK singleton again when the ready event never fires, with a clearer error if the glasses are truly disconnected

## v1.5.0 — 2026-07-02

- Real device location via the official Even Hub SDK 0.0.11 `getAppLocation` API — the phone's GPS fix is delivered through the bridge, replacing the blocked WebView geolocation
- Landmarks now load for your actual surroundings; cached-fix and Prague fallbacks retained for offline/denied cases
- Requires Even app with SDK 0.0.11 support (`min_sdk_version` bumped)

## v1.3.5 — 2026-04-06

- Compass direction (N, NE, E, SE…) to the selected landmark shown in the list footer
- Recently viewed landmarks tracked in the settings screen
- Imperial/metric unit toggle, applied to distances and AI detail responses
- Security: input sanitization on Grok requests; rate limiting on new API endpoints
- Glasses and App UI bug fixes and improvements

## v1.0.0 — 2026-03-02

Initial release.

**Features**
- Nearby landmark discovery via OpenStreetMap — up to 5 ranked by significance
- Instant AI snippets for each landmark powered by Grok
- Full details on demand — Grok is explicitly instructed to look up each landmark in Grokipedia for accurate, factual information
- Paginated reading view for longer articles
- City name displayed in footer once location resolves

**Navigation**
- Tap a landmark to read a snippet, tap again to load full details
- Double tap to go back from any view
