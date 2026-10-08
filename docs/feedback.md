# Submit Feedback → GitHub issues

Public users (the `/map` site and the glasses app's phone settings page) can send
short feedback. The Worker filters it and, only if every check passes, opens a
GitHub issue on `cmdlabtech/Wondereye`.

**This is deliberately not a webhook-to-bot flow.** No public request wakes a
bot or runs an agent. The Worker only writes an issue; the repo has no GitHub
Actions workflows, so issue creation triggers nothing. Bots should read
already-filtered issues (`label:feedback label:needs-triage`) on their own
schedule.

## Request flow (`packages/worker/src/feedback.ts`)

Every check runs server-side, in this order, before any GitHub call:

| # | Check | Failure |
|---|-------|---------|
| 1 | Kill switch `FEEDBACK_ENABLED === "true"` | 503 |
| 2 | Both secrets present (fail closed) | 503 |
| 3 | `Content-Type: application/json` | 415 |
| 4 | Body ≤ 6 KB (header and actual bytes) | 413 |
| 5 | Strict schema: only `category, message, title, source, page, appVersion, turnstileToken, elapsedMs, website`. Unknown keys (e.g. `email`) are rejected. Category `bug/idea/other`, source `map/app`, message 10–2000 chars, title ≤ 80, page `/path` only, appVersion `x.y.z`. HTML tags and control/bidi characters are stripped; more than 1 link is rejected | 400 |
| 6 | `Origin` must be in `ALLOWED_ORIGIN` (e.g. `https://wondereye.app`). Loopback (`http://127.0.0.1:*`, `http://localhost:*`) is accepted only for `source: "app"` (the EHPK WebView) | 403 |
| 7 | Honeypot `website` must be empty | fake `200 {ok:true}` |
| 8 | Time on form 3 s – 2 h (`elapsedMs`) | 400 |
| 9 | Rate limit per IP: 3/hour, 10/day; global 50 issues/day (KV, keys use a salted SHA-256 of the IP, never the raw IP) | 429 |
| 10 | Duplicate (normalized message hash seen in last 24 h) | fake `200 {ok:true}` |
| 11 | Turnstile siteverify, including `hostname` ∈ `TURNSTILE_HOSTNAMES` | 403 |
| 12 | `POST /repos/{FEEDBACK_REPO}/issues` (only 201 counts) | 502 |

Clients only ever see generic messages. The issue contains: category, source +
page, app version, truncated user agent, and the message inside a code fence
(neutralizes markdown, links, images, and @mentions). **No IP or email is ever
written to the issue.** Labels: `feedback`, `needs-triage`, `source:map` |
`source:app`.

Notes: KV is eventually consistent, so the hour/day limits are approximate
under bursts; the global daily cap bounds the worst case. (The Workers Rate
Limiting binding only supports 10 s / 60 s windows.)

## Bindings (the required ones are set in production as of Oct 7, 2026)

Worker `wondereye-api` (`packages/worker/wrangler.jsonc` stays gitignored):

| Name | Kind | Value / scope |
|------|------|---------------|
| `TURNSTILE_SECRET` | secret (`wrangler secret put`) | Secret key of a Turnstile widget (Managed mode) whose hostnames are `wondereye.app` (+ any app origin you choose, see below) |
| `GITHUB_FEEDBACK_TOKEN` | secret | Fine-grained PAT, **Repository access: only `cmdlabtech/Wondereye`**, **Permissions: Issues → Read and write** (Metadata read is added automatically). Nothing else. Set an expiry. |
| `FEEDBACK_ENABLED` | var | `"true"` to turn the endpoint on (absent = 503) |
| `TURNSTILE_HOSTNAMES` | var (optional) | Comma list of hostnames siteverify may report. Default `wondereye.app`; production sets `wondereye.app,127.0.0.1` so the glasses app (loopback origin) can submit |
| `FEEDBACK_REPO` | var (optional) | Default `cmdlabtech/Wondereye` |
| `FEEDBACK_DRY_RUN` | var (local only) | `"true"` logs the issue instead of calling GitHub |
| `ALLOWED_ORIGIN` | var (existing) | Must include `https://wondereye.app` |
| `LANDMARKS_CACHE` | KV (existing) | Reused for rate-limit / dedupe keys (`fb:*`, short TTLs) |

Site / app build time:

| Name | Where | Value |
|------|-------|-------|
| `VITE_TURNSTILE_SITEKEY` | `packages/web` and `packages/frontend` builds | Public sitekey of the widget. Defaults to the production key `0x4AAAAAAFQyWWYVPcIJm6E7` (widget hostnames `wondereye.app`, `127.0.0.1`). For local preview override with Cloudflare's test key `1x00000000000000000000AA`. |
| `VITE_FEEDBACK_API` | `packages/web` (optional) | Default `https://api.wondereye.app` |

Recommended before enabling: pre-create the labels `feedback`,
`needs-triage`, `source:map`, `source:app` on the repo.

Feedback becomes a **public** GitHub issue (the repo is public); both forms
say so.

## Glasses app (EHPK) caveats

- `app.json` network whitelist gains `https://challenges.cloudflare.com`
  (Turnstile script + iframe). `https://api.wondereye.app` was already listed.
  This is a manifest permission change subject to Even Hub store review.
- The EHPK page runs on a loopback origin (`http://127.0.0.1:<port>`).
  Turnstile validates the page hostname, so the widget would need `127.0.0.1`
  in its hostname list and in `TURNSTILE_HOSTNAMES`, which Cloudflare advises
  against for production widgets (a separate app-only widget limits the blast
  radius). Alternative: have the app link to a hosted `wondereye.app` feedback
  form instead of an in-app widget. Needs on-device verification either way.
- The site CSP (`packages/frontend/public/_headers`) allows
  `https://challenges.cloudflare.com` in `script-src` and `frame-src`.

## Local preview (never real GitHub)

```bash
# packages/worker/.dev.vars  (gitignored — never commit)
XAI_API_KEY=unused
ALLOWED_ORIGIN=http://localhost:5174,http://localhost:5173
FEEDBACK_ENABLED=true
FEEDBACK_DRY_RUN=true
TURNSTILE_SECRET=1x0000000000000000000000000000000AA   # Cloudflare test secret
GITHUB_FEEDBACK_TOKEN=dry-run
TURNSTILE_HOSTNAMES=localhost,example.com

cd packages/worker && npx wrangler dev --port 8787
cd packages/web && VITE_TURNSTILE_SITEKEY=1x00000000000000000000AA VITE_FEEDBACK_API=http://localhost:8787 npm run dev
```
