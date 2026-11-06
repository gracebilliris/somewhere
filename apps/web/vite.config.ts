import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const base = process.env.VITE_BASE_PATH || "/somewhere/";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      injectRegister: null,
      scope: base,
      manifest: {
        id: base,
        name: "Somewhere — good places, good company",
        short_name: "Somewhere",
        description: "Your little guidebook of places worth going.",
        start_url: base,
        scope: base,
        display: "standalone",
        background_color: "#f7f6f2",
        theme_color: "#435b48",
        lang: "en",
        icons: [
          {
            src: `${base}icons/icon-192.png`,
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: `${base}icons/icon-512.png`,
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: `${base}icons/icon-maskable-512.png`,
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        cacheId: "somewhere",
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{js,css,html,svg,png,webp,json}"],
        navigateFallback: `${base}index.html`,
        navigateFallbackAllowlist: [
          new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
        ],
        runtimeCaching: [],
      },
    }),
  ],
  envDir: "../..",
  base,
  server: { port: 5186 },
});
