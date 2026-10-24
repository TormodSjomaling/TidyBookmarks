import { readdirSync, readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import { placeholderFavicon } from "./src/dev/placeholderFavicon";

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

// `npm run dev:web`: serves the pages as a normal website backed by a fake
// chrome API with sample bookmarks (src/dev/webPreview.ts), plus a
// stand-in for Chrome's extension-only /_favicon/ endpoint.
function webPreview(): Plugin {
  return {
    name: "web-preview",
    apply: (_config, { command, mode }) => command === "serve" && mode === "web",
    transformIndexHtml: () => [
      { tag: "script", attrs: { type: "module", src: "/src/dev/webPreview.ts" }, injectTo: "head-prepend" },
    ],
    configureServer(server) {
      server.middlewares.use("/_favicon/", (req, res) => {
        const pageUrl = new URL(req.url ?? "", "http://localhost").searchParams.get("pageUrl") ?? "";
        res.setHeader("Content-Type", "image/svg+xml");
        res.end(placeholderFavicon(pageUrl));
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
