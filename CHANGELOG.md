# Changelog

## Unreleased

### Map (wondereye.app/map)
- The globe image is now a smaller WebP file (about 310 KB instead of 1.3 MB) and is downloaded once, so the map opens faster, especially on mobile networks.
- Each selected place now has its own link (for example `wondereye.app/map?p=tour-eiffel`) that opens that place directly, and the browser tab shows the place name.
- Shared links now display a title, a description, and a preview image.
- A row at the bottom of the map links to an introduction to Wondereye, the Even Realities G2 website, the Support page, and the OpenStreetMap attribution.
- The home page now explains that Wondereye is an app for Even Realities G2 glasses that shows notes as text on the glasses display, and credits OpenStreetMap for place data.
- The Wondereye name in the map header now has a backdrop so it remains readable over the globe.
- Site files now use longer browser caching where safe, and the map's offline list of places is refreshed at each release.

## v1.7.0 - 2026-10-07

### Languages
- Wondereye is now available in English, German, French, Spanish, Italian, Simplified Chinese, Japanese, and Korean. The glasses display, the phone settings page, the feedback form, and error messages are shown in your language.
- The language is selected automatically from the Even Realities App or phone language and defaults to English when your language is not supported. You may choose a different language at any time under Settings > Language.
- Landmark descriptions are written by Grok directly in the selected language. Place names are kept in their local or official form, and the same accuracy rules apply in every language. No Wikipedia text is used in descriptions.
- Text on the glasses is now measured against the glasses font, so longer words and Chinese, Japanese, and Korean characters fit each line and page without being cut off.
- Dates are shown in the format of your language. Metric units are the default for languages other than English until you choose a unit.
- Only English descriptions are added to the community map at this time.

### Phone settings
- The settings page has a more compact layout and now fits on a single phone screen. Glasses connection and location status are shown as icons with a colored status indicator in the title bar, and the full status is available as a tooltip. Settings are grouped in one card with a language menu, an inline range slider, a units selector, and a device location switch, and My Map Contributions and Send Feedback are collapsed rows at the bottom.

### Feedback
- A Send Feedback form is now available in the phone settings page and on the wondereye.app map. You may report a bug, suggest an idea, or share other comments without providing an email address or creating an account.
- Submitted feedback is posted to the public Wondereye issue tracker on GitHub for review. Please do not include personal information in your message.
- Submissions are protected by Cloudflare Turnstile verification and rate limits to prevent abuse.

### Platform
- The network allowlist now includes Cloudflare Turnstile (`challenges.cloudflare.com`), which is required for feedback verification.
- Wondereye 1.7.0 requires Even Realities App 2.2.9 or later.

## v1.6.5 - 2026-09-26

### Landmark reliability
- Nearby landmarks now load reliably when public map data servers are busy or unavailable. Wondereye queries Wikipedia and OpenStreetMap together and combines the results, so a slow or unavailable source no longer prevents landmarks from appearing.
- Landmark searches complete within about 8 seconds in the worst case, and the app stops waiting after 30 seconds.
- When a lookup cannot be completed, the glasses show a clear message with guidance, for example "Landmark service is busy. Tap to retry in a moment.", instead of a technical error code.
- The phone screen shows your coordinates as soon as your location is found and indicates when a landmark lookup has failed, rather than remaining on "Getting location...".
- Landmark descriptions are written by Grok. Wikipedia is used only to find nearby places, and no Wikipedia text is used in descriptions. Descriptions are two or three concise sentences, and details that cannot be confirmed, such as uncertain dates, figures, or names, are left out.

### Glasses experience
- Opening and closing the system menu no longer pauses the compass or cancels a voice search in progress.
- Tapping to retry after an error now shows the loading screen immediately while the new lookup runs.

### Platform
- Updated to Even Hub SDK 0.0.14 and Even Hub CLI 0.1.14.
- Wondereye 1.6.5 requires Even Realities App 2.2.9 or later.

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
