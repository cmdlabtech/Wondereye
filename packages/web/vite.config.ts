import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type HtmlTagDescriptor, type Plugin } from "vite";

function preloadGlobeEngine(): Plugin {
  return {
    name: "preload-globe-engine",
    apply: "build",
    transformIndexHtml(_html, ctx) {
      if (!ctx.bundle) return [];
      const tags: HtmlTagDescriptor[] = [];
      for (const [file, chunk] of Object.entries(ctx.bundle)) {
        if (chunk.type !== "chunk") continue;
        if (!file.includes("globe-engine")) continue;
        tags.push({
          tag: "link",
          attrs: {
            rel: "modulepreload",
            crossorigin: "",
            href: `/${file}`,
          },
          injectTo: "head",
        });
      }
      return tags;
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), preloadGlobeEngine()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5174,
  },
  optimizeDeps: {
    include: ["three", "three/addons/controls/OrbitControls.js"],
  },
});
