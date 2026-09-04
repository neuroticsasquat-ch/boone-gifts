/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";

export default defineConfig({
  build: {
    sourcemap: true,
  },
  plugins: [
    react(),
    tailwindcss(),
    sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      disable: !process.env.SENTRY_AUTH_TOKEN,
    }),
  ],
  server: {
    host: "0.0.0.0",
    port: 5173,
    hmr: {
      protocol: "wss",
      clientPort: 443,
    },
    allowedHosts: ["web--boone-gifts--tom.coder.neuroticsasquat.ch"]
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    // MSW handlers match this exact origin, so pin it rather than inheriting
    // whatever VITE_API_URL a local .env happens to set (e.g. a Coder
    // workspace's API subdomain).
    env: {
      VITE_API_URL: "https://boone-gifts-api.localhost",
    },
  },
});
