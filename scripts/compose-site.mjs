import { execSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webDist = join(root, "packages/web/dist");
const frontDist = join(root, "packages/frontend/dist");

execSync("npm run build --workspace=packages/web", { cwd: root, stdio: "inherit" });
execSync("npm run build --workspace=packages/frontend", { cwd: root, stdio: "inherit" });

if (!existsSync(webDist) || !existsSync(frontDist)) {
  throw new Error("Build packages/web and packages/frontend before composing the site.");
}

cpSync(join(webDist, "index.html"), join(frontDist, "index.html"));
cpSync(join(webDist, "assets"), join(frontDist, "assets"), { recursive: true });

for (const name of readdirSync(webDist)) {
  if (name === "assets" || name === "index.html") continue;
  cpSync(join(webDist, name), join(frontDist, name), { recursive: true });
}

// Refresh the globe's fallback snapshot from the live API so the first paint
// (and any API outage) shows the current pin set, not the one committed to git.
// Read-only GET; on any failure the committed packages/web/public copy ships.
await refreshSnapshot(join(frontDist, "landmarks.json"));

const oldMap = join(frontDist, "map.html");
if (existsSync(oldMap)) rmSync(oldMap);

console.log("Composed globe SPA over frontend dist (app.html preserved).");

async function refreshSnapshot(target) {
  const committed = JSON.parse(readFileSync(target, "utf8")).landmarks ?? [];
  try {
    const res = await fetch("https://api.wondereye.app/api/map", { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const list = Array.isArray(data?.landmarks) ? data.landmarks : [];
    const valid = list.filter(
      (m) => m && typeof m.name === "string" && m.name && Number.isFinite(m.lat) && Number.isFinite(m.lng),
    );
    // Guard against shipping a truncated list (e.g. a cold KV read mid-migration).
    if (valid.length < Math.max(1, Math.floor(committed.length * 0.8))) {
      throw new Error(`only ${valid.length} valid pins vs ${committed.length} committed`);
    }
    const slim = valid.map(({ name, type, lat, lng, snippet }) => ({ name, type, lat, lng, snippet: snippet ?? "" }));
    writeFileSync(target, JSON.stringify({ landmarks: slim }));
    console.log(`Snapshot refreshed from /api/map: ${slim.length} pins (was ${committed.length} in git).`);
  } catch (err) {
    console.warn(`Snapshot refresh skipped, shipping committed copy (${committed.length} pins): ${err.message}`);
  }
}
