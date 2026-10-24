import { readdirSync, readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

// Emits manifest.json (with package.json's version stamped in, so package.json
// is the single source of truth for the version) and the PNG icons into dist/.
function extensionFiles(): Plugin {
  return {
    name: "extension-files",
    generateBundle() {
      const pkg = JSON.parse(readFileSync("package.json", "utf8"));
      const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
      manifest.version = pkg.version;
      this.emitFile({ type: "asset", fileName: "manifest.json", source: JSON.stringify(manifest, null, 2) + "\n" });

      for (const file of readdirSync("icons").filter((f) => f.endsWith(".png"))) {
        this.emitFile({ type: "asset", fileName: `icons/${file}`, source: readFileSync(`icons/${file}`) });
      }
    },
  };
}

const PLACEHOLDER_FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#8a8a8a" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z"/></svg>`;

// `npm run dev:web`: serves the pages as a normal website backed by a fake
// chrome API with sample bookmarks (src/dev/webPreview.ts), plus a
// placeholder for Chrome's extension-only /_favicon/ endpoint.
function webPreview(): Plugin {
  return {
    name: "web-preview",
    apply: (_config, { command, mode }) => command === "serve" && mode === "web",
    transformIndexHtml: () => [
      { tag: "script", attrs: { type: "module", src: "/src/dev/webPreview.ts" }, injectTo: "head-prepend" },
    ],
    configureServer(server) {
      server.middlewares.use("/_favicon/", (_req, res) => {
        res.setHeader("Content-Type", "image/svg+xml");
        res.end(PLACEHOLDER_FAVICON);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), extensionFiles(), webPreview()],
  // The project root holds docs and icons/icon.svg; nothing should be copied from it wholesale.
  publicDir: false,
  server: {
    open: "/src/newtab/newtab.html",
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // HTML entries keep their source paths in dist/ (dist/src/newtab/newtab.html),
    // matching the paths manifest.json already points at.
    rolldownOptions: {
      input: {
        newtab: "src/newtab/newtab.html",
        options: "src/options/options.html",
      },
    },
    // Chrome supports modulepreload natively; the polyfill is dead weight here.
    modulePreload: { polyfill: false },
  },
  test: {
    environment: "jsdom",
  },
});
