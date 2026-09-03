import { execSync } from "node:child_process";
import { cpSync, existsSync, readdirSync } from "node:fs";
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
  cpSync(join(webDist, name), join(frontDist, name));
}

console.log("Composed globe SPA over frontend dist (app.html preserved).");
