# Changelog

## v1.3.5 — 2026-04-06

- Compass direction (N, NE, E, SE…) to the selected landmark shown in the list footer
- Recently viewed landmarks tracked in the settings screen
- Imperial/metric unit toggle, applied to distances and AI detail responses
- Security: input sanitization on Grok requests; rate limiting on new API endpoints

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
