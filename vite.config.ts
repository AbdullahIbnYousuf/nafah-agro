import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { VitePWA, type VitePWAOptions } from "vite-plugin-pwa";
import path from "path";

export const pwaOptions: Partial<VitePWAOptions> = {
  registerType: "prompt",
  injectRegister: null,
  includeManifestIcons: false,
  manifest: {
    id: "/",
    name: "নাফাহ এগ্রো",
    short_name: "নাফাহ এগ্রো",
    description: "নাফাহ এগ্রোর অনলাইন দোকান ও ব্যবসা পরিচালনা",
    lang: "bn",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#FFF9E5",
    theme_color: "#004030",
    icons: [
      { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-192x192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/pwa-512x512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  },
  workbox: {
    cleanupOutdatedCaches: true,
    clientsClaim: false,
    skipWaiting: false,
    globPatterns: ["**/*.{js,css,html,ico,png,avif,jpg,woff,woff2}"],
    navigateFallback: "/index.html",
    navigateFallbackDenylist: [/^\/api\//],
    runtimeCaching: [
      {
        urlPattern: /^https?:\/\/[^/]+\/api\//,
        handler: "NetworkOnly",
        method: "GET",
      },
    ],
  },
};

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
    allowedHosts: true as const,
    hmr: {
      overlay: false,
    },
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  plugins: [react(), VitePWA(pwaOptions)],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
