#!/usr/bin/env node
// Lists every http(s) URL literal in a built .ehpk folder and fails if its
// origin isn't in app.json's network whitelist. Even Hub's review scanner
// flags such literals, so we check before packing.
// Usage: node scripts/check-ehpk-urls.mjs <app.json> <build dir>
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const [manifestPath, dir] = process.argv.slice(2);
if (!manifestPath || !dir) {
  console.error('usage: check-ehpk-urls.mjs <app.json> <build dir>');
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const net = (manifest.permissions || []).find((p) => p.name === 'network');
const allowed = new Set((net?.whitelist || []).map((u) => new URL(u).origin));

const files = [];
(function walk(d) {
  for (const name of readdirSync(d)) {
    const p = join(d, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (['.js', '.html', '.css', '.json', '.mjs'].includes(extname(p))) files.push(p);
  }
})(dir);

const found = new Map();
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  for (const m of text.matchAll(/https?:\/\/[^\s"'`<>()\\]+/g)) {
    const url = m[0].replace(/&amp;/g, '&');
    found.set(url, f.slice(dir.length + 1));
  }
}

let bad = 0;
for (const [url, file] of [...found].sort()) {
  let origin = '';
  try { origin = new URL(url.replace(/\$\{[^}]*\}?/g, 'x')).origin; } catch { /* not parseable */ }
  const ok = allowed.has(origin) && !/\$\{/.test(new URL(url.replace(/\$\{[^}]*\}?/g, 'x')).host);
  if (!ok) bad++;
  console.log(`${ok ? 'whitelisted' : 'NOT WHITELISTED'}  ${url}  (${file})`);
}
const unused = [...allowed].filter((o) => ![...found.keys()].some((u) => u.startsWith(o)));
for (const o of unused) console.log(`whitelist entry with no literal in bundle: ${o}`);
if (bad) {
  console.error(`\n${bad} URL literal(s) not covered by network.whitelist`);
  process.exit(1);
}
