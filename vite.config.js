import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // injectManifest lets us write our own service worker (src/sw.js).
      // vite-plugin-pwa will inject the Workbox precache manifest into it
      // at build time, giving us full control over SW logic (e.g. the
      // 2-hour notification timer) while still getting offline caching.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.js",
      includeAssets: ["apple-touch-icon.png"],
      // Without this, "Add to Home Screen" only ever appears on the real
      // deployed build — npm run dev disables the service worker/manifest
      // by default. This turns it on locally too, so it can be tested
      // without a full build+deploy cycle every time.
      devOptions: {
        enabled: true,
        type: "module",
      },
      manifest: {
        name: "Hunter System",
        short_name: "Hunter",
        description: "A Solo-Leveling-inspired personal progression tracker.",
        theme_color: "#0a0507",
        background_color: "#0a0507",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      // injectManifest mode: workbox config for the runtime caching entries
      // that get injected alongside the precache manifest in sw.js
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
      },
    }),
  ],
});